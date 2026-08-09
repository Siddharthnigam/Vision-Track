# VisionTrack Deployment Guide

Deploy this app in two pieces:

| Piece | Host | Folder | Runtime |
|-------|------|--------|---------|
| Frontend | Vercel (Hobby – free) | `frontend/` | Node 20+, Vite static build → `dist` |
| Backend | Render (Free web service) | `backend/` | Python 3.12, FastAPI + Uvicorn |

The frontend talks to the backend through one env var, `VITE_API_BASE`. The chat
WebSocket URL is derived automatically from it (http → ws, https → wss) in
`frontend/src/services/api.js:131`.

---

## 1. Push the repo to GitHub

Both hosts pull from Git; keep this project in one repo:

```bash
cd vision-track
git init && git add -A && git commit -m "init"
git remote add origin git@github.com:<you>/<your-repo>.git
git push -u origin main
```

`.gitignore` already excludes `node_modules`, `.venv`, `backend/.env`, and all
`*.db` files — secrets and local SQLite data must never be committed.

---

## 2. Backend → Render (free tier)

### Option A — `render.yaml` blueprint (recommended)

Add this file at the repo root and commit it. Render will auto-create the service
when you connect the repo and accept the blueprint:

```yaml
services:
  - type: web
    name: visiontrack-api
    runtime: python
    rootDir: backend
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT
    plan: free
    envVars:
      - key: JWT_SECRET
        generateValue: true
      - key: ALLOWED_ORIGINS
        value: https://your-frontend.vercel.app
      - key: DATABASE_URL
        value: sqlite:///./visiontrack.db
      - key: GEMINI_API_KEY
        sync: false   # set manually in the Render dashboard
```

### Option B — Manual setup

1. In [render.com](https://render.com) → **New** → **Web Service** → connect the repo.
2. Enter the details:

   | Field | Value |
   |-------|-------|
   | Name | `visiontrack-api` |
   | Root Directory | `backend` |
   | Runtime | Python 3 |
   | Build Command | `pip install -r requirements.txt` |
   | Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
   | Instance Type | Free |

3. Under **Environment** add the variables below, then **Create Web Service**.

> **Important — Root Directory:** Render only honours `render.yaml` when you create the
> service via **New → Blueprint** after connecting the repo. If you instead create a
> **manual** Web Service from the dashboard, the blueprint (including `rootDir`) is
> **ignored**, the build runs at the repo root, and you get
> `ERROR: Could not open requirements file: 'requirements.txt'`.
>
> Fix either way:
> - **Service Settings → Root Directory → `backend`**, or
> - Use absolute-to-repo commands: build `cd backend && pip install -r requirements.txt`,
>   start `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`.

### Backend environment variables

| Key | Value (example) | Notes |
|-----|-----------------|-------|
| `PORT` | *(auto-set by Render)* | Uvicorn binds to this. |
| `JWT_SECRET` | long random string | **Required for production.** Start with a strong random secret; the code falls back to a dev-only secret otherwise. |
| `ALLOWED_ORIGINS` | `https://your-frontend.vercel.app,http://localhost:5173` | Comma-separated CORS origins. Include your Vercel URL **and** localhost for dev. |
| `GEMINI_API_KEY` | (optional) | Leave unset to run the rule-based AI fallback (`/health` reports `ai_enabled: false`). |
| `DATABASE_URL` | `sqlite:///./visiontrack.db` | See the storage warning below before relying on this. |

### Backend storage caveats (free tier)

- Render **free** instances use an **ephemeral disk**: SQLite data (`visiontrack.db`)
  is wiped on every deploy, restart, or when the instance is scaled down.
- The app **auto-seeds** demo data on boot (idempotent), so the app works after a
  fresh start — but any real data you enter will be lost on redeploy.
- For persistent storage, spin up a free **PostgreSQL** database (Neon /
  Supabase / Render Postgres) and set `DATABASE_URL` to its
  `postgresql://...` connection string. The SQLAlchemy models work with Postgres;
  the SQLite-only column migrations in `app/main.py` are skipped automatically.
- Render free web services **spin down after 15 min of inactivity** and take a
  few seconds to cold-start. Expect the first request after idle to be slow; the
  frontend is unaffected.

### Backend verify

GitHub-deploy, then open:

```
https://your-backend.onrender.com/health
```

Expect:

```json
{ "status": "ok", "service": "visiontrack-api", "ai_enabled": false }
```

---

## 3. Frontend → Vercel (Hobby – free)

### Manual dashboard setup

1. Import the repo in [vercel.com](https://vercel.com) → **Add New → Project**.
2. Framework Preset: **Vite** (or leave "Other"; Vite is auto-detected from `package.json`).
3. Root Directory: **`frontend`**
4. Build Command: `npm run build` (default)
5. Output Directory: `dist` (default)
6. Add this environment variable, then **Deploy**:

| Key | Value (example) |
|-----|-----------------|
| `VITE_API_BASE` | `https://vision-track-backend-pn7l.onrender.com` |

> `VITE_API_BASE` must be set at **build time** — Vite inlines it into the JS
> bundle. Change it and redeploy, or use the Vercel CLI below.

### Vercel CLI alternative

```bash
npm i -g vercel
cd frontend
vercel login
vercel link
vercel env add VITE_API_BASE        # paste https://your-backend.onrender.com
vercel --prod
```

### `vercel.json` (optional)

The Vite SPA needs fallback routing for client-side routes (login, executive, …).
Add this to `frontend/` if any deep link or refresh returns 404:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### Frontend verify

1. Open your Vercel URL and log in with the seeded demo credentials:
   `ava@vision.agency` / `cofound123`
2. Open the department chat drawer — realtime chat uses WebSockets
   (`wss://your-backend.onrender.com/ws/chat`).

---

## 4. Post-deploy checklist

- [ ] Backend `/health` reachable from your browser.
- [ ] `ALLOWED_ORIGINS` contains the exact Vercel URL (match scheme + case).
- [ ] `VITE_API_BASE` set on Vercel and **not** prefixed with a trailing slash (`/api`).
- [ ] `JWT_SECRET` changed from the dev default.
- [ ] Login works with `ava@vision.agency` / `cofound123`.
- [ ] Redepoys use clean logs — check Render logs if the seed fails on boot.

## 5. Free-tier limitations & workarounds

| Limitation | Impact | Workaround |
|------------|--------|------------|
| Render free spins down after 15 min idle | Slow first hit after inactivity | Acceptable for demos; keep a monitor cron (e.g. UptimeRobot partial like `cron-job.org`) hitting `/health` every 10 min |
| Ephemeral SQLite on Render | Data loss on redeploy/restart | Use a free Postgres and point `DATABASE_URL` at it |
| Render free = 512 MB RAM, safe frontend origins | Large file imports could be tight | Keep file imports small; the import API reads into memory |
| WebSockets on Render free | Chat socket drops while instance is down | `ChatSocket` in `frontend/src/services/ws.js` auto-reconnects every 1.5 s |
| Vercel Hobby build limits | N/A for this size | Nothing to do |