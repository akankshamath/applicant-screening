import express, { Request, Response } from 'express';
import axios, { AxiosInstance } from 'axios';
import path from 'path';
import dotenv from 'dotenv';
import Exa from 'exa-js';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();
app.use(express.json());

// Rate limiting: max 30 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/screen', limiter);

const LI_AT_ENV = process.env.LI_AT_COOKIE || '';
const EXA_API_KEY = process.env.EXA_API_KEY || '';
const PORT = parseInt(process.env.PORT || '5055');

let exaClient: Exa | null = null;
if (EXA_API_KEY) {
  exaClient = new Exa(EXA_API_KEY);
}

const LINKEDIN_BASE = 'https://www.linkedin.com';

// TypeScript interfaces for better type safety
interface TimePeriod {
  startDate?: { year?: number; month?: number };
  endDate?: { year?: number; month?: number };
  start?: { year?: number; month?: number };
  end?: { year?: number; month?: number };
}

interface LinkedInPosition {
  companyName?: string;
  title?: string;
  timePeriod?: TimePeriod;
  dateRange?: TimePeriod;
  company?: {
    universalName?: string;
    miniCompany?: {
      universalName?: string;
    };
  };
}

interface LinkedInEducation {
  schoolName?: string;
  school?: {
    schoolName?: string;
  };
  degreeName?: string;
  degree?: string;
  fieldOfStudy?: string;
  activities?: string;
  grade?: string;
  timePeriod?: TimePeriod;
  dateRange?: TimePeriod;
  [key: string]: unknown; // Allow other fields we might not know about
}

interface LinkedInProfile {
  firstName?: string;
  lastName?: string;
  headline?: string;
  geoLocationName?: string;
  locationName?: string;
  location?: {
    defaultLocalizedName?: string;
  };
}

interface LinkedInProfileData {
  profile: LinkedInProfile;
  positions: LinkedInPosition[];
  educations: LinkedInEducation[];
}

interface CompanyData {
  foundedOn?: { year?: number };
  staffCount?: number;
  companyIndustries?: Array<{ localizedName?: string }>;
}

interface Education {
  school: string | null;
  degree: string | null;
  field: string | null;
  start: number | null;
  end: number | null;
}

interface Experience {
  company: string | null;
  title: string | null;
  start: number | null;
  end: number | null;
  current: boolean;
}

interface CurrentCompany {
  name: string | null;
  founded?: string | number | null;
  age_years?: number | null;
  size?: string | null;
  industry?: string | null;
  position_start?: { month?: number; year?: number } | null;
}

interface ProfileResponse {
  name: string;
  headline: string | null;
  location: string | null;
  education: Education[];
  experiences: Experience[];
  current_company: CurrentCompany;
  source?: string;
}

// Session cache — one AxiosInstance per li_at cookie value
const sessionCache = new Map<string, AxiosInstance>();

