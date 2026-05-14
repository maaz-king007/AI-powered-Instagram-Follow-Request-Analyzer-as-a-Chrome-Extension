# Instagram AI Follow Request Agent

AI-powered Chrome extension that analyzes Instagram follow requests using **Llama 3.3** via Groq.

---

## Architecture

```
Instagram Page
    ↓ Chrome Extension reads follow requests
    ↓ Extracts profile data  
    ↓ Sends to backend (localhost or Railway)
    ↓ Backend sends to Groq Llama 3.3
    ↓ AI returns trust score + reasoning
    ↓ Extension injects recommendation UI
```

---

## ONE-TIME SETUP (do these once)

### 1. Get your Supabase project URL

1. Go to https://supabase.com and open your project
2. Go to **Settings → API**
3. Copy your **Project URL** (looks like: `https://abcdefgh.supabase.co`)
4. Open `backend/.env` and replace `https://YOUR_PROJECT.supabase.co` with your real URL

### 2. Run the Supabase SQL schema

1. Go to your Supabase project → **SQL Editor**
2. Click **New Query**
3. Open `docs/supabase_schema.sql` from this project
4. Paste the entire contents into the editor
5. Click **Run**
6. You should see: `Success. No rows returned`

### 3. ⚠️ SECURITY: Rotate your API keys

You may have shared your API keys. Regenerate them immediately:
- Groq: https://console.groq.com → API Keys → Delete old → Create new
- Supabase: Settings → API → Regenerate keys
- Update `backend/.env` with new values

---

## RUNNING LOCALLY

### Start the backend

```bash
cd backend
node server.js
```

You should see:
```
✅ Instagram AI Agent Backend running on port 3000
```

### Test it works

```bash
curl -X POST http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -d '{"username":"test_account","bio":"DM for crypto","followers":5,"following":5000,"posts":0,"mutuals":0}'
```

You should get back JSON with a score and REJECT decision.

---

## LOADING THE CHROME EXTENSION

1. Open Chrome → go to `chrome://extensions`
2. Turn on **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder from this project
5. The extension icon should appear in your Chrome toolbar

---

## USING THE EXTENSION

1. Click the extension icon → go to **Settings**
2. Make sure **Backend URL** is `http://localhost:3000`
3. Click **Test Connection** — you should see ✅ Connected
4. Click **Save Settings**
5. Go to: https://www.instagram.com/accounts/activity/?followRequests=1
6. The AI will automatically analyze each follow request
7. You'll see colored badges (✅ ACCEPT / 🚫 REJECT / ⚠️ REVIEW) on each card

---

## DEPLOYING BACKEND TO RAILWAY (for always-on)

1. Push your backend folder to GitHub
2. Go to https://railway.app → New Project → Deploy from GitHub
3. Select your repo, choose the `backend/` folder
4. Go to **Variables** and add:
   - `GROQ_API_KEY` = your Groq key
   - `SUPABASE_URL` = your Supabase URL
   - `SUPABASE_ANON_KEY` = your publishable key
   - `SUPABASE_SERVICE_ROLE_KEY` = your secret key
   - `PORT` = 3000
5. Deploy. You'll get a URL like `https://instagram-ai-XXXX.up.railway.app`
6. In the extension popup → Settings → Backend URL → paste your Railway URL
7. Save settings

---

## API ENDPOINTS

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| POST | `/analyze` | Analyze a single profile |
| POST | `/analyze-bulk` | Analyze up to 20 profiles |
| GET | `/history` | Get last 50 analyses |

### POST /analyze body

```json
{
  "username": "string",
  "bio": "string",
  "followers": 100,
  "following": 500,
  "posts": 12,
  "mutuals": 3,
  "isVerified": false,
  "hasProfilePic": true
}
```

### Response

```json
{
  "username": "some_user",
  "score": 85,
  "decision": "ACCEPT",
  "confidence": "HIGH",
  "reasons": ["Balanced follow ratio", "Has profile picture"],
  "flags": [],
  "summary": "Account appears genuine with normal engagement patterns."
}
```

---

## INSTAGRAM DOM NOTE

Instagram's UI changes frequently. If badges stop showing or no cards are found:

1. Open Chrome DevTools on the follow requests page
2. Run: `window.__aiAgentScan()` in the console
3. Check the console for `[AI Agent]` messages
4. If selectors broke, inspect the follow request cards and update `findFollowRequestCards()` in `content.js`

---

## SCORE GUIDE

| Score | Decision | Meaning |
|-------|----------|---------|
| 70–100 | ✅ ACCEPT | Likely genuine |
| 40–69 | ⚠️ REVIEW | Check manually |
| 0–39 | 🚫 REJECT | Likely bot/spam |
