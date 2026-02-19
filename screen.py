#!/usr/bin/env python3
"""
Hackerhouse LinkedIn Screener
Uses: RapidAPI - Fresh LinkedIn Profile Data
Usage: python screen.py <linkedin_url>
"""

import sys
import os
import requests
from datetime import datetime

RAPIDAPI_KEY = os.environ.get("RAPIDAPI_KEY", "")
CRUNCHBASE_API_KEY = os.environ.get("CRUNCHBASE_API_KEY", "")

RAPIDAPI_HOST = "fresh-linkedin-profile-data.p.rapidapi.com"


def get_linkedin_profile(url):
    resp = requests.get(
        "https://fresh-linkedin-profile-data.p.rapidapi.com/get-linkedin-profile",
        headers={
            "X-RapidAPI-Key": RAPIDAPI_KEY,
            "X-RapidAPI-Host": RAPIDAPI_HOST,
        },
        params={"linkedin_url": url, "include_skills": "false"},
    )
    resp.raise_for_status()
    result = resp.json()
    return result.get("data", result)


def get_company_profile(company_linkedin_url):
    resp = requests.get(
        "https://fresh-linkedin-profile-data.p.rapidapi.com/get-company-by-linkedinurl",
        headers={
            "X-RapidAPI-Key": RAPIDAPI_KEY,
            "X-RapidAPI-Host": RAPIDAPI_HOST,
        },
        params={"linkedin_url": company_linkedin_url},
    )
    if resp.status_code == 200:
        result = resp.json()
        return result.get("data", result)
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


def parse_year(date_obj):
    if not date_obj:
        return None
    if isinstance(date_obj, dict):
        return date_obj.get("year")
    if isinstance(date_obj, str) and len(date_obj) >= 4:
        return date_obj[:4]
    return None


def main():
    if not RAPIDAPI_KEY:
        print("❌  RAPIDAPI_KEY not set.")
        print("    Export it: export RAPIDAPI_KEY=your_key")
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
        print(f"❌  RapidAPI error {e.response.status_code}: {e.response.text}")
        sys.exit(1)
    except Exception as e:
        print(f"❌  {e}")
        sys.exit(1)

    # Basic info
    name = profile.get("full_name") or "Unknown"
    headline = profile.get("headline") or ""
    location = profile.get("city") or profile.get("location") or ""
    print(f"\n  👤  {name}")
    if headline:
        print(f"      {headline}")
    if location:
        print(f"      📍 {location}")

    # --- Current company ---
    experiences = profile.get("experiences") or []
    current = next((e for e in experiences if not e.get("ends_at") and not e.get("end_year")), None)

    current_company_name = None
    company_founded = None
    company_age = None
    company_size = None
    company_industry = None

    if current:
        current_company_name = current.get("company") or current.get("company_name")
        company_linkedin_url = current.get("company_linkedin_url") or current.get("company_linkedin_profile_url")

        if company_linkedin_url:
            co = get_company_profile(company_linkedin_url)
            if co:
                company_founded = co.get("founded_year") or co.get("founded")
                company_size = co.get("company_size") or co.get("company_size_on_linkedin")
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
            company = exp.get("company") or exp.get("company_name") or "—"
            title = exp.get("title") or exp.get("position") or "—"
            start_y = exp.get("start_year") or parse_year(exp.get("starts_at"))
            ends_at = exp.get("ends_at") or exp.get("end_year")
            is_current = not ends_at
            end_y = "present" if is_current else (exp.get("end_year") or parse_year(exp.get("ends_at")) or "")
            years = f"{start_y} – {end_y}" if start_y else (str(end_y) if end_y else "")
            tag = " ← current" if is_current else ""
            print(f"  • {title} @ {company}  [{years}]{tag}")
    else:
        print("  No experience listed.")

    # --- Education ---
    section("Education")
    education = profile.get("educations") or profile.get("education") or []
    if education:
        for edu in education:
            school = edu.get("school") or edu.get("institution") or "—"
            degree = edu.get("degree") or edu.get("degree_name") or ""
            field = edu.get("field_of_study") or edu.get("field") or ""
            deg_str = ", ".join(filter(None, [degree, field])) or "—"
            start_y = edu.get("start_year") or parse_year(edu.get("starts_at"))
            end_y = edu.get("end_year") or parse_year(edu.get("ends_at"))
            years = f"{start_y} – {end_y}" if start_y else ""
            print(f"  • {school}")
            print(f"    {deg_str}  {('(' + str(years) + ')') if years else ''}")
    else:
        print("  No education listed.")

    print()
    divider("═")
    print()


if __name__ == "__main__":
    main()
