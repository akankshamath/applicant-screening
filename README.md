# Hackerhouse Screener

**Simple LinkedIn bulk screener for non-technical users.**

You set it up once. They just paste LinkedIn URLs and get results. No API costs. No complicated setup for end users.

---

## ⚠️ Security & Privacy Considerations

**IMPORTANT: Read this before deploying**

1. **Credential Security**:
   - NEVER commit your `.env` file to version control
   - The `.env.example` file should only contain placeholder values
   - Rotate your LinkedIn cookie/API keys regularly
   - Use environment variables in production, not `.env` files

2. **Rate Limiting**:
   - The server includes rate limiting (30 requests/minute per IP)
   - Adjust in `src/server.ts` if needed for your use case
   - Be aware of LinkedIn's terms of service regarding automated access

3. **Access Control**:
   - This tool has NO authentication by default
   - Anyone with the URL can use your credentials to screen profiles
   - For production use, add authentication/authorization
   - Consider IP whitelisting or VPN-only access

4. **LinkedIn Terms of Service**:
   - Using LinkedIn cookies for automated access may violate LinkedIn's TOS
   - Use at your own risk
   - Consider using LinkedIn's official Recruiter API for commercial use
   - This tool is for personal/educational use only

5. **Data Privacy**:
   - Profile data is not stored by default
   - All data is processed in-memory and returned to the client
   - Ensure compliance with GDPR/privacy laws if storing results
   - Don't share or redistribute scraped data without consent

---

## For YOU (Setup - one time, 5 minutes)

### 1. Install dependencies

```bash
npm install
```

### 2. Choose your authentication method

You have two options:

#### Option A: LinkedIn Cookie (Recommended - Full Data)

1. Open **linkedin.com** in your browser and log in
2. Press **F12** (or `Cmd+Option+I` on Mac) to open DevTools
3. Click the **Application** tab
4. In the left sidebar: **Cookies** → `https://www.linkedin.com`
5. Find the cookie named **`li_at`**
6. Copy its **Value** (long string like `AQEDAUTn...`)

**Pros**: Full structured data (company, tenure, education, etc.)
**Cons**: Need to renew cookie every ~1 year

#### Option B: Exa AI (Alternative - Limited Data)

1. Sign up at https://exa.ai
2. Get your API key from the dashboard

**Pros**: No cookie management, API-based
**Cons**: Returns unstructured text data, limited profile information, may not work for private profiles

### 3. Add credentials to `.env`

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

**For LinkedIn Cookie (Option A):**
```
LI_AT_COOKIE=AQEDAUTnrVwAEaKq...
```

**For Exa AI (Option B):**
```
EXA_API_KEY=your_exa_api_key_here
```

**Or use both:** The server will try Exa first, then fall back to LinkedIn cookie if Exa fails.

### 4. Start the server

```bash
npm run dev
```

You should see (depending on which option you configured):
```
✓ LinkedIn cookie configured
✓ Ready to screen profiles!
```

or

```
✓ Exa AI configured
✓ Ready to screen profiles!
```

### 5. Share the link

Give the URL to your users:
```
http://localhost:5055
```

**That's it.** They can now screen LinkedIn profiles with zero setup.

---

## For THEM (End users - zero setup)

### How to use:

1. Open the link you were given (e.g., http://localhost:5055)
2. Paste LinkedIn URLs (one per line) into the text box
3. Click **"Screen All"**
4. Results appear in a table showing:
   - Name
   - Current company
   - Tenure (e.g., "June 2021–Present")
   - School
   - Degree

### Filter results:

Use the filter boxes to narrow down:
- **Filter by school** (e.g., "Stanford")
- **Filter by company** (e.g., "Google")
- **Filter by tenure** (e.g., min: 2, max: 5 years)

### Export:

Click **"Export CSV"** to download the filtered results.

---

## Why this approach?

**Free forever:**
- No API costs (uses LinkedIn's official API directly)
- No per-request fees
- No subscription plans

**Simple for end users:**
- Just paste URLs → get results
- No DevTools, no cookies, no technical knowledge required
- Works on any device with a browser

**One-time setup:**
- YOU handle the cookie setup once
- Cookie lasts ~1 year before needing renewal
- If it expires, just get a fresh one and update `.env`

---

## Running in production

**Before deploying:**

1. **Install dependencies** (use exact versions):
   ```bash
   npm ci  # Use package-lock.json for reproducible installs
   ```

2. **Build the TypeScript code**:
   ```bash
   npm run build
   ```

3. **Set environment variables** (don't use .env in production):
   ```bash
   export LI_AT_COOKIE="your_cookie_here"
   export EXA_API_KEY="your_key_here"
   export PORT=5055
   ```

4. **Start the server**:
   ```bash
   npm start
   ```

5. **Use a process manager** (like PM2) for production:
   ```bash
   npm install -g pm2
   pm2 start dist/server.js --name linkedin-screener
   pm2 save
   pm2 startup  # Auto-restart on server reboot
   ```

6. **Use HTTPS** to protect credentials in transit:
   - Set up a reverse proxy (nginx/Apache) with SSL
   - Use Let's Encrypt for free SSL certificates
   - Never expose this service over plain HTTP in production

7. **Add authentication**:
   - This tool has NO built-in authentication
   - Add basic auth, OAuth, or firewall rules before deploying
   - Consider using a VPN or IP whitelist

8. **Monitor and log**:
   - Set up logging and monitoring
   - Watch for failed requests or API errors
   - Set up alerts for high error rates

---

## Troubleshooting

**"Maximum redirects" error?**

Your LinkedIn cookie expired. Get a fresh one:
1. Go to linkedin.com (logged in)
2. DevTools → Application → Cookies
3. Copy new `li_at` value
4. Update `.env`
5. Restart server

**Cookie lasts ~1 year**, so you rarely need to do this.

**Exa AI not returning full data?**

Exa AI web search returns unstructured text from public LinkedIn pages. It works best for:
- Public profiles (not private/restricted)
- Basic information (name, current company)
- Less reliable for: tenure dates, education details, full work history

If you need complete structured data, use the LinkedIn cookie method (Option A) instead.

---

## Tech Stack

- **Backend**: Node.js + Express + TypeScript
- **Frontend**: Vanilla JavaScript (no framework overhead)
- **Authentication**:
  - Option A: LinkedIn Voyager API (official, same as linkedin.com uses) via li_at cookie
  - Option B: Exa AI web search API (alternative, limited data)
- **Cost**: $0 with LinkedIn cookie, or Exa AI pricing (free tier available)
