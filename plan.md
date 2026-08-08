# VisionTrack — Agency OS Build Plan

> **Agency OS for Web Development & Social Media Management.** Enterprise task/project tracking, AI-driven dynamic task allocation, end-to-end agency automation, multi-tier departmental hierarchy, social analytics integrations, centralized data vault, granular RBAC, user/task governance, and real-time inter-department collaboration.

- **APP NAME:** VisionTrack
- **TECH STACK:** Python (FastAPI) · React 18 (Vite + Tailwind CSS) · Gemini 2.5 (`gemini-2.5-flash` via official `@google/genai` SDK)
- **DESIGN THEME:** Glossy Black `#050505`, Dark Surface `#0d0d0e`, Neon Red `#ef4444`, White typography, neon-glow shadows
- **PERSISTENCE:** SQLite via SQLAlchemy (single-file `visiontrack.db`, auto-seeds on first boot)
- **AUTH:** JWT (PyJWT) login with seeded demo users; RBAC enforced server-side
- **REALTIME:** FastAPI WebSocket `/ws/chat` for inter-department chat
- **AI ENGINE:** Gemini 2.5 Flash drives task chaining, next-task suggestions, and lead→workflow automation (with deterministic fallback when no API key)

---

## 1. Product Requirements

### 1.1 Core Functional Requirements
1. **Enterprise Task & Project Tracking** — all business tasks, workflows, client projects, and operations from one platform.
2. **AI-Driven Dynamic Task Allocation** — completing a task automatically evaluates and triggers the next sequential task via Gemini.
3. **End-to-End Agency Automation** — tailored for a Web Dev + Social Media agency: marketing, sales pipelines, client onboarding, financial tracking.
4. **Multi-Tier Departmental Hierarchy** — Co-Founder / Executive Parent Dashboard delegating across **Sales, Marketing, Operations, Finance, Legal**.
5. **Integrations & Social Media Analytics** — Instagram + email engagement metrics; content scheduling; unified communication tracking.
6. **Centralized Agency Data Vault** — single source of truth: CRM leads, financial records, client deliverables, legal documentation.
7. **Granular RBAC** — Co-Founder (super admin), Department Leads, Teammates.
8. **User Management & Task Governance** — Co-Founders create/manage user IDs, assign branches, and create/update/reassign/override tasks.
9. **Real-Time Inter-Departmental Collaboration** — chat threads, help flags, cross-departmental tags.

### 1.2 Role System
| Role | Code | Permissions |
|------|------|-------------|
| Co-Founder (Super Admin) | `cofounder` | Full visibility/control over all departments; user creation; task create/update/reassign/override; finance + legal access |
| Department Lead | `lead` | Own-department read/write; task governance within branch; assign tasks to teammates |
| Teammate | `teammate` | Own assigned tasks + own department read; chat participation |

### 1.3 Departments & Modules
| Branch | Color-key | Modules |
|--------|-----------|---------|
| Sales | neon red accent | CRM Lead pipeline (New → Contacted → Closing → Closed) |
| Marketing | fuchsia | Instagram + Email analytics, social post scheduling |
| Operations | sky/green | Kanban project board + AI next-task suggestions |
| Finance | amber | Revenue summary widget (inside Executive + Vault) |
| Legal | violet | Document vault (inside TeamVault) |

---

## 2. AI Task Engine — Behavior & Prompts

### 2.1 Task Chaining (on `complete`)
1. User marks a task `Completed`.
2. `POST /api/tasks/{id}/complete` sets `status=done` and records `completed_at`.
3. Backend serializes context: completed task, project, department, open tasks, assignees.
4. `ai_scheduler.chain_next_task(...)` calls Gemini 2.5 Flash with a **system instruction** describing the agency + department rules, requesting strict JSON:
   ```json
   {
     "title": "...",
     "description": "...",
     "dept": "operations",
     "priority": "high",
     "due_in_days": 2,
     "assignee_hint": "ops-lead"
   }
   ```
5. Response is returned to the UI as a **suggested next task** (requires approval) OR auto-created when `auto_create=true`. If Gemini key is missing/unreachable → **deterministic fallback**: nearest lower-priority sibling task gets promoted / a hand-off template task is created.

