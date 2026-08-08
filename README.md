# VisionTrack — Agency OS

> Enterprise task/project tracking, AI-driven dynamic task allocation, multi-tier departmental hierarchy (Sales · Marketing · Operations · Finance · Legal), social analytics, centralized data vault, granular RBAC, and real-time inter-department chat for a Web Dev + Social Media agency.

- **Stack:** FastAPI (Python) · React 18 + Vite + Tailwind CSS · Gemini 2.5 Flash (`@google/genai`)
- **Persistence:** SQLite via SQLAlchemy (`visiontrack.db`, auto-seeds on first boot)
- **Auth:** JWT (PyJWT) with PBKDF2 hashing; RBAC enforced server-side
- **Realtime:** WebSocket `/ws/chat` for department chat
- **Design:** Glossy Black `#050505`, Neon Red `#ef4444`, neon-glow shadows

## Demo credentials

| Role | Email | Password |
|------|-------|----------|
| Co-Founder (super admin) | `ava@vision.agency` | `cofound123` |
| Department Lead (x5) | `marcus@vision.agency` · `priya@vision.agency` · `zoe@vision.agency` · `sam@vision.agency` · `dana@vision.agency` | `lead123` |
| Teammate | `theo@vision.agency` · `dev@vision.agency` · `mia@vision.agency` | `team123` |

## Run it

### Backend
```powershell
cd vision-track/backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# edit .env -> set GEMINI_API_KEY + JWT_SECRET
uvicorn app.main:app --reload --port 8000   # auto-seeds on first boot
```

### Frontend
```powershell
cd vision-track/frontend
npm install
npm run dev          # http://localhost:5173
```

### Production sanity
```powershell
npm run build        # emits dist/ for any static host; API at localhost:8000
```

## Verification

```powershell
cd vision-track/backend
.\.venv\Scripts\python.exe -m scripts.smoke   # 19 end-to-end checks against a running server
```

Covers: health, JWT login, auth/me, department + user listing, task scoping, lead-sign auto-workflow (5 tasks), task-complete AI chaining, chat history/post, finance summary, vault docs, RBAC denials, marketing summary, and teammate scoping.

## Architecture

- `backend/app/main.py` — 29 routes + WebSocket manager + lifespan auto-seed
- `backend/app/services/security.py` — PBKDF2 + JWT + `RoleGuard`
- `backend/app/services/ai_scheduler.py` — Gemini task chaining / project suggestions with rule-based fallback
- `backend/app/models.py` — 9 tables (departments, users, projects, tasks, leads, social_posts, metrics, doc_items, chat_messages)
- `frontend/src/pages/` — Executive, SalesCRM, Operations, Marketing, TeamVault
- `frontend/src/services/` — JWT fetch client (`api.js`) + auto-reconnect chat socket (`ws.js`)

## Key flows

1. **Lead → Workflow:** signing a deal in the Sales CRM auto-creates Operations + Marketing tasks via `LEAD_WORKFLOW`.
2. **AI task chaining:** completing a task asks Gemini for the next sequential step and inserts it into the backlog.
3. **AI next-task suggestions:** per-project Gemini suggestions that can be accepted into the backlog.
4. **RBAC:** Co-Founder sees everything; Leads govern their branch; Teammates see only assigned tasks.
