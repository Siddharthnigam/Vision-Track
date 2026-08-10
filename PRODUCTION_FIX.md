# VisionTrack — Production Fix Guide
> Frontend: Vercel | Backend: Render | Database: Render PostgreSQL

This document covers every critical issue found in the production deployment and gives
exact step-by-step instructions to fix each one.

---

## Table of Contents

1. [CRITICAL — Data Loss: SQLite on Ephemeral Filesystem](#issue-1)
2. [CRITICAL — Migrate to Render PostgreSQL](#issue-2)
3. [CRITICAL — Uploaded Excel Files Are Also Lost](#issue-3)
4. [HIGH — JWT Secret Is Insecure Default](#issue-4)
5. [HIGH — CORS Is Misconfigured](#issue-5)
6. [HIGH — Seed Script Runs in Production](#issue-6)
7. [MEDIUM — Environment Variables Not Set on Render](#issue-7)
8. [MEDIUM — Frontend API Base URL Hardcoded to localhost](#issue-8)
9. [Final Checklist](#final-checklist)

---

## Issue 1
## CRITICAL — Data Loss: SQLite on Ephemeral Filesystem

### What Is Happening
Render runs your backend in a **container with an ephemeral (temporary) filesystem**.
Every time Render restarts the container (new deploy, inactivity spin-down, crash, or
routine maintenance), the **entire disk is wiped clean**.

Your database is currently a SQLite file stored on that disk:
```
DATABASE_URL=sqlite:///./visiontrack.db
```

This means:
- You upload an Excel sheet → leads are saved to `visiontrack.db` on Render's disk
- Render restarts the container (could happen any time, even overnight)
- `visiontrack.db` is **permanently deleted**
- You log back in → all data is gone

### Root Cause in Code
**File:** `backend/.env`
```
DATABASE_URL=sqlite:///./visiontrack.db
```

**File:** `backend/app/config.py`
```python
DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./visiontrack.db").strip()
```

The fallback default is also SQLite, so even if the env var is missing it still uses a
local file.

### Fix
Migrate to Render PostgreSQL. See **Issue 2** for the full step-by-step.

---

## Issue 2
## CRITICAL — Migrate to Render PostgreSQL

### Step-by-Step Instructions

#### Step 1 — Create a PostgreSQL Database on Render

1. Log in to [https://dashboard.render.com](https://dashboard.render.com)
2. Click **New +** in the top-right corner
3. Select **PostgreSQL**
4. Fill in the form:
   - **Name:** `visiontrack-db`
   - **Database:** `visiontrack`
   - **User:** `visiontrack_user`
   - **Region:** Same region as your backend web service (e.g. Oregon US West)
   - **Plan:** Free
5. Click **Create Database**
6. Wait ~2 minutes for it to provision
7. On the database detail page, scroll down to **Connections**
8. Copy the **Internal Database URL** (looks like `postgresql://visiontrack_user:PASSWORD@dpg-xxxxx-a/visiontrack`)
   > Use **Internal URL** — it's faster and free. External URL is for connecting from outside Render.

---

#### Step 2 — Add psycopg2 to requirements.txt

Open `backend/requirements.txt` and add this line:

```
# Current contents:
fastapi>=0.115
uvicorn[standard]>=0.32
sqlalchemy>=2.0
google-genai>=1.5.0
pydantic>=2.9
python-dotenv>=1.0
PyJWT>=2.9
python-multipart>=0.0.9
openpyxl>=3.1
pypdf>=5.0

# ADD THIS LINE:
psycopg2-binary>=2.9
```

`psycopg2-binary` is the PostgreSQL driver that SQLAlchemy needs to talk to Postgres.

---

#### Step 3 — Set DATABASE_URL on Your Render Web Service

1. Go to your Render **Web Service** (your backend, not the database)
2. Click **Environment** in the left sidebar
3. Click **Add Environment Variable**
4. Set:
   - **Key:** `DATABASE_URL`
   - **Value:** Paste the Internal Database URL you copied in Step 1
5. Click **Save Changes**

> Do NOT put this URL in your `.env` file and commit it to Git. Keep secrets in
> Render's environment dashboard only.

---

#### Step 4 — Remove SQLite-Only Migration Code from main.py

The current `main.py` has a function `_migrate_leads_schema()` that manually runs
`ALTER TABLE` SQL — this is SQLite-specific and will **crash** on PostgreSQL because
PostgreSQL handles schema through SQLAlchemy's `create_all` properly.

**File:** `backend/app/main.py`

Find this function and the call to it in `_lifespan`:

```python
def _migrate_leads_schema() -> None:
    """SQLite: create_all won't add columns to an existing table, so add them."""
    if not config.settings.is_sqlite:
        return
    db = SessionLocal()
    try:
        cols = {
            row[1]
            for row in db.execute(text("SELECT * FROM pragma_table_info('leads')")).fetchall()
        }
        for col, ddl in {
            "phone": "VARCHAR(40)",
            "category": "VARCHAR(120)",
            "address": "TEXT",
            "website": "VARCHAR(255)",
        }.items():
            if col not in cols:
                db.execute(text(f"ALTER TABLE leads ADD COLUMN {col} {ddl}"))
        db.commit()
    finally:
        db.close()
```

This function already has `if not config.settings.is_sqlite: return` so it is safe —
it will silently do nothing on PostgreSQL. **No code change needed here**, but confirm
it is present. The `create_all` call in `_lifespan` will create all tables correctly
on PostgreSQL from scratch.

---

#### Step 5 — Redeploy the Backend

1. Go to your Render Web Service
2. Click **Manual Deploy** → **Deploy latest commit**
   OR push any commit to your connected Git branch
3. Watch the deploy logs — you should see:
   ```
   INFO:     Application startup complete.
   ```
   Without any SQLite errors.

---

#### Step 6 — Verify the Database Is Working

1. Open your live frontend URL on Vercel
2. Log in with `ava@vision.agency` / `cofound123` (seed data will be created fresh)
3. Go to Sales CRM → upload an Excel sheet
4. Log out, wait 30 seconds, log back in
5. The data should still be there ✅

---

## Issue 3
## CRITICAL — Uploaded Excel Files Are Also Lost

### What Is Happening
When you upload an Excel file, the raw file bytes are saved to:
```
backend/uploads/sales/<filename>.xlsx
```
This is also on Render's ephemeral disk. The file is deleted on every restart.

### Root Cause in Code
**File:** `backend/app/main.py`
```python
def _save_upload(prefix: str, ext: str, data: bytes) -> str:
    import os
    file_dir = os.path.join(config.settings.BASE_DIR, "uploads", "sales")
    os.makedirs(file_dir, exist_ok=True)
    filename = f"{prefix}.{ext}"
    with open(os.path.join(file_dir, filename), "wb") as fh:
        fh.write(data)
    return f"uploads/sales/{filename}"
```

### Fix (Simplest Approach — No Extra Service Needed)

The Excel file is **fully parsed in memory** before being saved. The actual lead data
goes into the PostgreSQL database. The raw file is only kept for reference.

Since you already have all the data in the DB, you can safely stop saving the raw file.

**Edit `backend/app/main.py`** — find the `import_sales_file` endpoint and change:

```python
# BEFORE — saves file to disk (gets wiped on restart)
file_ref = None
if file.filename:
    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin").lower()
    name = f"{sales_import.timestamp_token()}_{user.id}_{levenshtein_token(file.filename)}"
    file_ref = _save_upload(name, ext, data)
```

```python
# AFTER — skip file save, just record the filename as reference
file_ref = file.filename  # store original filename as reference only
```

This means `SalesImport.file_ref` will store the original filename string like
`"Q3_leads.xlsx"` instead of a disk path. The import history still shows which file
was uploaded. No data is lost because the leads are already in the database.

---

## Issue 4
## HIGH — JWT Secret Is Insecure Default

### What Is Happening
Your JWT tokens (used for login sessions) are signed with a secret key. If an attacker
knows this key, they can forge tokens and log in as any user including the cofounder.

The current secret in your code:
```
JWT_SECRET=visiontrack-dev-secret-change-me
```
This is committed to Git and is publicly visible to anyone who sees your repository.

### Fix

#### Step 1 — Generate a Strong Secret

Run this in your terminal (Python):
```bash
python -c "import secrets; print(secrets.token_hex(64))"
```
This produces a 128-character random hex string like:
```
a3f8c2e1d4b7...
```
Copy this value.

#### Step 2 — Set It on Render

1. Go to Render Web Service → **Environment**
2. Add environment variable:
   - **Key:** `JWT_SECRET`
   - **Value:** The 128-character string you generated
3. Save Changes

#### Step 3 — Remove It from .env

Open `backend/.env` and change:
```
# BEFORE
JWT_SECRET=visiontrack-dev-secret-change-me

# AFTER (use a different dev secret, not the production one)
JWT_SECRET=local-dev-only-not-production
```

Never put the real production JWT secret in a file that gets committed to Git.

---

## Issue 5
## HIGH — CORS Is Misconfigured

### What Is Happening
Your `main.py` sets CORS to allow all origins (`"*"`), but your `config.py` already
has logic to read `ALLOWED_ORIGINS` from the environment. The two are disconnected —
the middleware ignores the config entirely.

**File:** `backend/app/main.py`
```python
# CURRENT — ignores config, allows everything
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # ← hardcoded wildcard
    allow_credentials=False,    # ← False because credentials don't work with "*"
    allow_methods=["*"],
    allow_headers=["*"],
)
```

This means:
- Any website on the internet can make API calls to your backend
- `allow_credentials=False` means cookies/auth headers behave differently across browsers

### Fix

**Edit `backend/app/main.py`** — replace the middleware block:

```python
# AFTER — uses your config, restricts to your frontend only
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Then on Render, add this environment variable:

- **Key:** `ALLOWED_ORIGINS`
- **Value:** `https://your-app-name.vercel.app`

Replace `your-app-name` with your actual Vercel project URL. If you have a custom
domain add both:
```
https://your-app-name.vercel.app,https://yourcustomdomain.com
```

---

## Issue 6
## HIGH — Seed Script Runs in Production on Every Startup

### What Is Happening
Every time your backend starts, it calls `seed_demo()` which creates fake demo users,
leads, and tasks. It is guarded by:
```python
has_leads = db.execute(select(func.count(Lead.id))).scalar_one() > 0
has_tasks = db.execute(select(func.count(Task.id))).scalar_one() > 0
if has_leads or has_tasks:
    return
```

With SQLite this was a problem because the DB was wiped on restart, so the seed ran
every time. With PostgreSQL the guard will work correctly — seed only runs once on a
fresh DB.

However, the demo seed creates accounts like:
- `ava@vision.agency` / `cofound123`
- `marcus@vision.agency` / `lead123`

These are **public credentials committed to Git**. Anyone who finds your live URL can
log in as a cofounder.

### Fix

#### Option A — Disable Seeding in Production (Recommended)

**Edit `backend/app/main.py`** — wrap the seed call with an environment check:

```python
@asynccontextmanager
async def _lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    _migrate_leads_schema()
    _backfill_lead_fields()

    # Only auto-seed in local development, never in production
    if os.getenv("ENVIRONMENT") != "production":
        try:
            from scripts.seed import run as seed_demo
            seed_demo()
        except Exception:
            pass
    yield
```

Then on Render, add:
- **Key:** `ENVIRONMENT`
- **Value:** `production`

#### Option B — Change Demo Passwords After First Deploy

If you want to keep the seed data (useful for demos), immediately after first deploy:
1. Log in as `ava@vision.agency` / `cofound123`
2. Go to team management and change all user passwords to strong unique ones
3. The seed guard will prevent re-seeding since data now exists in PostgreSQL

---

## Issue 7
## MEDIUM — All Environment Variables Must Be Set on Render

### Complete List of Required Environment Variables

Go to Render Web Service → **Environment** and set ALL of these:

| Key | Value | Notes |
|-----|-------|-------|
| `DATABASE_URL` | `postgresql://user:pass@host/db` | From Render PostgreSQL Internal URL |
| `JWT_SECRET` | `<128-char random hex>` | Generate with `python -c "import secrets; print(secrets.token_hex(64))"` |
| `JWT_EXPIRES_MINUTES` | `1440` | 24 hours. Increase if users complain of frequent logouts |
| `ALLOWED_ORIGINS` | `https://yourapp.vercel.app` | Your exact Vercel frontend URL |
| `GEMINI_API_KEY` | `AIzaSy...` | Your Google AI Studio key |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Or whichever model you use |
| `ENVIRONMENT` | `production` | Disables the auto-seeder |
| `PORT` | `8000` | Render usually sets this automatically |

> ⚠️ Never commit real values for `DATABASE_URL`, `JWT_SECRET`, or `GEMINI_API_KEY`
> to your Git repository. Always set them via Render's Environment dashboard.

---

## Issue 8
## MEDIUM — Frontend API Base URL Must Point to Render, Not localhost

### What Is Happening
**File:** `frontend/src/services/api.js`
```javascript
const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";
```

If `VITE_API_BASE` is not set at build time, the frontend will try to call
`http://127.0.0.1:8000` — which is your local machine, not Render. This will fail
completely in production.

### Fix

#### Step 1 — Set the Environment Variable on Vercel

1. Go to [https://vercel.com](https://vercel.com) → your project
2. Click **Settings** → **Environment Variables**
3. Add:
   - **Name:** `VITE_API_BASE`
   - **Value:** `https://your-backend-name.onrender.com`
     (your Render backend URL, no trailing slash)
   - **Environment:** Production (and Preview if you want)
4. Click **Save**

#### Step 2 — Redeploy the Frontend

After setting the variable, redeploy the Vercel project so it rebuilds with the new
environment variable baked in:

1. Go to Vercel → your project → **Deployments**
2. Click the three dots on the latest deployment → **Redeploy**

#### Step 3 — Verify

Open your browser DevTools → Network tab → log in to the live site.
The API calls should go to `https://your-backend-name.onrender.com/api/...`
not `http://127.0.0.1:8000`.

---

## Final Checklist

Work through these in order. Each item must be ✅ before moving to the next.

### Backend (Render)

- [ ] **1.** Created PostgreSQL database on Render
- [ ] **2.** Copied Internal Database URL
- [ ] **3.** Added `psycopg2-binary>=2.9` to `backend/requirements.txt`
- [ ] **4.** Set `DATABASE_URL` environment variable on Render Web Service
- [ ] **5.** Set `JWT_SECRET` to a new strong random value on Render
- [ ] **6.** Set `ALLOWED_ORIGINS` to your Vercel URL on Render
- [ ] **7.** Set `ENVIRONMENT=production` on Render
- [ ] **8.** Set `GEMINI_API_KEY` on Render
- [ ] **9.** Fixed CORS middleware in `main.py` to use `config.settings.ALLOWED_ORIGINS`
- [ ] **10.** Fixed `import_sales_file` in `main.py` to not save files to disk
- [ ] **11.** Added `ENVIRONMENT` check around `seed_demo()` call in `main.py`
- [ ] **12.** Committed changes and pushed to Git
- [ ] **13.** Redeployed backend on Render — deploy logs show no errors
- [ ] **14.** Hit `https://your-backend.onrender.com/health` — returns `{"status":"ok"}`

### Frontend (Vercel)

- [ ] **15.** Set `VITE_API_BASE=https://your-backend.onrender.com` on Vercel
- [ ] **16.** Redeployed frontend on Vercel
- [ ] **17.** Logged in on live site — no `127.0.0.1` calls in browser DevTools

### End-to-End Verification

- [ ] **18.** Upload an Excel sheet in Sales CRM on the live site
- [ ] **19.** Confirm leads appear in the table
- [ ] **20.** Wait 2 minutes, log out, log back in
- [ ] **21.** Confirm leads are still there ✅ (this is the main bug being fixed)
- [ ] **22.** Log in to Render PostgreSQL dashboard and confirm rows exist in the `leads` table

---

## Summary of All Code Changes Required

| File | Change |
|------|--------|
| `backend/requirements.txt` | Add `psycopg2-binary>=2.9` |
| `backend/app/main.py` | Fix CORS middleware to use `config.settings.ALLOWED_ORIGINS` |
| `backend/app/main.py` | Fix `import_sales_file` to not write files to local disk |
| `backend/app/main.py` | Wrap `seed_demo()` call with `ENVIRONMENT != production` check |
| `backend/.env` | Update local `ALLOWED_ORIGINS` to include localhost for dev |

All other fixes are done via **Render environment variables** and **Vercel environment
variables** — no code changes needed.

---

*Last updated: August 2026 | VisionTrack v1.0.0*