### 2.2 Lead → Department Workflow (Sales Signing)
1. Sales promotes a lead to `Closed` (signed) via `PATCH /api/leads/{id}/sign`.
2. Backend **automatically creates**:
   - **Operations:** `Build & launch website for {company}` project + queued tasks
   - **Marketing:** `Social media onboarding for {company}` tasks (IG setup, content calendar)
3. Gemini enriches descriptions/summaries when available; honestly the templates guarantee the chain even offline.

### 2.3 Next-Task Suggestions (Operations Kanban)
- `GET /api/projects/{id}/suggest-next` → returns AI-ranked next task options for the project board; UI shows them in an "AI SUGGESTIONS" panel with an Accept button.

### 2.4 System Instruction Shape (ai_scheduler.py)
```
You are VisionTrack, the AI scheduling engine of a Web Development &
Social Media Management agency. Given the department, current task,
open backlog, and assignee roster, infer the single most logical NEXT task.
Reply with JSON only: {"title","description","dept","priority",
"due_in_days","assignee_hint"}.
Follow the department workflow rules:
- sales: follow-ups and proposal drafting before close
- operations: dev/project hand-offs, review gates before Done
- marketing: content creation → review → publish; report after campaign
- finance: invoice after closed deals
- legal: contract review into vault
```

---

## 3. Backend Architecture

### 3.1 Layout (backend/)
```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app, CORS, router mounting, WebSocket, lifespan auto-seed
│   ├── config.py            # .env loading (override=True): JWT_SECRET, GEMINI_API_KEY, DB, CORS, PORT
│   ├── database.py          # SQLAlchemy engine + SessionLocal + Base + get_db()
│   ├── models.py            # ORM: User, Task, Project, Lead, SocialPost, Metric, DocItem, ChatMessage
│   ├── schemas.py           # Pydantic request/response models
│   └── services/
│       ├── __init__.py
│       ├── security.py      # PBKDF2 hashing, JWT create/verify, get_current_user dependency
│       └── ai_scheduler.py  # Gemini client: chain_on_complete, workflow_from_lead, suggest_next_task
├── scripts/
│   └── seed.py              # Atomic seeding of users, leads, projects, tasks, metrics, posts, docs, chat
├── .env                     # GEMINI_API_KEY, JWT_SECRET, PORT=8000, DB url, CORS
├── requirements.txt
└── visiontrack.db           # (generated, gitignore)
```

### 3.2 Dependencies (`requirements.txt`)
```
fastapi>=0.115
uvicorn[standard]>=0.32
sqlalchemy>=2.0
google-genai>=1.5.0
pydantic>=2.9
python-dotenv>=1.0
PyJWT>=2.9
```

### 3.3 Data Models (models.py)
**Department** — `id, code(sales|marketing|operations|finance|legal), name, color`

**User** — `id, name, email(unique), password_hash, role(cofounder|lead|teammate), department_id, created_at`

**Task** — `id, title, description, status(queued|in_progress|review|done), priority, department_id, project_id(N), assignee_id(N), creator_id, due date, created_at, completed_at(N), ai_generated(bool), source`

**Project** — `id, name, client, description, status(active|at_risk|completed|on_hold), department_id, start, due`

**Lead** — `id, company, contact, email, value, status(new|contacted|closing|closed), stage_note, owner_id, created_at, signed_at`

**SocialPost** — `id, platform(instagram|email), content, scheduled_at, status(draft|scheduled|published), engagement`

**Metric** — `id, platform(instagram|email), label, value, unit, recorded_on`

**DocItem** — `id, department_id, title, doc_type(contract|invoice|policy|nda), file_ref, access_code(cofounder-only|dept)`

**ChatMessage** — `id, user_id, body, dept, tag(help|info|dependency|general), thread_id, created_at`