async function buildSession(liAt: string): Promise<AxiosInstance> {
  const cached = sessionCache.get(liAt);
  if (cached) return cached;

  // Validate the cookie by checking if we can access /voyager/api/me
  let jsession = 'ajax:0';
  try {
    const resp = await axios.get(`${LINKEDIN_BASE}/voyager/api/me`, {
      headers: {
        Cookie: `li_at=${liAt}`,
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    // Check if we got redirected (cookie invalid)
    if (resp.status === 302 || resp.status === 301) {
      throw new Error('LinkedIn cookie expired or invalid. Please update your li_at cookie.');
    }

    const setCookies: string[] = ([] as string[]).concat(resp.headers['set-cookie'] ?? []);
    const jsessionRaw = setCookies.find((c) => c.includes('JSESSIONID'));
    const match = jsessionRaw?.match(/JSESSIONID=("?[^;,]+)/);
    if (match) jsession = match[1].replace(/"/g, '');
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 403) {
        throw new Error(
          'LinkedIn cookie rejected (403 Forbidden). Your li_at cookie may be expired, invalid, or LinkedIn detected automated access. ' +
          'Get a fresh cookie: 1) Go to linkedin.com while logged in, 2) Open DevTools (F12), 3) Application → Cookies → linkedin.com, ' +
          '4) Copy the "li_at" value, 5) Update your .env file'
        );
      }
      if (error.response?.status === 401) {
        throw new Error(
          'LinkedIn cookie unauthorized (401). Your cookie has expired. Get a fresh li_at cookie from linkedin.com.'
        );
      }
      if (error.message.includes('redirects')) {
        throw new Error('LinkedIn cookie expired or invalid. Please get a fresh li_at cookie from linkedin.com.');
      }
    }
    throw error;
  }

  const csrfToken = jsession;
  const client = axios.create({
    baseURL: `${LINKEDIN_BASE}/voyager/api`,
    headers: {
      Cookie: `li_at=${liAt}; JSESSIONID="${jsession}"`,
      'Csrf-Token': csrfToken,
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/vnd.linkedin.normalized+json+2.1',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Li-Lang': 'en_US',
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });

  sessionCache.set(liAt, client);
  return client;
}

function extractPublicId(url: string): string {
  return url.replace(/\/$/, '').split('/').pop()?.split('?')[0] ?? '';
}

async function getLinkedInProfile(linkedinUrl: string, client: AxiosInstance): Promise<LinkedInProfileData> {
  const publicId = extractPublicId(linkedinUrl);
  const resp = await client.get(
    `/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(publicId)}` +
      `&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93`,
  );

  // Response is normalized JSON: { data: {...}, included: [...entities] }
  interface LinkedInEntity {
    $type?: string;
    [key: string]: unknown;
  }

  const included: LinkedInEntity[] = resp.data?.included ?? [];

  const find = (type: string): LinkedInEntity[] =>
    included.filter((e) => (e.$type ?? '').includes(type));

  const profile = find('identity.profile.Profile')[0] as LinkedInProfile ?? {};
  const positions = find('identity.profile.Position') as LinkedInPosition[];
  const educations = find('identity.profile.Education') as LinkedInEducation[];

  return { profile, positions, educations };
}

async function getCompanyDetails(universalName: string, client: AxiosInstance): Promise<CompanyData | null> {
  if (!universalName) return null;
  try {
    const resp = await client.get(
      `/organization/companies?q=universalName&universalName=${encodeURIComponent(universalName)}` +
        `&decorationId=com.linkedin.voyager.deco.organization.web.WebFullCompanyMain-12`,
    );
    const elements: CompanyData[] = resp.data?.elements ?? [];
    return elements[0] ?? null;
  } catch {
    return null;
  }
}

// Try to get LinkedIn profile data using Exa AI
async function getProfileWithExa(linkedinUrl: string): Promise<ProfileResponse> {
  if (!exaClient) {
    throw new Error('Exa API key not configured');
  }

  try {
    // Use Exa to search for and retrieve content from the LinkedIn URL
    const result = await exaClient.getContents([linkedinUrl], {
      text: true,
    });

    // Log only essential info, not full API response (may contain sensitive data)
    console.log('Exa: API call successful');

    if (!result.results || result.results.length === 0) {
      console.log('Exa: No results returned (profile may be private/restricted or URL invalid)');
      throw new Error('No results from Exa - profile may be private or unavailable');
    }

    const content = result.results[0];
    const text = content.text || '';

    // Parse the text to extract structured data
    const name = (content.title || 'Unknown').split('|')[0].trim();

    // Extract location (appears before connections line) - handles both "City, State" and "City (CODE)"
    let locationMatch = text.match(/\n([^\n]+,\s*[A-Z][a-z]+(?:,\s*[^\n]+)?)\s*\n.*?connections/s);
    if (!locationMatch) {
      // Try simpler format: "Singapore (SG)" or "Singapore"
      locationMatch = text.match(/\n([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s*\([A-Z]{2}\))?)\s*\n.*?connections/s);
    }
    const location = locationMatch ? locationMatch[1].trim() : null;

    // Split text into sections
    const sections = text.split(/^## /m);

    // Parse education
    const education: Education[] = [];
    const educationSection = sections.find(s => s.startsWith('Education')) || '';

    // Debug: Log the full education section
    console.log('[Exa] Education section text:', educationSection.substring(0, 500));

    const eduLines = educationSection.split('\n').filter(l => l.trim().startsWith('###'));
    console.log('[Exa] Found', eduLines.length, 'education entries (lines starting with ###)');

    for (const line of eduLines) {
      console.log('[Exa] Parsing education line:', line);
      // Format: "### Degree at School" or "### Degree, Details at School"
      const match = line.match(/###\s*(.+?)\s+at\s+(.+)/);
      if (match) {
        const degree = match[1].trim();
        let school = match[2].trim();
        // Remove [...]<web_link> markup
        school = school.replace(/\[([^\]]+)\]<web_link>/g, '$1');
        console.log('[Exa] Parsed education:', { school, degree });
        education.push({ school, degree, field: null, start: null, end: null });
      } else {
        console.log('[Exa] Failed to match education line format');
      }
    }

    console.log('[Exa] Total education entries parsed:', education.length);

    // Parse current experience
    let currentCompany: string | null = null;
    let currentPositionStart: { month?: number; year?: number } | null = null;
    const experiences: Experience[] = [];

    const experienceSection = sections.find(s => s.startsWith('Experience')) || '';
    // Split by ### to get each experience block (skip the first which is "Experience" heading)
    const expBlocks = experienceSection.split(/\n###\s+/).filter(b => b.trim() && !b.startsWith('Experience'));

    for (const block of expBlocks) {
      const lines = block.split('\n').filter(l => l.trim());
      if (lines.length < 2) continue;

      // First line: "Title at [Company]<web_link> (Current)" OR "Title at Company (Current)"
      const firstLine = lines[0];
      // Try matching with brackets first, then without
      let titleMatch = firstLine.match(/(.+?)\s+at\s+\[(.+?)\]/);
      let company: string;
      let title: string;

      if (titleMatch) {
        // Format: "Title at [Company]<web_link>"
        title = titleMatch[1].trim();
        company = titleMatch[2].trim();
        company = company.replace(/<web_link>/g, '');
      } else {
        // Format: "Title at Company" (no brackets)
        const simpleMatch = firstLine.match(/(.+?)\s+at\s+([^(\n]+)/);
        if (!simpleMatch) continue;
        title = simpleMatch[1].trim();
        company = simpleMatch[2].trim();
      }

      const isCurrent = firstLine.includes('(Current)');

      // Find date line: "Month Year - Present • duration"
      const dateInfo = lines.find(l => /[A-Z][a-z]+\s+\d{4}\s*-\s*(Present|[A-Z][a-z]+\s+\d{4})/.test(l));
      if (dateInfo) {
        const dateMatch = dateInfo.match(/([A-Z][a-z]+)\s+(\d{4})\s*-\s*(Present|([A-Z][a-z]+)\s+(\d{4}))/);
        if (dateMatch) {
          const startMonth = dateMatch[1];
          const startYear = parseInt(dateMatch[2], 10);
          const endInfo = dateMatch[3];

          const monthMap: Record<string, number> = {
            Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
            Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12
          };

          const endYear = endInfo === 'Present' ? null : (dateMatch[5] ? parseInt(dateMatch[5], 10) : null);

          // Check if current: either marked as "(Current)" or end date is "Present" or is null
          const isActuallyCurrent = isCurrent || endInfo === 'Present' || !endYear;

          experiences.push({
            company,
            title,
            start: startYear,
            end: endYear,
            current: isActuallyCurrent,
          });

          if (isActuallyCurrent && !currentCompany) {
            currentCompany = company;
            currentPositionStart = {
              month: monthMap[startMonth] || undefined,
              year: startYear,
            };
          }
        }
      }
    }

    // Filter and prioritize education (same as LinkedIn method)
    const isHighSchool = (edu: Education): boolean => {
      const schoolName = (edu.school || '').toLowerCase();
      const degreeName = (edu.degree || '').toLowerCase();

      if (schoolName.includes('high school') ||
          schoolName.includes('secondary school') ||
          schoolName.includes('preparatory') ||
          schoolName.includes('prep school') ||
          schoolName.includes('uwc ') ||
          schoolName.includes('uwc south') ||
          schoolName.includes('uwc east') ||
          schoolName.includes('international school') ||
          schoolName.includes('sixth form') ||
          schoolName.includes('college preparatory')) {
        return true;
      }

      if (degreeName.includes('high school') ||
          degreeName.includes('ib diploma') ||
          degreeName.includes('international baccalaureate') ||
          degreeName.includes('a-level') ||
          degreeName.includes('a level') ||
          degreeName.includes('gcse') ||
          degreeName.includes('o-level') ||
          degreeName.includes('cbse') ||
          degreeName.includes('icse') ||
          degreeName.includes('grade 12') ||
          degreeName.includes('secondary education') ||
          degreeName.includes('noc ') ||  // NUS Overseas Colleges program
          degreeName.includes('batch ') ||  // Program batches
          degreeName === '—' ||
          degreeName === '') {
        return true;
      }

      return false;
    };

    const getEducationRank = (edu: Education): number => {
      const degreeName = (edu.degree || '').toLowerCase();

      if (degreeName.includes('phd') || degreeName.includes('ph.d') || degreeName.includes('doctorate')) return 5;
      if (degreeName.includes('master') || degreeName.includes('mba') || degreeName.includes('ms') || degreeName.includes('ma')) return 4;
      if (degreeName.includes('bachelor') || degreeName.includes('bs') || degreeName.includes('ba') || degreeName.includes('b.tech') || degreeName.includes('btech')) return 3;
      if (degreeName.includes('associate') || degreeName.includes('diploma')) return 2;
      if (isHighSchool(edu)) return 0;

      return 1;
    };

    const collegeEducation = education.filter(edu => !isHighSchool(edu));
    const filteredEducation = collegeEducation.length > 0 ? collegeEducation : education;
    filteredEducation.sort((a, b) => getEducationRank(b) - getEducationRank(a));

    console.log('[Exa] After filtering: showing', filteredEducation.length, 'education entries');

    return {
      name,
      headline: content.title?.split('|')[1]?.trim() || null,
      location,
      education: filteredEducation,
      experiences,
      current_company: {
        name: currentCompany,
        founded: null,
        age_years: null,
        size: null,
        industry: null,
        position_start: currentPositionStart,
      },
      source: 'exa',
    };
  } catch (error) {
    console.error('Exa error:', error);
    throw error;
  }
}

function validateLinkedInUrl(url: string): boolean {
  if (!url || url.length > 500) {
    return false;
  }
  // Check if URL is from LinkedIn domain
  if (!url.includes('linkedin.com/in/') && !url.includes('linkedin.com/company/')) {
    return false;
  }
  // Basic URL validation
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return false;
  }
  return true;
}

// Serve the HTML frontend
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../templates/index.html'));
});

app.post('/screen', async (req: Request, res: Response) => {
  const linkedinUrl: string = (req.body?.url ?? '').trim();

  if (!linkedinUrl) {
    return res.status(400).json({ error: 'No LinkedIn URL provided' });
  }

  if (!validateLinkedInUrl(linkedinUrl)) {
    return res.status(400).json({ error: 'Invalid LinkedIn URL. Must be a valid LinkedIn profile URL' });
  }

  // Try Exa first if available
  if (EXA_API_KEY && exaClient) {
    try {
      console.log(`[Exa] Attempting to fetch: ${linkedinUrl}`);
      const result = await getProfileWithExa(linkedinUrl);
      console.log(`[Exa] Success: Retrieved profile for ${result.name}`);
      return res.json(result);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`[Exa] Failed: ${errorMsg}`);

      // If we don't have LinkedIn cookie, return error
      if (!LI_AT_ENV) {
        return res.status(500).json({
          error: `Exa AI failed: ${errorMsg}. No LinkedIn cookie configured as fallback.`
        });
      }

      console.log('[LinkedIn] Falling back to LinkedIn cookie method...');
      // Fall through to li_at method
    }
  }

  // Fall back to li_at method
  if (!LI_AT_ENV) {
    return res.status(500).json({
      error: 'Server not configured. Need either EXA_API_KEY or LI_AT_COOKIE in .env file.',
    });
  }

  const liAt = LI_AT_ENV;

  let client: AxiosInstance;
  try {
    console.log('[LinkedIn] Building session...');
    client = await buildSession(liAt);
    console.log('[LinkedIn] Session initialized successfully');
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[LinkedIn] Session failed: ${message}`);
    return res.status(500).json({ error: 'Failed to initialize LinkedIn session: ' + message });
  }

  let data: LinkedInProfileData;
  try {
    console.log(`[LinkedIn] Fetching profile: ${linkedinUrl}`);
    data = await getLinkedInProfile(linkedinUrl, client);
    console.log('[LinkedIn] Profile data retrieved successfully');
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[LinkedIn] Profile fetch failed: ${message}`);
    return res.status(500).json({ error: 'Failed to fetch LinkedIn profile: ' + message });
  }

  const profile: LinkedInProfile = data.profile ?? {};
  const positions: LinkedInPosition[] = data.positions ?? [];
  const educations: LinkedInEducation[] = data.educations ?? [];

  // Debug: Log raw education data to help diagnose parsing issues
  if (educations.length > 0) {
    console.log('[LinkedIn] Raw education data fields:', {
      schoolName: educations[0].schoolName,
      degreeName: educations[0].degreeName,
      degree: educations[0].degree,
      fieldOfStudy: educations[0].fieldOfStudy,
      grade: educations[0].grade,
      activities: educations[0].activities,
      allKeys: Object.keys(educations[0])
    });
  }

  // Helper: extract start/end years from timePeriod
  const parseDates = (entry: LinkedInPosition | LinkedInEducation) => {
    const tp = entry.timePeriod ?? entry.dateRange ?? {};
    const startYear: number | null = tp.startDate?.year ?? tp.start?.year ?? null;
    const endYear: number | null = tp.endDate?.year ?? tp.end?.year ?? null;
    const isCurrent: boolean = !tp.endDate && !tp.end;
    return { startYear, endYear, isCurrent };
  };

  // --- Education ---
  const allEducation: Education[] = educations.map((edu) => {
    const { startYear, endYear } = parseDates(edu);

    // Extract degree name - check multiple possible fields
    let degreeName = edu.degreeName ?? edu.degree ?? null;
    const fieldOfStudy = edu.fieldOfStudy ?? null;

    // LinkedIn API sometimes puts grade in the degreeName field
    // Check if degreeName looks like a number (grade/GPA/CGPA)
    if (degreeName && /^[\d.]+$/.test(degreeName.trim())) {
      console.log(`[LinkedIn] Detected grade "${degreeName}" in degree field, using fieldOfStudy instead`);
      // This is a grade, not a degree - discard it
      degreeName = null;
    }

    // Try to construct a meaningful degree string from available fields
    if (!degreeName && fieldOfStudy) {
      // If we have field of study but no degree, use field of study
      degreeName = fieldOfStudy;
    } else if (degreeName && fieldOfStudy && degreeName !== fieldOfStudy) {
      // If we have both and they're different, combine them
      degreeName = `${degreeName}, ${fieldOfStudy}`;
    }

    // Final fallback - if still no degree, return "—"
    if (!degreeName) {
      degreeName = "—";
    }

    return {
      school: edu.schoolName ?? edu.school?.schoolName ?? null,
      degree: degreeName,
      field: fieldOfStudy,
      start: startYear,
      end: endYear,
    };
  });

  // Helper function to detect if education is high school
  const isHighSchool = (edu: Education): boolean => {
    const schoolName = (edu.school || '').toLowerCase();
    const degreeName = (edu.degree || '').toLowerCase();

    // Check for high school indicators in school name
    if (schoolName.includes('high school') ||
        schoolName.includes('secondary school') ||
        schoolName.includes('preparatory') ||
        schoolName.includes('prep school') ||
        schoolName.includes('uwc ') ||  // United World Colleges
        schoolName.includes('uwc south') ||
        schoolName.includes('uwc east') ||
        schoolName.includes('international school') ||
        schoolName.includes('sixth form') ||
        schoolName.includes('college preparatory')) {
      return true;
    }

    // Check for high school indicators in degree name
    if (degreeName.includes('high school') ||
        degreeName.includes('ib diploma') ||  // International Baccalaureate
        degreeName.includes('international baccalaureate') ||
        degreeName.includes('a-level') ||
        degreeName.includes('a level') ||
        degreeName.includes('gcse') ||
        degreeName.includes('o-level') ||
        degreeName.includes('cbse') ||
        degreeName.includes('icse') ||
        degreeName.includes('grade 12') ||
        degreeName.includes('secondary education') ||
        degreeName === '—' ||
        degreeName === '') {
      return true;
    }

    return false;
  };

  // Helper function to rank education level (higher = more important)
  const getEducationRank = (edu: Education): number => {
    const degreeName = (edu.degree || '').toLowerCase();

    if (degreeName.includes('phd') || degreeName.includes('ph.d') || degreeName.includes('doctorate')) return 5;
    if (degreeName.includes('master') || degreeName.includes('mba') || degreeName.includes('ms') || degreeName.includes('ma')) return 4;
    if (degreeName.includes('bachelor') || degreeName.includes('bs') || degreeName.includes('ba') || degreeName.includes('b.tech') || degreeName.includes('btech')) return 3;
    if (degreeName.includes('associate') || degreeName.includes('diploma')) return 2;
    if (isHighSchool(edu)) return 0;

    // Unknown degree type, but not high school
    return 1;
  };

  // Filter and sort education: prioritize college over high school
  const collegeEducation = allEducation.filter(edu => !isHighSchool(edu));

  // If there's college education, use only that; otherwise include high school
  const education = collegeEducation.length > 0 ? collegeEducation : allEducation;

  // Sort by education level (highest degree first)
  education.sort((a, b) => getEducationRank(b) - getEducationRank(a));

  // --- Experience ---
  const experiences: Experience[] = [];
  let currentCompany: string | null = null;
  let currentCompanyUniversalName: string | null = null;
  let currentPositionStart: { month?: number; year?: number } | null = null;

  for (const exp of positions) {
    const { startYear, endYear, isCurrent } = parseDates(exp);
    const tp = exp.timePeriod ?? exp.dateRange ?? {};

    experiences.push({
      company: exp.companyName ?? null,
      title: exp.title ?? null,
      start: startYear,
      end: isCurrent ? null : endYear,
      current: isCurrent,
    });
    if (isCurrent && !currentCompany) {
      currentCompany = exp.companyName ?? null;
      currentCompanyUniversalName =
        exp.company?.universalName ??
        exp.company?.miniCompany?.universalName ??
        null;
      // Save full start date info (month + year)
      currentPositionStart = tp.startDate ?? tp.start ?? null;
    }
  }

  // --- Current company details ---
  let companyFounded: string | number | null = null;
  let companySize: string | null = null;
  let companyIndustry: string | null = null;

  if (currentCompanyUniversalName) {
    const companyData = await getCompanyDetails(currentCompanyUniversalName, client);
    if (companyData) {
      companyFounded = companyData.foundedOn?.year ?? null;
      companySize = companyData.staffCount != null ? String(companyData.staffCount) : null;
      const industries = companyData.companyIndustries ?? [];
      if (industries.length > 0) {
        companyIndustry = industries[0]?.localizedName ?? null;
      }
    }
  }

  let companyAge: number | null = null;
  if (companyFounded) {
    try {
      companyAge = new Date().getFullYear() - parseInt(String(companyFounded).slice(0, 4), 10);
    } catch {
      // ignore
    }
  }

  return res.json({
    name: `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim(),
    headline: profile.headline ?? null,
    location: profile.geoLocationName ?? profile.locationName ?? profile.location?.defaultLocalizedName ?? null,
    education,
    experiences,
    current_company: {
      name: currentCompany,
      founded: companyFounded,
      age_years: companyAge,
      size: companySize,
      industry: companyIndustry,
      position_start: currentPositionStart,
    },
  });
});

app.listen(PORT, () => {
  console.log(`\n🏠 Hackerhouse Screener`);
  console.log(`Server running on http://localhost:${PORT}\n`);

  if (!LI_AT_ENV && !EXA_API_KEY) {
    console.error('❌ ERROR: No authentication configured');
    console.error('');
    console.error('You need either:');
    console.error('');
    console.error('Option A - LinkedIn Cookie (Recommended):');
    console.error('1. Go to linkedin.com and log in');
    console.error('2. Open DevTools (F12 or Cmd+Option+I)');
    console.error('3. Go to Application → Cookies → https://www.linkedin.com');
    console.error('4. Copy the "li_at" cookie value');
    console.error('5. Add to .env: LI_AT_COOKIE=<your_cookie_value>');
    console.error('');
    console.error('Option B - Exa AI (Alternative):');
    console.error('1. Sign up at https://exa.ai');
    console.error('2. Get your API key');
    console.error('3. Add to .env: EXA_API_KEY=<your_api_key>');
    console.error('');
    console.error('Then restart the server\n');
  } else {
    if (EXA_API_KEY) {
      console.log('✓ Exa AI configured (will try first)');
    }
    if (LI_AT_ENV) {
      console.log('✓ LinkedIn cookie configured' + (EXA_API_KEY ? ' (fallback)' : ''));
    }
    console.log('✓ Ready to screen profiles!\n');
  }
});
