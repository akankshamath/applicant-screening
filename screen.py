#!/usr/bin/env python3
"""
Hackerhouse LinkedIn Screener
Usage: python screen.py <linkedin_url>
"""

import sys
import os
import requests
from datetime import datetime

PROXYCURL_API_KEY = os.environ.get("PROXYCURL_API_KEY", "")
CRUNCHBASE_API_KEY = os.environ.get("CRUNCHBASE_API_KEY", "")


def get_linkedin_profile(url):
    resp = requests.get(
        "https://nubela.co/proxycurl/api/v2/linkedin",
        headers={"Authorization": f"Bearer {PROXYCURL_API_KEY}"},
        params={"url": url, "use_cache": "if-present", "fallback_to_cache": "on-error"},
    )
    resp.raise_for_status()
    return resp.json()


def get_company_details(company_linkedin_url):
    resp = requests.get(
        "https://nubela.co/proxycurl/api/linkedin/company",
        headers={"Authorization": f"Bearer {PROXYCURL_API_KEY}"},
        params={"url": company_linkedin_url, "use_cache": "if-present"},
    )
    if resp.status_code == 200:
        return resp.json()
    return None


def get_founded_crunchbase(company_name):
    if not CRUNCHBASE_API_KEY or not company_name:
        return None
    resp = requests.post(
        "https://api.crunchbase.com/api/v4/searches/organizations",
        headers={"X-cb-user-key": CRUNCHBASE_API_KEY, "Content-Type": "application/json"},
        json={
            "field_ids": ["name", "founded_on"],
            "query": [{"type": "predicate", "field_id": "name", "operator_id": "contains", "values": [company_name]}],
            "limit": 1,
        },
    )
    if resp.status_code == 200:
        entities = resp.json().get("entities", [])
        if entities:
            founded = entities[0].get("properties", {}).get("founded_on", {})
            return founded.get("value") if isinstance(founded, dict) else founded
    return None


def divider(char="─", width=50):
    print(char * width)


def section(title):
    print(f"\n  {title.upper()}")
    print("  " + "─" * (len(title) + 2))


def main():
    if not PROXYCURL_API_KEY:
        print("❌  PROXYCURL_API_KEY not set.")
        print("    Export it: export PROXYCURL_API_KEY=your_key")
        sys.exit(1)

    if len(sys.argv) < 2:
        print("Usage: python screen.py <linkedin_profile_url>")
        sys.exit(1)

    url = sys.argv[1].strip()

    print()
    divider("═")
    print("  🏠  HACKERHOUSE SCREENER")
    divider("═")
    print(f"  Fetching: {url}")
    divider()

    try:
        profile = get_linkedin_profile(url)
    except requests.HTTPError as e:
        print(f"❌  Proxycurl error {e.response.status_code}: {e.response.text}")
        sys.exit(1)
    except Exception as e:
        print(f"❌  {e}")
        sys.exit(1)

    # Basic info
    name = profile.get("full_name") or "Unknown"
    headline = profile.get("headline") or ""
    location = profile.get("city") or ""
    print(f"\n  👤  {name}")
    if headline:
        print(f"      {headline}")
    if location:
        print(f"      📍 {location}")

    # --- Current company ---
    experiences = profile.get("experiences") or []
    current = next((e for e in experiences if e.get("ends_at") is None), None)

    current_company_name = None
    company_founded = None
    company_age = None
    company_size = None
    company_industry = None

    if current:
        current_company_name = current.get("company")
        company_linkedin_url = current.get("company_linkedin_profile_url")

        if company_linkedin_url:
            co = get_company_details(company_linkedin_url)
            if co:
                company_founded = co.get("founded_year")
                company_size = co.get("company_size_on_linkedin")
                company_industry = co.get("industry")

        if not company_founded and current_company_name:
            company_founded = get_founded_crunchbase(current_company_name)

        if company_founded:
            try:
                company_age = datetime.now().year - int(str(company_founded)[:4])
            except:
                pass

    section("Current Company")
    if current_company_name:
        print(f"  Company   : {current_company_name}")
        print(f"  Title     : {current.get('title') or '—'}")
        print(f"  Founded   : {company_founded or '—'}")
        print(f"  Age       : {str(company_age) + ' years' if company_age is not None else '—'}")
        print(f"  Size      : {company_size or '—'}")
        print(f"  Industry  : {company_industry or '—'}")
    else:
        print("  No current company found.")

    # --- All experience ---
    section("Experience")
    if experiences:
        for exp in experiences:
            company = exp.get("company") or "—"
            title = exp.get("title") or "—"
            start_y = exp.get("starts_at", {}).get("year") if exp.get("starts_at") else None
            end_y = "present" if exp.get("ends_at") is None else (exp.get("ends_at", {}).get("year") if exp.get("ends_at") else None)
            years = f"{start_y} – {end_y}" if start_y else (end_y or "")
            tag = " ← current" if exp.get("ends_at") is None else ""
            print(f"  • {title} @ {company}  [{years}]{tag}")
    else:
        print("  No experience listed.")

    # --- Education ---
    section("Education")
    education = profile.get("education") or []
    if education:
        for edu in education:
            school = edu.get("school") or "—"
            degree = edu.get("degree_name") or ""
            field = edu.get("field_of_study") or ""
            deg_str = ", ".join(filter(None, [degree, field])) or "—"
            start_y = edu.get("starts_at", {}).get("year") if edu.get("starts_at") else None
            end_y = edu.get("ends_at", {}).get("year") if edu.get("ends_at") else None
            years = f"{start_y} – {end_y}" if start_y else ""
            print(f"  • {school}")
            print(f"    {deg_str}  {('(' + years + ')') if years else ''}")
    else:
        print("  No education listed.")

    print()
    divider("═")
    print()


if __name__ == "__main__":
    main()