### 3.4 API Endpoint Map (all prefixed `/api`)
| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| POST | `/auth/login` | public | verify credentials → JWT + user |
| GET | `/auth/me` | any | current user snapshot |
| GET | `/health` | public | liveness + AI/model status |
| GET | `/departments` | any | list branches |
| GET | `/users` | cofounder | list team |
| POST | `/users` | cofounder | create user (role/dept assignment) |
| PATCH | `/users/{id}` | cofounder | update role/dept/active |
| GET | `/tasks?dept=&assignee=&status=` | scoped | role-scoped task list |
| POST | `/tasks` | lead/cofound | create task |
| PATCH | `/tasks/{id}` | lead/cofound/assignee | update fields |
| PATCH | `/tasks/{id}/complete` | scoped | complete → **AI chain** returns suggested next |
| GET | `/projects?dept=` | scoped | list projects |
| POST | `/projects` | lead/cofound | create project |
| GET | `/projects/{id}/ai/suggest` | scoped | AI next-task suggestion |
| GET/POST | `/leads` | sales scoped | CRM list/create |
| PATCH | `/leads/{id}` | sales | change stage |
| POST | `/leads/{id}/sign` | sales | signed → **auto workflows** |
| GET | `/marketing/instagram` | marketing+valid | IG metrics |
| GET | `/marketing/email` | marketing | email metrics |
| GET/POST | `/posts` | marketing | scheduled posts |
| GET | `/finance/summary` | cofound+finance | revenue, invoices, signed deals |
| GET | `/vault/docs?dept=` | role-scoped | legal/finance document index |
| GET | `/chat?dept=` | any | chat history |
| POST | `/chat` | any | post message |
| WS | `/ws/chat` | any | broadcast messages per dept |

### 3.5 Auth & RBAC Enforcement
- Login: PBKDF2-hashed passwords stored in DB; JWT carries `sub=user_id, role, dept`.
- `get_current_user` decodes `Authorization: Bearer` header → HTTP 401 if invalid; 403 if scope violated.
- Permission helper `require_scope(min_role, dept)`:
  - `cofounder` → all departments + user admin + finance/legal vault
  - `lead` → own `department_id` (read/write tasks & dept dashboards)
  - `teammate` → own tasks only (write), department read (dashboard + chat)
- **Task governance:** leads + cofound can reassign/override any task; teammates only their own.

### 3.6 Startup / Seeding
- App lifespan: `Base.metadata.create_all()`, then if `User` table is empty → call `seed.py` loader.
- `seed_users` — demo accounts (see §7). `seed_business` — leads, projects, tasks across columns so the Kanban looks alive on first load; IG/email metric rows; scheduled posts; 2 finance docs + 2 legal docs; a starter chat thread.

### 3.7 WebSocket Chat (`/ws/chat`)
- Client connects with `?token=<jwt>`; rooms keyed by `department_id`.
- Server broadcasts `{message, user, dept, tag, ts}`; also accepts `POST /api/chat` REST fallback.
- Frontend `services/ws.js` auto-reconnects and keeps ordering by `created_at`.

---

## 4. Frontend Architecture

### 4.1 Layout (frontend/)
```
frontend/
├── index.html
├── package.json
├── vite.config.js            # @vitejs/plugin-react, server.port=5173
├── postcss.config.js
├── tailwind.config.js        # theme tokens: obsidian/surface/edge/neon + glow shadows
└── src/
    ├── main.jsx              # ReactDOM + BrowserRouter + AuthProvider + Tailwind css
    ├── App.jsx               # Routes, AuthGuard, role-filtered Sidebar, global ChatDrawer
    ├── index.css             # Tailwind directives + vos-* component classes + scrollbars
    ├── consts/roles.js       # RBAC matrix + nav mapping            [shared]
    ├── context/AuthContext.jsx # current user, token, login/logout, refresh
    ├── services/
    │   ├── api.js            # fetch wrapper (JWT header), typed methods per endpoint
    │   └── ws.js             # WebSocket wrapper (auto-reconnect, subscribe)
    ├── components/
    │   ├── Sidebar.jsx       # role-filtered department nav, glow active states
    │   ├── ChatDrawer.jsx    # floating collaboration drawer + mobile sheet
    │   └── ui/
    │       ├── KpiCard.jsx   # glossy metric card
    │       ├── StatusBadge.jsx # stage/status pill colors
    │       ├── AiSuggestion.jsx # AI next-task card with Accept
    │       ├── Modal.jsx     # overlay + focus
    │       └── MiniBar.jsx   # tiny div-based bar/spark for inline charts
    └── pages/
        ├── Login.jsx
        ├── Executive.jsx     # command center
        ├── SalesCRM.jsx
        ├── Operations.jsx    # kanban + AI suggestions
        ├── Marketing.jsx
        └── TeamVault.jsx     # RBAC + user mgmt + finance/legal docs
```

