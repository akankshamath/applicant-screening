from flask import Flask, request, jsonify, render_template
import requests
import os

app = Flask(__name__)

PROXYCURL_API_KEY = os.environ.get("PROXYCURL_API_KEY", "")
CRUNCHBASE_API_KEY = os.environ.get("CRUNCHBASE_API_KEY", "")

PROXYCURL_PERSON_URL = "https://nubela.co/proxycurl/api/v2/linkedin"
PROXYCURL_COMPANY_URL = "https://nubela.co/proxycurl/api/linkedin/company"
CRUNCHBASE_URL = "https://api.crunchbase.com/api/v4/entities/organizations"


def get_linkedin_profile(linkedin_url):
    headers = {"Authorization": f"Bearer {PROXYCURL_API_KEY}"}
    params = {
        "url": linkedin_url,
        "use_cache": "if-present",
        "fallback_to_cache": "on-error",
    }
    resp = requests.get(PROXYCURL_PERSON_URL, headers=headers, params=params)
    resp.raise_for_status()
    return resp.json()


def get_company_details(company_linkedin_url):
    headers = {"Authorization": f"Bearer {PROXYCURL_API_KEY}"}
    params = {
        "url": company_linkedin_url,
        "use_cache": "if-present",
    }
    resp = requests.get(PROXYCURL_COMPANY_URL, headers=headers, params=params)
    if resp.status_code == 200:
        return resp.json()
    return None


def get_company_founded_crunchbase(company_name):
    if not CRUNCHBASE_API_KEY or not company_name:
        return None
    # Search for org
    search_url = "https://api.crunchbase.com/api/v4/searches/organizations"
    headers = {"X-cb-user-key": CRUNCHBASE_API_KEY, "Content-Type": "application/json"}
    payload = {
        "field_ids": ["short_description", "founded_on", "name"],
        "query": [{"type": "predicate", "field_id": "name", "operator_id": "contains", "values": [company_name]}],
        "limit": 1
    }
    resp = requests.post(search_url, json=payload, headers=headers)
    if resp.status_code == 200:
        data = resp.json()
        entities = data.get("entities", [])
        if entities:
            props = entities[0].get("properties", {})
            founded = props.get("founded_on", {})
            if isinstance(founded, dict):
                return founded.get("value")
            return founded
    return None


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/screen", methods=["POST"])
def screen():
    data = request.json
    linkedin_url = data.get("url", "").strip()

    if not linkedin_url:
        return jsonify({"error": "No LinkedIn URL provided"}), 400

    if not PROXYCURL_API_KEY:
        return jsonify({"error": "PROXYCURL_API_KEY not set"}), 500

    try:
        profile = get_linkedin_profile(linkedin_url)
    except requests.HTTPError as e:
        return jsonify({"error": f"Proxycurl error: {e.response.status_code} — {e.response.text}"}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    # --- Education ---
    education = []
    for edu in profile.get("education", []) or []:
        education.append({
            "school": edu.get("school"),
            "degree": edu.get("degree_name"),
            "field": edu.get("field_of_study"),
            "start": edu.get("starts_at", {}).get("year") if edu.get("starts_at") else None,
            "end": edu.get("ends_at", {}).get("year") if edu.get("ends_at") else None,
        })

    # --- Experience ---
    experiences = []
    current_company = None
    current_company_linkedin_url = None

    for exp in profile.get("experiences", []) or []:
        end = exp.get("ends_at")
        is_current = end is None
        entry = {
            "company": exp.get("company"),
            "title": exp.get("title"),
            "start": exp.get("starts_at", {}).get("year") if exp.get("starts_at") else None,
            "end": None if is_current else (exp.get("ends_at", {}).get("year") if exp.get("ends_at") else None),
            "current": is_current,
            "company_linkedin_url": exp.get("company_linkedin_profile_url"),
        }
        experiences.append(entry)
        if is_current and not current_company:
            current_company = exp.get("company")
            current_company_linkedin_url = exp.get("company_linkedin_profile_url")

    # --- Current company age ---
    company_founded = None
    company_size = None
    company_industry = None

    if current_company_linkedin_url:
        company_data = get_company_details(current_company_linkedin_url)
        if company_data:
            company_founded = company_data.get("founded_year")
            company_size = company_data.get("company_size_on_linkedin")
            company_industry = company_data.get("industry")

    if not company_founded and current_company:
        company_founded = get_company_founded_crunchbase(current_company)

    company_age = None
    if company_founded:
        try:
            from datetime import datetime
            company_age = datetime.now().year - int(str(company_founded)[:4])
        except:
            pass

    result = {
        "name": profile.get("full_name"),
        "headline": profile.get("headline"),
        "location": profile.get("city"),
        "education": education,
        "experiences": experiences,
        "current_company": {
            "name": current_company,
            "founded": company_founded,
            "age_years": company_age,
            "size": company_size,
            "industry": company_industry,
        }
    }

    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True, port=5055)
