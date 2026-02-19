# 🏠 Hackerhouse Screener (TypeScript)

Paste a LinkedIn URL → get back education, experience, and current company info. **100% free** — uses your LinkedIn account directly.

## Setup

```bash
# 1. Install Node deps
npm install

# 2. Install Python dep (one-time)
pip install linkedin-api

# 3. Create .env
cp .env.example .env
# Fill in your LinkedIn username + password
```

## Run

```bash
npx ts-node src/screen.ts https://linkedin.com/in/username
```

Or build first:
```bash
npm run build
node dist/screen.js https://linkedin.com/in/username
```

## Notes

- Uses a **burner LinkedIn account** recommended — not your main one
- `CRUNCHBASE_API_KEY` is optional — adds company founding year
- Architecture: TypeScript CLI → Python subprocess (linkedin-api) → LinkedIn internal API