### 4.2 UI Flow (page-by-page)

**1. `/login`**
- Email + Password; on success store JWT in `localStorage` → context → redirect `/`. Live status of backend; demo credential hints listed under the form.

**2. Sidebar (persistent, left)**
- Brand mark `VisionTrack` (+ neon eye), sections:
  - **Command** (`/`, visible to everyone; full when cofounder)
  - **Sales** (`/sales`) — Sales dept users
  - **Marketing** (`/marketing`) — Marketing dept users
  - **Operations** (`/operations`) — Ops dept users
  - **Team & Vault** (`/vault`) — cofounder only
- Glow active state per link; logout at bottom; user chip (name, role, dept).

**3. `/` Executive Command Center (co-founder/exec)**
- KPI row: Revenue (YTD), Active Projects, Open Tasks, Pipeline Value (`SUM lead.value`)
- Per-department stat cards (Sales/Marketing/Operations/Finance/Legal)
- Task health bars (queued/in-progress/review/done percentages)
- Finance summary widget + Legal vault recent docs widget
- Chat preview + "collaboration" business presence stat.

**4. `/sales` (SalesCRM.jsx)**
- Lead-stage filter chips: All / New / Contacted / Closing / Closed.
- Table: Company, Contact, Value, Owner, Stage badge, updated, actions.
- Inline "Advance stage" dropdown + **Sign deal** (invokes `/leads/{id}/sign`) → toast + auto-created Ops/Marketing tasks appear.
- Add-lead modal.

**5. `/operations` (Operations.jsx)**
- Project/province selector chips.
- Kanban columns: `queued → in_progress → review → done`; each card shows title/assignee/due/priority.
- Column-"Suggest next" (calls `ai-next`) renders `AiSuggestion` cards with **Accept** (creates task) or **Dismiss**.
- Status flip via card buttons (Start / Ready review / Complete).

**6. `/marketing` (Marketing.jsx)**
- IG stats cards: followers, reach, engagement, new subscribers + MiniBars 7-day.
- Email metrics cards: stats, open rate, CTR, bounces + MiniBars.
- Posts schedule table: draft/scheduled/published, content, platform; "Create post" modal.

**7. `/team-vault` (TeamVault.jsx)**
- Tabs: **Team** / **RBAC Matrix** / **Vault (Finance+Legal)**.
- Team panel (co-founder only): create user form (name/email/role/dept + initial password), table with edit role/dept + deactivate → also the "task governance" table "reassign task to" picker.
- RBAC matrix (static grid showing cofounder/lead/teammate × capability rows).
- Vault: doc list filtered by `department_id` with vault badges; co-founder sees all; finance/legal leads see their department only.

**8. ChatDrawer (global toggle)**
- Floating button (bottom-right). Opens slide-over; header: current dept channel; threads list; tag filters row: `general | help | dependency | co-app`; input + send; live WS updates + REST fallback. Seen/online pulse dot on new-message badge for departments.

### 5.3 Design Tokens (tailwind.config.js)
```js
colors: {
  obsidian:"#050505", surface:"#0d0d0e", edge:"#1f1f23",
  crimson:"#dc2626", neon:"#ef4444",
}
boxShadow: { "glow-sm", "glow", "glow-lg", "glow-inner" }
animation: pulseglow (2s), caret (1s step-end)
fonts: mono stack (JetBrains Mono…)
```

`index.css` utility classes: `.vos-card`, `.glow-text`, `.vos-btn-primary`, `.vos-btn-ghost`, `.vos-input`, `.vos-label`, `.vos-badge`, `.glossy`, `.terminal-scroll`.

