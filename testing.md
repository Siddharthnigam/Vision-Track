# VisionTrack — Complete Testing Guide

End-to-end test matrix for the **VisionTrack Agency OS** (FastAPI + React/Vite/Tailwind + SQLite + Gemini 2.5 Flash).
Covers unit, integration/RBAC, WebSocket, CORS, validation, frontend component tests, CI, and a full manual
/data-integrity walkthrough that verifies **every feature creates, reads, updates, and deletes data correctly**
across all three roles (Co-Founder, Department Lead, Teammate).

---

## 1. Why This Guide Exists

VisionTrack persists everything through 9 SQLAlchemy tables
(`departments, users, projects, tasks, leads, social_posts, metrics, doc_items, chat_messages`).
A bug anywhere in the read/write path corrupts the whole agency (wrong tasks assigned, leads signed twice,
finance numbers off, teammates seeing other departments). Every test in this guide is built to catch one
specific failure mode and to assert the data **actually changed** on the disk after each operation.

For every module the tests verify the full CRUD + workflow cycle:

1. **Create** — correct row inserted with correct defaults (status `queued`, priority `medium`, `ai_generated` flags...).
2. **Read** — correct **scoping**: cofounder sees all, lead sees own dept only, teammate sees only assigned tasks.
3. **Update** — the field change is persisted (re-fetch and assert, don't trust the PATCH response alone).
4. **Delete / transition** — rows removed, users deactivated, status moves `queued → in_progress → review → done`.
5. **Workflows** — signing a lead auto-creates 5 cross-dept tasks + a project; completing a task triggers AI chaining.
6. **Realtime** — WebSocket relay echo + chat persistence.
7. **Security** — RBAC 403s, JWT 401s, CORS blocks, validation 422s.

---

## 2. Test Stack & Structure

### Backend — `pytest` + FastAPI `TestClient` (no live server needed)

```powershell
cd vision-track\backend
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q                    # full suite
.\.venv\Scripts\python.exe -m pytest -q test_tasks.py test_leads.py
```

**Critical isolation rule:** `tests/conftest.py` sets `DATABASE_URL=sqlite:///./.tmp_test.db`
**before** app import. Unit/integration tests NEVER touch the real `visiontrack.db`
(it is auto-seeded by the app lifespan on real boots). The temp DB is dropped + recreated between tests
via `Base.metadata.drop_all()` / `create_all()`.

### Frontend — Vitest + Testing Library

```powershell
cd frontend
npm install
npm test            # vitest run (unit + component)
npm run build        # production build stays green
npm run dev          # http://localhost:5173 for manual checks
```

### Live-server E2E (kept from earlier phase)

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
# second terminal:
.\.venv\Scripts\python.exe -m scripts.smoke        # 19 live checks
```

### CI — GitHub Actions (`.github/workflows/ci.yml`)

Two jobs on push/PR to `main`:

| Job | Setup | Commands | Notes |
|-----|-------|----------|-------|
| `backend` | Python 3.11 | `pip install -r requirements.txt -r requirements-dev.txt` then `pytest -q` | env `GEMINI_API_KEY=""` forces the **deterministic** rule-based AI fallback |
| `frontend` | Node 22 | `npm ci` then `npm test` then `npm run build` | |

---

## 3. Backend Suite (pytest)

Test files live in `backend/tests/`. Shared fixtures (in `conftest.py`):

- `client` — `TestClient(app)` with lifespan → auto-seeds demo data.
- `reset_db` — app-level teardown between tests.
- `auth(role)` — logs in as `cofounder | lead | teammate` and returns
  `{"Authorization": "Bearer <token>"}`.

### 2.1 Unit tests

#### `test_security.py`
- PBKDF2 `hash/verify` roundtrip; wrong password fails.
- `create_token` payload (`sub` string, role, exp > now).
- `decode`/verify valid token → user; expired token → reject; tampered token → reject.
- `RoleGuard`: cofounder grants all; lead grants own dept only; teammate grants only own tasks.

#### `test_ai_scheduler.py` (monkeypatches `_ask_gemini` so flaky model calls never leak into CI)
- `_extract_json`: fenced ``` ```json ``` blocks, raw JSON, garbage/empty → `None`.
- `_rule_based_next`: deterministic dept hint, `due_in_days=3`, `priority=medium`.
- `_clean_suggestion`: falls back when Gemini returns junk; normalizes dept/priority/due.
- `_parse_due`: date string, int days, invalid string → default.
- `_pick_assignee`: prefers email hint, else dept lead, else first teammate.
- `suggest_options`: with `_ask_gemini → None` returns exactly 3 options.
- `commit_next`: inserts a Task with `ai_generated=True`, `source`, correct dept.

### 2.2 API + RBAC integration (all roles)

| File | Covers |
|------|--------|
| `test_auth.py` | Login OK / wrong password / missing fields; `/auth/me`; invalid & expired token → 401 |
| `test_users.py` | cofounder CRUD (create, disable/re-enable); lead & teammate → 403 |
| `test_tasks.py` | Create/update/delete; full status flow; lead sees own dept only; teammate own tasks; cross-dept 404; complete → AI-chained task persisted |
| `test_leads.py` | Create/update; **sign → 5 tasks (3 Operations + 2 Marketing) + project + pipeline value**; repeat-sign behavior |
| `test_projects.py` | CRUD; `/ai/suggest` returns 3 deterministic options |
| `test_marketing.py` | Summary aggregation (Instagram + email metric series + posts); post `draft → scheduled → published` |
| `test_finance_vault.py` | Finance summary numbers; vault doc CRUD + scope rules |
| `test_chat_ws.py` | History; POST persists; WebSocket echo; bad token → 4401 |
| `test_cors.py` | Allowed origin preflight 200; disallowed origin blocked |
| `test_validation.py` | Bad payloads → 422 (not 500) |

**RBAC assertions baked in:** cofounder reads all depts; `priya` (ops lead) sees only operations tasks
(cross-dept request → 403); `dev@vision.agency` (teammate) sees only assigned tasks; marketing lead
blocked from `/api/leads` and `/api/users`.

---

## 4. Frontend test suite (Vitest + Testing Library)

devDependencies added: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`.
Add `"test": "vitest run"` to `package.json` scripts and a `test` block in `vite.config.js`
(environment `jsdom`, setup file `src/setupTests.js`).

| File | Covers |
|------|--------|
| `roles.test.jsx` | `canViewNav`/`canViewRoute` matrix: cofounder→all; lead→own dept; teammate→hot own tasks; vault only for cofounder |
| `api.test.js` | mocked `fetch`: JWT header attached; `/api` prefix; 401 clears token + redirects to `/login` |
| `ws.test.js` | mocked WebSocket: connect, on-message callback, auto-reconnect/backoff |
| `Login.test.jsx` | renders; demo account autofills; submit calls `login()` |
| `Sidebar.test.jsx` | nav filtered by role; active link highlight |
| `Guard.test.jsx` | allowed code renders child, denied code redirects to `/` |
| `pages smoke tests` | `Executive`, `SalesCRM`, `Operations`, `Marketing`, `TeamVault` render with mocked API responses and empty/error states |

---

## 5. Manual / Data-Integrity Walkthrough (do this before shipping)

These belong in the browser against a **live** booted stack. They exercise real data mutation
in a way automated suites can't (visual states, two tabs, real Gemini).

### 5.1 Boot everything
```powershell
# terminal 1
cd backend && .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
# terminal 2
cd frontend && npm run dev
```
Open http://localhost:5173. Expect "VisionTrack — Agency OS". If login fails:
confirm backend on :8000 and CORS allowlist `http://localhost:5173`.

### 5.2 Role matrix (repeat for each demo account)

| Account | Role | Expect to SEE | Expect to be DENIED |
|---------|------|---------------|---------------------|
| `ava@vision.agency / cofound123` | Co-Founder | all 5 nav pages + Team & Vault | nothing |
| `marcus@vision.agency / lead123` | Sales Lead | Command Center + Sales | Operations/Marketing/Vault nav |
| `zoe@vision.agency / lead123` | Marketing Lead | Command Center + Marketing | Sales, Operations, Vault |
| `priya@vision.agency / lead123` | Ops Lead | Command Center + Operations | Sales, Marketing, Vault |
| `sam@vision.agency / lead123` | Finance | Command Center + Vault (Finance scope) | Sales/Operations/Marketing nav |
| `dana@vision.agency / lead123` | Legal | Command Center + Vault (Legal scope) | Sales/Operations/Marketing nav |
| `theo@vision.agency / team123` | Teammate (Sales) | own Tasks only | everything else |

Check: sidebar items match the role column; typing an unauthorized URL redirects to `/`.

### 5.3 Data write/update checks (POST → verify GET)

On every page, after every mutation, **refresh / re-fetch** and confirm the change persisted:

1. **Command Center (Executive)**
   - KPIs (Revenue, Pipe, Tasks, Open deals) update after actions 2–6 below.
   - Task Health bars react to task state changes.
2. **Sales CRM**
   - Add a new lead → appears in the table (New).
   - Advance: New → Contacted → Closing; edit notes → persists on reload.
   - **Sign deal** → toast "Signed"; finance revenue increases; 5 tasks appear in Ops/Marketing boards.
3. **Operations**
   - New tasks from the workflow appear Queued with an **AI** chip.
   - Start / Ready review / Complete → moves across columns; complete shows AI-chained successor task in the backlog; two completes in a row chain a logical sequence.
   - "Suggest" per project → 3 options; Accept pushes it into Queued.
4. **Marketing**
   - Metric cards (Followers, Reach, Engagement, Profile views) reflect the metrics vault.
   - Create a post (draft) → table row appears; Schedule → status=scheduled; Mark published → status=published with engagement count.
   - IG/Email sparklines render trends.
5. **Team & Vault**
   - Create a user (lead reports) → shows in roster; Disable → shows Disabled; Enable → Active
   - Invite teammate; log in as them → they see only their tasks.
   - Finance & Legal docs: file a doc → appears under the correct dept with access_code.
6. **Chat**
   - Open the drawer for a dept; send a message → appears instantly (optimistic).
   - **Second browser tab** logged in as another user on the same dept receives it live (WebSocket broadcast).
   - Restart backend → chat history reloads (persisted in SQLite).

### 5.4 Fresh-boot seed idempotency
1. Stop backend; delete (or rename) `backend/visiontrack.db`.
2. Restart → app re-seeds exactly once ("VisionTrack demo database seeded").
3. Restart again → no duplicate rows (12 leads, 5 depts, 9 users, 5 docs).
4. Kill an unrelated process if port 8000 is taken — the remaining server must still respond to `/health`.

### 5.5 Real-Gemini check (outside unit tests)
With `GEMINI_API_KEY` set, complete a task and a variant of a project: confirm Gemini actually
proposes a next task (the `note` text differs vs. fallback) and that `ai_generated=True` rows are created.

---

## 6. Test Data Reference (auto-seeded)

| Entity | Count | Details |
|--------|-------|---------|
| Departments | 5 | Sales, Marketing, Operations, Finance, Legal |
| Users | 9+ | 1 cofounder, 5 leads, 3+ teammates (see login table above) |
| Leads | 12 | mixed statuses: new/contacted/closing/closed |
| Projects | seeded | with tasks across ops/marketing |
| Social posts / Metrics | seeded | Instagram + email series for 14 days |
| Vault docs | 5 | contracts, NDAs, policies |

---

## 7. Docs to update when tests change

- `README.md` — run commands + what's covered stay in sync with this file.
- `testing.md` (this file) — add a row any time a new module/endpoint lands.
- `plan.md` §7 "Verification Checklist" — reflect the final passing counts.

---

## 8. Build & ship (final green gate)

```bash
cd backend  && .\.venv\Scripts\python.exe -m pytest -q          # expect ~140+ passed
cd frontend && npm test && npm run build                        # vitest + prod bundle
cd backend  && .\.venv\Scripts\python.exe -m scripts.smoke      # 19/19 live
```

All three green = VisionTrack shippable for this release.