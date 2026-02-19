#!/usr/bin/env python3
"""
Data fetcher using linkedin-api (tomquirk)
Called by screen.ts as a subprocess. Outputs JSON to stdout.
pip install linkedin-api
"""
import sys, os, json

try:
    from linkedin_api import Linkedin
except ImportError:
    print(json.dumps({"error": "linkedin-api not installed. Run: pip install linkedin-api"}))
    sys.exit(1)

username = os.environ.get("LINKEDIN_USER", "")
password = os.environ.get("LINKEDIN_PASS", "")
profile_url = sys.argv[1] if len(sys.argv) > 1 else ""

if not username or not password:
    print(json.dumps({"error": "LINKEDIN_USER or LINKEDIN_PASS not set"}))
    sys.exit(1)

if not profile_url:
    print(json.dumps({"error": "No LinkedIn URL provided"}))
    sys.exit(1)

# Extract public identifier from URL
# e.g. https://www.linkedin.com/in/bill-gates -> bill-gates
public_id = profile_url.rstrip("/").split("/in/")[-1].split("?")[0]

try:
    api = Linkedin(username, password)
    profile = api.get_profile(public_id)
    contact = {}
    try:
        contact = api.get_profile_contact_info(public_id)
    except:
        pass
    print(json.dumps({"profile": profile, "contact": contact}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)