---

## 5. Build Order (Phases)

**Phase 0 — Scaffold:** (done) `vision-track/` dirs created; root `plan.md`.

**Phase 1 — Backend foundation:**
- requirements, `.env`, `config.py`, `database.py`, ORM `models.py`, `schemas.py`.

**Phase 2 — Security + AI engine:**
- `services/security.py` (hash/JWT), `services/ai_scheduler.py` (chain + suggest + fallback rules).

**Phase 3 — API + seed:**
- `main.py` routes (auth, users, tasks, leads, projects, marketing, finance, vault, chat + AI hooks).
- `scripts/seed.py` demo data; lifespan auto-seed.

**Phase 4 — Frontend scaffold:**
- `npm` package.json, Vite/Tailwind/PostCSS configs, `index.html`, `main.jsx`, `index.css` theme, `services/api.js` + `ws.js`.

**Phase 5 — Shell + auth:**
- `AuthContext`, `Login.jsx`, layout, `Sidebar.jsx`, `ChatDrawer.jsx` + `ui/*` primitives.

**Phase 6 — Module pages:**
- `Executive`, `SalesCRM`, `Operations` (Kanban + AI), `Marketing`, `TeamVault`, wire `App.jsx` routing + guards.

**Phase 7 — Verification & polish:**
- backend `pip install` in venv, seed boot, endpoint smoke-test, WS broadcast test.
- frontend `npm install`, `npm run build`, live dev cross-check CORS/WS/io → fix → README run-scripts → final run through.

---

## 6. Seeded Demo Credentials (scripts/seed.py)

| Role | Name | Login | Department | Sample credentials |
|------|------|-------|------------|-----------|
| Co-Founder | Ava Chen | `ava@vision.agency` | — (all) | `cofound123` |
| Lead Sales | Marcus Cole | `marcus@vision.agency` | Sales | `lead123` |
| Teammate | Theo Reed | `theo@vision.agency` | Sales | `team123` |
| Lead Ops | Priya Patel | `priya@vision.agency` | Operations | `lead123` |
| Teammate | Dev Kumar |  `dev@vision.agency` | Operations | `team123` |
| Lead Marketing | Zoe Lin | `zoe@vision.agency` | Marketing | `lead123` |
| Teammate | Mia Cruz | `mia@vision.agency` | Marketing | `team123` |
| Lead Finance | Sam Costa | `sam@vision.agency` | Finance | `lead123` |
| Legal Counsel| Dana Ives | `dana@vision.agency` | Legal | `lead123` |

Sample seed records: 12 leads across stages; 4 projects; ~16 tasks split over Kanban columns; 14-day IG/email metric series; 6 scheduled posts; 5 documents; 8 chat messages.

---

## 7. Verification Checklist (Step to pass)

- [ ] `pip install -r requirements.txt` succeeds in `backend/.venv`
- [ ] Boot uvicorn; `/health` returns ok + `ai_available`.
- [ ] `/auth/login` issues a JWT; `/auth/me` round-trips user.
- [ ] `PATCH /leads/{id}/sign` auto-creates 1 Ops + 1 Marketing task (asserted via API).
- [ ] `POST /tasks/{id}/complete` returns `{suggested_next: {...}}` in pattern even without a Gemini key (fallback).
- [ ] Non-owner teammate `PATCH /tasks/{other}` task → 403.
- [ ] WS: two clients → broadcast messages to department channel.
- [ ] `npm run build` succeeds; `npm run dev` serves at 5173.
- [ ] Browser smoke: login as Ava → navigate all pages; login as Zoe → /operations redirects/blocked.

---

## 8. Runbook (final README)

### Backend
```powershell
cd vision-track/backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# edit .env → set GEMINI_API_KEY + JWT_SECRET
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
npm run build        # emits dist/ served by any static host; proxied to API
```

---

## 9. Future Stretch (out-of-scope v1)
- OAuth / SSO + invite emails; stripe funds; daily AI standup digest; drag-drop Kanban via dnd-kit; multi-tenant workspaces; real S3 upload for vault docs; Telemetry/billing per user.