#!/usr/bin/env ts-node
import { execSync } from "child_process";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

// ─── Types ───────────────────────────────────────────────────────────────────

interface DateObj {
  year?: number;
  month?: number;
  day?: number;
}

interface Experience {
  companyName?: string;
  title?: string;
  timePeriod?: { startDate?: DateObj; endDate?: DateObj };
  company?: { employeeCountRange?: { start?: number; end?: number }; industries?: string[] };
  locationName?: string;
}

interface Education {
  schoolName?: string;
  degreeName?: string;
  fieldOfStudy?: string;
  timePeriod?: { startDate?: DateObj; endDate?: DateObj };
}

interface ProfileData {
  firstName?: string;
  lastName?: string;
  headline?: string;
  locationName?: string;
  experience?: Experience[];
  education?: Education[];
}

interface FetchResult {
  profile?: ProfileData;
  contact?: Record<string, unknown>;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const divider = (char = "─", width = 52) => console.log(char.repeat(width));
const section = (title: string) => {
  console.log(`\n  ${title.toUpperCase()}`);
  console.log("  " + "─".repeat(title.length + 2));
};

function formatYear(date?: DateObj): string | null {
  return date?.year ? String(date.year) : null;
}

function companyAge(founded?: number): string {
  if (!founded) return "—";
  return `${new Date().getFullYear() - founded} years`;
}

// ─── Fetch data via Python subprocess ────────────────────────────────────────

function fetchProfile(url: string): FetchResult {
  const script = path.join(__dirname, "fetch_profile.py");
  try {
    const output = execSync(`python3 "${script}" "${url}"`, {
      env: process.env,
      timeout: 30000,
    }).toString();
    return JSON.parse(output);
  } catch (err: any) {
    const msg = err.stdout?.toString() || err.message || "Unknown error";
    try {
      return JSON.parse(msg);
    } catch {
      return { error: msg };
    }
  }
}

// ─── Crunchbase lookup (optional) ────────────────────────────────────────────

function getFoundedCrunchbase(companyName: string): number | null {
  const key = process.env.CRUNCHBASE_API_KEY;
  if (!key || !companyName) return null;
  try {
    const body = JSON.stringify({
      field_ids: ["name", "founded_on"],
      query: [{ type: "predicate", field_id: "name", operator_id: "contains", values: [companyName] }],
      limit: 1,
    });
    const out = execSync(
      `curl -s -X POST "https://api.crunchbase.com/api/v4/searches/organizations" \
       -H "X-cb-user-key: ${key}" -H "Content-Type: application/json" \
       -d '${body.replace(/'/g, "'\\''")}'`,
      { timeout: 10000 }
    ).toString();
    const data = JSON.parse(out);
    const founded = data?.entities?.[0]?.properties?.founded_on;
    if (typeof founded === "string") return parseInt(founded.slice(0, 4));
    if (typeof founded === "object") return parseInt(String(founded?.value).slice(0, 4));
  } catch { /* optional */ }
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const url = process.argv[2]?.trim();

  if (!url) {
    console.log("Usage: npx ts-node src/screen.ts <linkedin_profile_url>");
    process.exit(1);
  }

  if (!process.env.LINKEDIN_USER || !process.env.LINKEDIN_PASS) {
    console.error("❌  LINKEDIN_USER and LINKEDIN_PASS must be set.");
    console.error("    Create a .env file or export them before running.");
    process.exit(1);
  }

  console.log();
  divider("═");
  console.log("  🏠  HACKERHOUSE SCREENER");
  divider("═");
  console.log(`  Fetching: ${url}`);
  divider();

  const result = fetchProfile(url);

  if (result.error) {
    console.error(`❌  ${result.error}`);
    process.exit(1);
  }

  const p = result.profile!;
  const name = [p.firstName, p.lastName].filter(Boolean).join(" ") || "Unknown";
  const headline = p.headline || "";
  const location = p.locationName || "";

  console.log(`\n  👤  ${name}`);
  if (headline) console.log(`      ${headline}`);
  if (location) console.log(`      📍 ${location}`);

  // ── Current company ──────────────────────────────────────────────
  const experiences = p.experience || [];
  const current = experiences.find((e) => !e.timePeriod?.endDate);

  let companyFounded: number | null = null;

  if (current) {
    const name_ = current.companyName || "—";
    const title = current.title || "—";
    const startY = formatYear(current.timePeriod?.startDate) || "";
    const industries = current.company?.industries?.join(", ") || "—";
    const sizeRange = current.company?.employeeCountRange;
    const size = sizeRange ? `${sizeRange.start}–${sizeRange.end}` : "—";

    // Try Crunchbase for founding year
    companyFounded = getFoundedCrunchbase(name_);

    section("Current Company");
    console.log(`  Company   : ${name_}`);
    console.log(`  Title     : ${title}`);
    console.log(`  Founded   : ${companyFounded ?? "—"}`);
    console.log(`  Age       : ${companyAge(companyFounded ?? undefined)}`);
    console.log(`  Size      : ${size}`);
    console.log(`  Industry  : ${industries}`);
  } else {
    section("Current Company");
    console.log("  No current position found.");
  }

  // ── Experience ───────────────────────────────────────────────────
  section("Experience");
  if (experiences.length) {
    for (const exp of experiences) {
      const co = exp.companyName || "—";
      const title = exp.title || "—";
      const startY = formatYear(exp.timePeriod?.startDate);
      const endDate = exp.timePeriod?.endDate;
      const endY = endDate ? formatYear(endDate) : "present";
      const years = startY ? `${startY} – ${endY}` : (endY || "");
      const tag = !exp.timePeriod?.endDate ? " ← current" : "";
      console.log(`  • ${title} @ ${co}  [${years}]${tag}`);
    }
  } else {
    console.log("  No experience listed.");
  }

  // ── Education ────────────────────────────────────────────────────
  section("Education");
  const education = p.education || [];
  if (education.length) {
    for (const edu of education) {
      const school = edu.schoolName || "—";
      const deg = [edu.degreeName, edu.fieldOfStudy].filter(Boolean).join(", ") || "—";
      const startY = formatYear(edu.timePeriod?.startDate);
      const endY = formatYear(edu.timePeriod?.endDate);
      const years = startY ? `${startY} – ${endY || ""}` : "";
      console.log(`  • ${school}`);
      console.log(`    ${deg}${years ? "  (" + years + ")" : ""}`);
    }
  } else {
    console.log("  No education listed.");
  }

  console.log();
  divider("═");
  console.log();
}

main().catch((e) => {
  console.error("❌ ", e.message);
  process.exit(1);
});
