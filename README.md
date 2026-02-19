# 🏠 Hackerhouse Screener

Paste a LinkedIn URL → get back applicant's education, experience, and how long their current company has been running.

## Setup

```bash
cd linkedin-screener
pip install -r requirements.txt
cp .env.example .env
# edit .env with your API keys
```

## Get API Keys

- **Proxycurl**: https://nubela.co/proxycurl — used for LinkedIn profile + company data
- **Crunchbase**: https://www.crunchbase.com/api — used as fallback for company founding date

## Run

```bash
PROXYCURL_API_KEY=xxx CRUNCHBASE_API_KEY=xxx python app.py
```

Then open http://localhost:5055

## What it shows

- 👤 Name, headline, location
- 🏢 Current company — name, founded year, age, size
- 💼 Full experience history
- 🎓 Education — school, degree, field of study
