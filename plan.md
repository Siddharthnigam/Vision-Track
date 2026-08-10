# VisionTrack — Production Readiness Plan
> Last updated: August 2026 | Stack: React + Vite (Vercel) · FastAPI + SQLAlchemy (Render) · PostgreSQL (Render)

This document is the single source of truth for making VisionTrack fully production-ready.
Work through phases in order. Each item has a status field — update it as you go.

---

## Table of Contents

1. [Current State Summary](#current-state)
2. [Phase 1 — Critical Security & First Login](#phase-1)
3. [Phase 2 — Bug Fixes & Broken Features](#phase-2)
4. [Phase 3 — Production Hardening](#phase-3)
5. [Phase 4 — UX & Feature Completion](#phase-4)
6. [Render Environment Variables Reference](#env-vars)
7. [First Deploy Checklist](#deploy-checklist)

---

## Current State Summary {#current-state}

### What is working ✅
- Login / JWT auth flow
- Sales CRM — leads table, import Excel/CSV, advance pipeline stages, sign deals
- Team Admin — add teammates, assign tasks, update roles inline
- Executive dashboard — KPI cards, task health, department pulse
- Operations, Marketing, Vault pages load correctly
- Vercel frontend deployed, Render backend deployed
- PostgreSQL database connected (data now persists across restarts)
- 404 on refresh fixed via `vercel.json`
- CORS fixed back to wildcard (working)
- Red glow shadows removed from UI

### What is broken or missing ❌
- Login page shows demo accounts with real passwords (security risk)
- No way to create your real cofounder account on a fresh database
- Seed script still runs in non-production environments and creates fake data
- Executive dashboard shows `$` instead of `₹` for Indian currency
- Executive dashboard health bar labels are `undefined` (code bug)
- TeamAdmin uses old inline toast, not the proper toast system
- No password reset for team members from UI
- Gemini API key is committed to Git in `.env` (security risk)
- JWT token never expires in practice (set to 24h, no refresh)
- No rate limiting on login endpoint (brute force possible)

---

## Phase 1 — Critical Security & First Login {#phase-1}
> Complete this phase before sharing the live URL with anyone.

---

### 1.1 — Remove Demo Accounts from Login Page

**Status:** ☐ Not started

**Problem:**
`Login.jsx` shows a panel with 5 demo accounts and their passwords:
```
ava@vision.agency / cofound123
marcus@vision.agency / lead123
priya@vision.agency / lead123
...
```
These are committed to Git and visible to anyone who inspects the source code.
Anyone can log in as cofounder on your live site right now.

**Fix:**
- Delete the entire `DEMOS` array and the "Demo accounts" card from `Login.jsx`
- Keep only the email + password form
- Add a "Forgot password? Contact admin." note for teammates

**File to edit:** `frontend/src/pages/Login.jsx`

---

### 1.2 — Add First-Run Cofounder Bootstrap

**Status:** ☐ Not started

**Problem:**
On a fresh PostgreSQL database there are zero users. You cannot log in.
The seed script creates fake demo users — you don't want fake users in production.
There is currently no way to create your real cofounder account.

**Fix:**
Add a bootstrap function to `main.py` that runs on startup:
- Reads `INIT_COFOUNDER_EMAIL`, `INIT_COFOUNDER_PASSWORD`, `INIT_COFOUNDER_NAME` from env
- Checks if zero users exist in the database
- If zero users AND env vars are set → creates one cofounder account
- If users already exist → does nothing (idempotent, safe to leave on)

**Steps:**

1. In `backend/app/main.py`, add this function before `_lifespan`:

```python
def _bootstrap_cofounder() -> None:
    """Create the first cofounder account if the DB is empty."""
    email = os.getenv("INIT_COFOUNDER_EMAIL", "").strip().lower()
    password = os.getenv("INIT_COFOUNDER_PASSWORD", "").strip()
    name = os.getenv("INIT_COFOUNDER_NAME", "Cofounder").strip()
    if not email or not password:
        return
    db = SessionLocal()
    try:
        count = db.execute(select(func.count(User.id))).scalar_one()
        if count > 0:
            return  # users already exist, do nothing
        user = User(
            name=name,
            email=email,
            password_hash=security.hash_password(password),
            role="cofounder",
            active=True,
        )
        db.add(user)
        db.commit()
        print(f"[bootstrap] Cofounder account created: {email}")
    finally:
        db.close()
```

2. Call it in `_lifespan` before the seed guard:
```python
@asynccontextmanager
async def _lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    _migrate_leads_schema()
    _backfill_lead_fields()
    _bootstrap_cofounder()          # ← add this line
    if os.getenv("ENVIRONMENT") != "production":
        try:
            from scripts.seed import run as seed_demo
            seed_demo()
        except Exception:
            pass
    yield
```

3. On Render, set these environment variables:
   - `INIT_COFOUNDER_EMAIL` = your real email
   - `INIT_COFOUNDER_PASSWORD` = a strong password (12+ chars)
   - `INIT_COFOUNDER_NAME` = your real name

4. Redeploy → log in with your real credentials → you're in as cofounder
5. From Team Admin, add your real team members

**File to edit:** `backend/app/main.py`

---

### 1.3 — Remove Gemini API Key from Git

**Status:** ☐ Not started

**Problem:**
`backend/.env` contains your real Gemini API key committed to the repository:
```
GEMINI_API_KEY=AIzaSyDVDWhZ8aYGrnumyrv-aeVME7285hyjjdI
```
This is now public. Anyone with repo access can use your API quota.

**Fix:**
1. Go to Google AI Studio → revoke this key → generate a new one
2. Set the new key ONLY in Render environment variables, never in `.env`
3. Change `backend/.env` to:
```
GEMINI_API_KEY=replace-with-your-key-in-render-dashboard
```
4. Commit and push the sanitized `.env`

**File to edit:** `backend/.env`

---

### 1.4 — Fully Disable Seed Script in Production

**Status:** ☐ Partially done (guard added but seed data may already exist)

**Problem:**
The seed script creates fake demo accounts (`ava@vision.agency`, `marcus@vision.agency`, etc.)
with known passwords. If the database was seeded before adding the `ENVIRONMENT=production`
guard, these accounts still exist in your live PostgreSQL database.

**Fix:**
1. Confirm `ENVIRONMENT=production` is set on Render ← do this first
2. Log in to your live site as `ava@vision.agency` / `cofound123`
   - If you can log in → the seed data exists in your live DB
   - Go to Team Admin → disable or delete all fake users
3. Change all fake user passwords from Team Admin as a safety measure
4. After your real cofounder account is created (Phase 1.2), disable `ava@vision.agency`

---

## Phase 2 — Bug Fixes & Broken Features {#phase-2}
> Fix these after Phase 1 is complete.

---

### 2.1 — Executive Dashboard: Currency Shows `$` Instead of `₹`

**Status:** ☐ Not started

**Problem:**
`Executive.jsx` has a local `fmtMoney` function at the bottom that formats as USD:
```javascript
function fmtMoney(n) {
  return `$${Math.round(n || 0).toLocaleString()}`;
}
```
All values show as `$4,200` instead of `₹4,200`.

**Fix:**
Replace the local `fmtMoney` in `Executive.jsx` with the INR formatter:
```javascript
const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
function fmtMoney(n) {
  return n ? inr.format(n) : "—";
}
```

**File to edit:** `frontend/src/pages/Executive.jsx`

---

### 2.2 — Executive Dashboard: Health Bar Labels Are Undefined

**Status:** ☐ Not started

**Problem:**
In `Executive.jsx`, the `HealthBars` component uses `s.label` but the segments
array does not have a `label` property — it only has `key` and `color`:
```javascript
const segments = [
  { key: "queued", color: "#71717a" },       // no label!
  { key: "in_progress", color: "#38bdf8" },
  ...
];
// later:
{s.label} · {counts[s.key]}   // s.label is undefined → shows nothing
```

**Fix:**
Add `label` to each segment:
```javascript
const segments = [
  { key: "queued",      label: "Queued",      color: "#71717a" },
  { key: "in_progress", label: "In Progress", color: "#38bdf8" },
  { key: "review",      label: "Review",      color: "#f59e0b" },
  { key: "done",        label: "Done",        color: "#10b981" },
];
```

**File to edit:** `frontend/src/pages/Executive.jsx`

---

### 2.3 — TeamAdmin: Replace Old Toast with Proper Toast System

**Status:** ☐ Not started

**Problem:**
`TeamAdmin.jsx` uses a single `toast` string state and inline banner:
```javascript
const [toast, setToast] = useState("");
// shows as a plain neon banner at the top
```
This doesn't support error/success distinction, auto-dismiss, or multiple concurrent messages.

**Fix:**
Import and use the same `useToast` hook pattern from `SalesCRM.jsx`.
Extract `useToast` and the `Toast` component into a shared file:
`frontend/src/components/ui/Toast.jsx`
Then import it in both `SalesCRM.jsx` and `TeamAdmin.jsx`.

**Files to edit/create:**
- `frontend/src/components/ui/Toast.jsx` (new — extract from SalesCRM)
- `frontend/src/pages/SalesCRM.jsx` (import from shared file)
- `frontend/src/pages/TeamAdmin.jsx` (replace old toast)

---

### 2.4 — TeamAdmin: Password Reset for Team Members

**Status:** ☐ Not started

**Problem:**
There is no way for the cofounder to reset a teammate's password from the UI.
The `PATCH /api/users/{id}` endpoint supports `password` in the payload but the
Team Admin UI has no field for it.

**Fix:**
Add a "Reset Password" button in the team roster table that opens a small modal
with a new password input field. On submit, calls `api.updateUser(id, { password: newPass })`.

**Files to edit:** `frontend/src/pages/TeamAdmin.jsx`

---

### 2.5 — Vault & Team Routes Hidden from Leads

**Status:** ☐ Not started

**Problem:**
In `roles.jsx`, `canViewRoute` returns `false` for `vault` and `team` for non-cofounders:
```javascript
if (code === "vault" || code === "team") return false;
```
This means department leads can't access the vault to see their own department's documents.

**Fix:**
Allow `lead` role to access vault (read-only for their own department):
```javascript
export function canViewRoute(user, code) {
  if (!user) return false;
  if (user.role === "cofounder") return true;
  if (code === "all") return true;
  if (code === "team") return user.role === "cofounder"; // cofounder only
  if (code === "vault") return user.role === "lead" || user.role === "cofounder";
  return user.dept_code === code;
}
```
The backend already scopes vault docs correctly by department — frontend just needs to allow the route.

**File to edit:** `frontend/src/consts/roles.jsx`

---

### 2.6 — Sidebar: Hide Team Admin from Non-Cofounders

**Status:** ☐ Not started

**Problem:**
`canViewNav` in `roles.jsx` blocks vault and team nav items for all non-cofounders.
But after fixing 2.5, leads should see Vault in the sidebar.

**Fix:**
```javascript
export function canViewNav(user, code) {
  if (!user) return false;
  if (user.role === "cofounder") return true;
  if (code === "all") return true;
  if (code === "team") return false;                    // cofounder only
  if (code === "vault") return user.role === "lead";    // leads can see vault
  return user.dept_code === code;
}
```

**File to edit:** `frontend/src/consts/roles.jsx`

---

## Phase 3 — Production Hardening {#phase-3}

---

### 3.1 — Add Rate Limiting to Login Endpoint

**Status:** ☐ Not started

**Problem:**
`POST /api/auth/login` has no rate limiting. An attacker can attempt thousands of
password combinations per second (brute force attack).

**Fix:**
Install `slowapi` and add a rate limiter:
```
slowapi>=0.1.9
```
Limit login to **10 attempts per minute per IP**.

**Files to edit:**
- `backend/requirements.txt` — add `slowapi>=0.1.9`
- `backend/app/main.py` — add rate limiter middleware and decorator on login route

---

### 3.2 — Shorten JWT Expiry

**Status:** ☐ Not started

**Problem:**
`JWT_EXPIRES_MINUTES=1440` means tokens are valid for 24 hours.
If a token is stolen, the attacker has 24 hours of full access.

**Fix:**
Set on Render:
```
JWT_EXPIRES_MINUTES=480
```
This gives 8 hours — enough for a full work day without forcing re-login.

---

### 3.3 — Add Proper 404 Page

**Status:** ☐ Not started

**Problem:**
Unknown routes silently redirect to `/` with no feedback to the user.
In `App.jsx`:
```jsx
<Route path="*" element={<Navigate to="/" replace />} />
```

**Fix:**
Create `frontend/src/pages/NotFound.jsx` — a simple "Page not found" screen
with a back-to-home button. Replace the `<Navigate>` fallback with it.

**Files to create/edit:**
- `frontend/src/pages/NotFound.jsx` (new)
- `frontend/src/App.jsx` (replace Navigate fallback)

---

### 3.4 — Sanitize `.env` File

**Status:** ☐ Not started

**Problem:**
`backend/.env` contains real secrets that should never be in Git:
- Real `GEMINI_API_KEY`
- The default `JWT_SECRET` (weak)

**Fix:**
Replace `backend/.env` with placeholder values only:
```env
# Copy this file to .env.local for local development
# NEVER put real secrets here — use Render environment dashboard for production

GEMINI_API_KEY=your-gemini-key-here
GEMINI_MODEL=gemini-2.5-flash
JWT_SECRET=local-dev-secret-change-me
JWT_EXPIRES_MINUTES=1440
PORT=8000
DATABASE_URL=sqlite:///./visiontrack.db
ALLOWED_ORIGINS=http://localhost:5173
ENVIRONMENT=development
```

**File to edit:** `backend/.env`

---

### 3.5 — Add Health Check to Render

**Status:** ☐ Not started

**Problem:**
Render's free tier spins down after 15 minutes of inactivity. The first request
after spin-down takes 30–60 seconds (cold start). Users see a loading hang.

**Fix (Render dashboard):**
1. Go to Render Web Service → Settings → Health & Alerts
2. Set Health Check Path: `/health`
3. This keeps Render from marking the service as unhealthy

**Optional (keep-alive):**
Use a free uptime monitor like [UptimeRobot](https://uptimerobot.com) to ping
`https://your-backend.onrender.com/health` every 5 minutes.
This prevents spin-down on the free tier entirely.

---

## Phase 4 — UX & Feature Completion {#phase-4}

---

### 4.1 — Add "Change My Password" for All Users

**Status:** ☐ Not started

Every user should be able to change their own password without going through the cofounder.
Add a small profile dropdown in the sidebar with a "Change password" option.

**Files to create/edit:**
- `frontend/src/components/Sidebar.jsx`
- `frontend/src/components/ui/ChangePasswordModal.jsx` (new)

---

### 4.2 — Add Pagination or Infinite Scroll to Leads Table

**Status:** ☐ Not started

When leads grow beyond 200–300 rows, the table becomes slow.
Add `limit` + `offset` params to `GET /api/leads` and paginate the frontend table.

---

### 4.3 — Export Leads to Excel/CSV

**Status:** ☐ Not started

Sales team should be able to export filtered leads as a `.csv` file.
This is a pure frontend feature — use `Papa.parse` or build a simple CSV serializer.

---

### 4.4 — Add "Last Updated" Column to Leads Table

**Status:** ☐ Not started

The `Lead` model has an `updated_at` column but it's not shown in the UI.
Add it as a sortable column in the CRM table.

---

### 4.5 — Marketing & Finance Pages Need Real Data Connections

**Status:** ☐ Not started

The Marketing and Finance pages currently only show data if the seed script ran
(which is now disabled in production). These pages need to gracefully handle
empty states and guide the cofounder to add real metrics.

---

## Render Environment Variables Reference {#env-vars}

Set ALL of these in Render → Web Service → Environment before going live:

| Variable | Value | Notes |
|----------|-------|-------|
| `DATABASE_URL` | `postgresql://...` | Internal URL from Render PostgreSQL |
| `JWT_SECRET` | `<128-char hex>` | `python -c "import secrets; print(secrets.token_hex(64))"` |
| `JWT_EXPIRES_MINUTES` | `480` | 8 hours |
| `ENVIRONMENT` | `production` | Disables seed script |
| `ALLOWED_ORIGINS` | `https://your-app.vercel.app` | Exact Vercel URL |
| `GEMINI_API_KEY` | `AIzaSy...` | New key from Google AI Studio |
| `GEMINI_MODEL` | `gemini-2.5-flash` | |
| `INIT_COFOUNDER_EMAIL` | `your@email.com` | Your real email — used only on first boot |
| `INIT_COFOUNDER_PASSWORD` | `YourStrong#Pass1` | 12+ chars — used only on first boot |
| `INIT_COFOUNDER_NAME` | `Your Name` | |
| `PORT` | `8000` | Render sets this automatically |

> After your cofounder account is created and you've verified login,
> you can remove `INIT_COFOUNDER_EMAIL`, `INIT_COFOUNDER_PASSWORD`, and
> `INIT_COFOUNDER_NAME` from Render environment for security.

---

## First Deploy Checklist {#deploy-checklist}

Work through this in order. Every item must be ✅ before shipping.

### Security (do first)
- [ ] Revoke old Gemini API key, generate new one
- [ ] Set all Render environment variables (table above)
- [ ] Set `ENVIRONMENT=production` on Render
- [ ] Sanitize `backend/.env` — replace real secrets with placeholders
- [ ] Commit and push sanitized `.env`

### Backend bootstrap
- [ ] Set `INIT_COFOUNDER_EMAIL` + `INIT_COFOUNDER_PASSWORD` + `INIT_COFOUNDER_NAME` on Render
- [ ] Redeploy backend on Render
- [ ] Check Render logs — see `[bootstrap] Cofounder account created: your@email.com`
- [ ] Log in on live site with your real credentials — succeeds ✅

### Clean up demo data
- [ ] Log in to live site with your real cofounder credentials
- [ ] Go to Team Admin → find all `@vision.agency` demo users
- [ ] Disable or delete all demo users
- [ ] Verify you can no longer log in as `ava@vision.agency`

### Frontend
- [ ] Remove demo accounts panel from `Login.jsx`
- [ ] Fix `fmtMoney` to use `₹` in `Executive.jsx`
- [ ] Fix health bar labels in `Executive.jsx`
- [ ] Push all frontend changes → Vercel redeploys

### Verification
- [ ] Log in on live site — only your real account works
- [ ] Add a test teammate from Team Admin
- [ ] Log in as that teammate — correct dept scope enforced
- [ ] Upload an Excel sheet in Sales CRM
- [ ] Log out, wait 2 min, log back in — leads still there ✅
- [ ] Refresh the page on `/sales` — no 404 ✅

---

## Summary: Order of Implementation

```
Phase 1 (Today — Security)
├── 1.1  Remove demo panel from Login.jsx
├── 1.2  Add cofounder bootstrap to main.py
├── 1.3  Revoke + replace Gemini API key
└── 1.4  Disable/delete demo accounts from live DB

Phase 2 (This Week — Bug Fixes)
├── 2.1  Fix ₹ currency in Executive.jsx
├── 2.2  Fix health bar labels in Executive.jsx
├── 2.3  Extract Toast to shared component
├── 2.4  Add password reset in TeamAdmin
├── 2.5  Allow leads to access vault route
└── 2.6  Fix sidebar nav for leads

Phase 3 (Before Public Launch — Hardening)
├── 3.1  Rate limit login endpoint
├── 3.2  Set JWT expiry to 8 hours
├── 3.3  Add proper 404 page
├── 3.4  Sanitize .env file
└── 3.5  Configure health check + uptime monitor

Phase 4 (Post Launch — Improvements)
├── 4.1  Change password for all users
├── 4.2  Paginate leads table
├── 4.3  Export leads to CSV
├── 4.4  Add updated_at to leads table
└── 4.5  Empty states for Marketing & Finance
```

---

*VisionTrack Production Plan · v1.0 · August 2026*
