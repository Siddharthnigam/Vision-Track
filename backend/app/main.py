from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from . import config
from .database import Base, SessionLocal, engine, get_db
from .models import (
    ChatMessage,
    Department,
    DocItem,
    Lead,
    Metric,
    Project,
    SalesImport,
    SocialPost,
    Task,
    User,
)
from .schemas import (
    AiNextTask,
    AiSuggestResponse,
    ChatCreate,
    ChatOutWithUser,
    DepartmentOut,
    DocCreate,
    DocOut,
    FinanceSummary,
    ImportedLead,
    LoginRequest,
    LeadCreate,
    LeadOut,
    LeadOutWithOwner,
    LeadSignResult,
    LeadUpdate,
    MarketingSummary,
    MetricOut,
    ProjectCreate,
    ProjectOut,
    ProjectUpdate,
    SalesImportAccept,
    SalesImportOut,
    SalesImportPreview,
    SocialPostCreate,
    SocialPostOut,
    SocialPostUpdate,
    TaskCompleteResponse,
    TaskCreate,
    TaskUpdate,
    TaskWithNames,
    TokenResponse,
    UserCreate,
    UserUpdate,
    UserWithDept,
)
from .services import ai_scheduler, sales_import, security


@asynccontextmanager
async def _lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    _migrate_leads_schema()
    _backfill_lead_fields()
    try:
        from scripts.seed import run as seed_demo

        seed_demo()
    except Exception:
        pass
    yield


app = FastAPI(
    title="VisionTrack API",
    version="1.0.0",
    description="Agency OS - task management, AI allocation & department automation.",
    lifespan=_lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------- helpers


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


def _backfill_lead_fields() -> None:
    """Split old combined stage_note (Category · Address · Phone · Website) into fields."""
    db = SessionLocal()
    try:
        leads = db.execute(select(Lead)).scalars().all()
        changed = False
        for lead in leads:
            if lead.phone or lead.category or lead.address or lead.website:
                continue
            note = lead.stage_note or ""
            cleaned = []
            address_parts: list[str] = []
            for part in note.split(" · "):
                part = part.strip()
                if not part:
                    continue
                if part.startswith("Category: ") and not lead.category:
                    lead.category = part[len("Category: "):]
                elif part.startswith("Phone: ") and not lead.phone:
                    lead.phone = part[len("Phone: "):]
                elif part.startswith("Website: ") and not lead.website:
                    lead.website = part[len("Website: "):]
                elif part.startswith("Email: ") and not lead.email:
                    lead.email = part[len("Email: "):]
                elif part.startswith(("Category:", "Phone:", "Website:", "Email:")):
                    cleaned.append(part)
                else:
                    address_parts.append(part)
            if address_parts:
                lead.address = " · ".join(address_parts) or None
            if lead.category or lead.phone or lead.website or lead.address or lead.email:
                lead.stage_note = " · ".join(cleaned) or None
                changed = True
        if changed:
            db.commit()
    finally:
        db.close()


def _task(t: Task) -> TaskWithNames:
    return TaskWithNames(
        id=t.id,
        title=t.title,
        description=t.description,
        status=t.status,
        priority=t.priority,
        department_id=t.department_id,
        project_id=t.project_id,
        assignee_id=t.assignee_id,
        creator_id=t.creator_id,
        due_date=t.due_date,
        ai_generated=t.ai_generated,
        source=t.source,
        created_at=t.created_at,
        completed_at=t.completed_at,
        assignee_name=t.assignee.name if t.assignee else None,
        project_name=t.project.name if t.project else None,
        dept_code=t.department.code if t.department else None,
    )


def _lead(l: Lead) -> LeadOutWithOwner:
    data = LeadOut.model_validate(l).model_dump()
    data["owner_name"] = l.owner.name if l.owner else None
    return LeadOutWithOwner(**data)


def _chat_out(m: ChatMessage) -> ChatOutWithUser:
    return ChatOutWithUser(
        id=m.id,
        user_id=m.user_id,
        department_id=m.department_id,
        body=m.body,
        tag=m.tag,
        thread_id=m.thread_id,
        created_at=m.created_at,
        user_name=m.user.name if m.user else "unknown",
    )


def _guard_scope(user: User, code: str) -> None:
    if user.role != "cofounder" and user.dept_code != code:
        raise HTTPException(status_code=403, detail=f"Requires {code} scope.")


def _find_dept_id(db: Session, code: str) -> int:
    dept = db.execute(select(Department).where(Department.code == code)).scalar_one_or_none()
    return dept.id if dept else -1


# ---------------------------------------------------------------- websocket


class ConnectionManager:
    def __init__(self) -> None:
        self.rooms: dict[str, set[WebSocket]] = {}

    async def connect(self, ws: WebSocket, room: str) -> None:
        await ws.accept()
        self.rooms.setdefault(room, set()).add(ws)

    def disconnect(self, ws: WebSocket, room: str) -> None:
        self.rooms.get(room, set()).discard(ws)

    async def broadcast(self, room: str, payload: dict) -> None:
        stale = []
        for ws in list(self.rooms.get(room, set())):
            try:
                await ws.send_json(payload)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self.disconnect(ws, room)


manager = ConnectionManager()


@app.websocket("/ws/chat")
async def ws_chat(websocket: WebSocket):
    db = SessionLocal()
    try:
        user = security.user_from_token(websocket.query_params.get("token", ""), db)
    except Exception:
        user = None
    if user is None:
        await websocket.close(code=4401)
        db.close()
        return

    try:
        dept_id = int(websocket.query_params.get("dept_id", "0") or "0")
    except ValueError:
        dept_id = 0
    if user.role != "cofounder" and (not dept_id or dept_id != user.department_id):
        dept_id = user.department_id if user.department_id else 0

    room = f"dept:{dept_id}"
    await manager.connect(websocket, room)
    try:
        while True:
            data = await websocket.receive_json()
            body = (data.get("body") or "").strip()
            if not body:
                continue
            msg = ChatMessage(
                user_id=user.id,
                department_id=dept_id,
                body=body[:2000],
                tag=data.get("tag") or "general",
                thread_id=data.get("thread_id"),
            )
            db.add(msg)
            db.commit()
            db.refresh(msg)
            await manager.broadcast(
                room,
                {
                    "id": msg.id,
                    "user_id": user.id,
                    "user_name": user.name,
                    "department_id": dept_id,
                    "body": msg.body,
                    "tag": msg.tag,
                    "thread_id": msg.thread_id,
                    "created_at": msg.created_at.isoformat(),
                },
            )
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        manager.disconnect(websocket, room)
        db.close()


# ----------------------------------------------------------------- health


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "visiontrack-api",
        "version": app.version,
        "model": config.settings.GEMINI_MODEL,
        "ai_enabled": bool(config.settings.GEMINI_API_KEY),
    }


# ------------------------------------------------------------------- auth


@app.post("/api/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.execute(
        select(User).where(User.email == payload.email.strip().lower())
    ).scalar_one_or_none()
    if user is None or not security.verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials.")
    if not user.active:
        raise HTTPException(status_code=403, detail="Account disabled.")
    token = security.create_token(user)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserWithDept(
            id=user.id,
            name=user.name,
            email=user.email,
            role=user.role,
            active=user.active,
            department_id=user.department_id,
            created_at=user.created_at,
            dept_code=user.dept_code,
            dept_name=user.dept_name,
        ),
    )


@app.get("/api/auth/me", response_model=UserWithDept)
def me(user: User = Depends(security.get_current_user)):
    return UserWithDept(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        active=user.active,
        department_id=user.department_id,
        created_at=user.created_at,
        dept_code=user.dept_code,
        dept_name=user.dept_name,
    )


# ---------------------------------------------------------- departments


@app.get("/api/departments", response_model=list[DepartmentOut])
def list_departments(db: Session = Depends(get_db)):
    return db.execute(select(Department).order_by(Department.id)).scalars().all()


# ---------------------------------------------------------------- users


@app.get("/api/users", response_model=list[UserWithDept])
def list_users(
    _: User = Depends(security.RoleGuard(min_role="cofounder")),
    db: Session = Depends(get_db),
):
    users = db.execute(select(User).order_by(User.id)).scalars().all()
    return [
        UserWithDept(
            id=u.id,
            name=u.name,
            email=u.email,
            role=u.role,
            active=u.active,
            department_id=u.department_id,
            created_at=u.created_at,
            dept_code=u.dept_code,
            dept_name=u.dept_name,
        )
        for u in users
    ]


@app.get("/api/team", response_model=list[UserWithDept])
def list_team_members(
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(User)
    if user.role != "cofounder" and user.department_id:
        stmt = stmt.where(User.department_id == user.department_id)
    members = db.execute(stmt.order_by(User.id)).scalars().all()
    return [
        UserWithDept(
            id=u.id,
            name=u.name,
            email=u.email,
            role=u.role,
            active=u.active,
            department_id=u.department_id,
            created_at=u.created_at,
            dept_code=u.dept_code,
            dept_name=u.dept_name,
        )
        for u in members
    ]


@app.post("/api/users", response_model=UserWithDept)
def create_user(
    payload: UserCreate,
    _: User = Depends(security.RoleGuard(min_role="cofounder")),
    db: Session = Depends(get_db),
):
    email = payload.email.strip().lower()
    exists = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="Email already registered.")
    if payload.role not in ("cofounder", "lead", "teammate"):
        raise HTTPException(status_code=422, detail="Invalid role.")
    user = User(
        name=payload.name,
        email=email,
        password_hash=security.hash_password(payload.password),
        role=payload.role,
        department_id=payload.department_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _user_with_dept(user)


@app.patch("/api/users/{user_id}", response_model=UserWithDept)
def update_user(
    user_id: int,
    payload: UserUpdate,
    _: User = Depends(security.RoleGuard(min_role="cofounder")),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    if payload.role is not None and payload.role not in ("cofounder", "lead", "teammate"):
        raise HTTPException(status_code=422, detail="Invalid role.")
    for field in ("name",):
        if getattr(payload, field) is not None:
            setattr(user, field, getattr(payload, field))
    if payload.role is not None:
        user.role = payload.role
    if payload.department_id is not None:
        user.department_id = payload.department_id
    if payload.active is not None:
        user.active = payload.active
    if payload.password:
        user.password_hash = security.hash_password(payload.password)
    db.commit()
    db.refresh(user)
    return _user_with_dept(user)


def _user_with_dept(user: User) -> UserWithDept:
    return UserWithDept(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        active=user.active,
        department_id=user.department_id,
        created_at=user.created_at,
        dept_code=user.dept_code,
        dept_name=user.dept_name,
    )


# ----------------------------------------------------------------- tasks


def _task_scope_filter(user: User, stmt):
    if user.role == "cofounder":
        return stmt
    if user.role == "teammate":
        return stmt.where(Task.assignee_id == user.id)
    return stmt.where(Task.department_id == user.department_id)


@app.get("/api/tasks", response_model=list[TaskWithNames])
def list_tasks(
    dept_code: Optional[str] = None,
    assignee_id: Optional[int] = None,
    status: Optional[str] = None,
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    stmt = _task_scope_filter(user, select(Task))
    if dept_code:
        stmt = stmt.where(Task.department_id == _find_dept_id(db, dept_code))
    if assignee_id:
        stmt = stmt.where(Task.assignee_id == assignee_id)
    if status:
        stmt = stmt.where(Task.status == status)
    tasks = db.execute(stmt.order_by(Task.created_at.desc())).scalars().all()
    return [_task(t) for t in tasks]


@app.post("/api/tasks", response_model=TaskWithNames)
def create_task(
    payload: TaskCreate,
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    dept = db.get(Department, payload.department_id)
    if dept is None:
        raise HTTPException(status_code=404, detail="Unknown department.")
    if user.role != "cofounder" and user.department_id != dept.id:
        raise HTTPException(status_code=403, detail="Outside your department scope.")
    if user.role == "teammate" and payload.assignee_id and payload.assignee_id != user.id:
        raise HTTPException(status_code=403, detail="Teammates can only self-assign.")
    if payload.project_id is not None:
        project = db.get(Project, payload.project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Unknown project.")
    task = Task(
        title=payload.title,
        description=payload.description,
        status=payload.status,
        priority=payload.priority,
        department_id=payload.department_id,
        project_id=payload.project_id,
        assignee_id=payload.assignee_id or user.id,
        creator_id=user.id,
        due_date=payload.due_date,
        ai_generated=payload.ai_generated,
        source=payload.source,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _task(task)


@app.patch("/api/tasks/{task_id}", response_model=TaskWithNames)
def update_task(
    task_id: int,
    payload: TaskUpdate,
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    allowed = user.role == "cofounder" or (
        user.role == "teammate" and user.id == task.assignee_id
    ) or (user.role == "lead" and user.department_id == task.department_id)
    if not allowed:
        raise HTTPException(status_code=403, detail="Not permitted to edit this task.")
    if payload.project_id is not None:
        project = db.get(Project, payload.project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Unknown project.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    return _task(task)


@app.delete("/api/tasks/{task_id}")
def delete_task(
    task_id: int,
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    if user.role != "cofounder" and (
        user.role != "lead" or user.department_id != task.department_id
    ):
        raise HTTPException(status_code=403, detail="Not permitted to delete this task.")
    db.delete(task)
    db.commit()
    return {"ok": True}


@app.post("/api/tasks/{task_id}/complete", response_model=TaskCompleteResponse)
async def complete_task(
    task_id: int,
    auto_commit: bool = True,
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    allowed = user.role == "cofounder" or (
        user.role == "teammate" and user.id == task.assignee_id
    ) or (user.role == "lead" and user.department_id == task.department_id)
    if not allowed:
        raise HTTPException(status_code=403, detail="Not your task.")

    if task.status != "done":
        task.status = "done"
        task.completed_at = datetime.utcnow()
        db.commit()
        db.refresh(task)

    suggestion = await ai_scheduler.suggest_next(db, task)
    created = None
    if auto_commit and suggestion:
        created = ai_scheduler.commit_next(
            db, suggestion, user, source=f"chain:{task.id}:complete"
        )

    suggested_next = None
    if created is None:
        suggested_next = AiNextTask(
            title=suggestion["title"] if suggestion else "",
            description=suggestion["description"] if suggestion else "",
            dept_code=suggestion["dept_code"] if suggestion else "",
            priority=suggestion["priority"] if suggestion else "medium",
            due_in_days=suggestion["due_in_days"] if suggestion else 3,
            assignee_hint=(suggestion or {}).get("assignee_hint"),
        )

    return TaskCompleteResponse(
        task=_task(task),
        auto_created=created is not None,
        suggested_next=suggested_next,
        note=(
            f"AI chained task \"{created.title}\" into "
            f"{created.department.name if created.department else 'auto'}."
            if created
            else "No Gemini key - rule-based next task suggested for approval."
        ),
    )


# -------------------------------------------------------------- projects


@app.get("/api/projects", response_model=list[ProjectOut])
def list_projects(
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(Project)
    if user.role != "cofounder":
        if user.department_id:
            stmt = stmt.where(Project.department_id == user.department_id)
        else:
            stmt = stmt.where(Project.id == -1)
    return db.execute(stmt.order_by(Project.created_at.desc())).scalars().all()


@app.post("/api/projects", response_model=ProjectOut)
def create_project(
    payload: ProjectCreate,
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    dept = db.get(Department, payload.department_id)
    if dept is None:
        raise HTTPException(status_code=404, detail="Unknown department.")
    if user.role != "cofounder" and user.department_id != dept.id:
        raise HTTPException(status_code=403, detail="Outside your department scope.")
    project = Project(**payload.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@app.patch("/api/projects/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    if user.role != "cofounder" and user.department_id != project.department_id:
        raise HTTPException(status_code=403, detail="Outside your department scope.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return project


@app.get("/api/projects/{project_id}/ai/suggest", response_model=AiSuggestResponse)
async def suggest_for_project(
    project_id: int,
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    if user.role != "cofounder" and user.department_id != project.department_id:
        raise HTTPException(status_code=403, detail="Outside your department scope.")
    options = await ai_scheduler.suggest_options(db, project, count=3)
    return AiSuggestResponse(project_id=project.id, options=options)


# ----------------------------------------------------------------- leads


@app.get("/api/leads", response_model=list[LeadOutWithOwner])
def list_leads(
    status: Optional[str] = None,
    q: Optional[str] = None,
    mine: bool = False,
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    _guard_scope(user, "sales")
    stmt = select(Lead)
    if status:
        stmt = stmt.where(Lead.status == status)
    if mine:
        stmt = stmt.where(Lead.owner_id == user.id)
    if q:
        term = f"%{q.strip()}%"
        stmt = stmt.where(
            Lead.company.ilike(term)
            | Lead.contact.ilike(term)
            | Lead.phone.ilike(term)
            | Lead.category.ilike(term)
            | Lead.address.ilike(term)
            | Lead.website.ilike(term)
        )
    leads = db.execute(stmt.order_by(Lead.created_at.desc())).scalars().all()
    return [_lead(l) for l in leads]


@app.post("/api/leads", response_model=LeadOut)
def create_lead(
    payload: LeadCreate,
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    _guard_scope(user, "sales")
    lead = Lead(**payload.model_dump(exclude_unset=True))
    if not lead.owner_id:
        lead.owner_id = user.id
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead


@app.patch("/api/leads/{lead_id}", response_model=LeadOut)
def update_lead(
    lead_id: int,
    payload: LeadUpdate,
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    _guard_scope(user, "sales")
    lead = db.get(Lead, lead_id)
    if lead is None:
        raise HTTPException(status_code=404, detail="Lead not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(lead, field, value)
    db.commit()
    db.refresh(lead)
    return lead


@app.delete("/api/leads/{lead_id}")
def delete_lead(
    lead_id: int,
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    _guard_scope(user, "sales")
    lead = db.get(Lead, lead_id)
    if lead is None:
        raise HTTPException(status_code=404, detail="Lead not found.")
    db.delete(lead)
    db.commit()
    return {"ok": True, "id": lead_id}


@app.post("/api/leads/{lead_id}/sign", response_model=LeadSignResult)
async def sign_lead(
    lead_id: int,
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    _guard_scope(user, "sales")
    lead = db.get(Lead, lead_id)
    if lead is None:
        raise HTTPException(status_code=404, detail="Lead not found.")

    lead.status = "closed"
    lead.signed_at = datetime.utcnow()
    db.commit()
    db.refresh(lead)

    workflow = ai_scheduler.LEAD_WORKFLOW
    created: list[Task] = []
    notes: list[str] = []

    def _apply(code: str) -> None:
        section = workflow.get(code)
        if not section:
            return
        dept = db.execute(select(Department).where(Department.code == code)).scalar_one_or_none()
        if dept is None:
            return
        project = None
        if code == "operations":
            project = Project(
                name=section["title"].format(company=lead.company),
                client=lead.company,
                department_id=dept.id,
                status="active",
                description=f"Onboarding project auto-created from signed lead: {lead.company}.",
            )
            db.add(project)
            db.flush()
        assignee = None
        if code == "operations":
            assignee = db.execute(
                select(User).where(User.email == "priya@vision.agency")
            ).scalar_one_or_none()
        elif code == "marketing":
            assignee = db.execute(
                select(User).where(User.email == "zoe@vision.agency")
            ).scalar_one_or_none()
        for idx, title in enumerate(section["tasks"]):
            task = Task(
                title=title,
                description=f"Auto-created from signed lead: {lead.company}.",
                status="queued",
                priority="high",
                department_id=dept.id,
                project_id=project.id if project else None,
                assignee_id=assignee.id if assignee else None,
                creator_id=user.id,
                due_date=date.today() + timedelta(days=3 + idx),
                ai_generated=True,
                source="lead-sign",
            )
            db.add(task)
            created.append(task)
        notes.append(f"Created {len(section['tasks'])} {code.upper()} task(s).")

    _apply("operations")
    _apply("marketing")
    db.commit()
    for t in created:
        db.refresh(t)

    return LeadSignResult(
        lead=lead,
        created_tasks=[_task(t) for t in created],
        notes=notes,
    )


# --------------------------------------------------------------- sales import


def _sales_dept_id(db: Session) -> int:
    return _find_dept_id(db, "sales")


def _preview(db: Session, imp: SalesImport, leads: list[dict], skipped: int) -> SalesImportPreview:
    imp.row_count = len(leads)
    db.add(imp)
    db.commit()
    db.refresh(imp)
    return SalesImportPreview(
        source=SalesImportOut.model_validate(imp),
        leads=[ImportedLead(**l) for l in leads],
        skipped=skipped,
    )


@app.get("/api/sales/imports", response_model=list[SalesImportOut])
def list_sales_imports(
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    _guard_scope(user, "sales")
    imports = (
        db.execute(select(SalesImport).order_by(SalesImport.created_at.desc()).limit(50))
        .scalars()
        .all()
    )
    return [SalesImportOut.model_validate(i) for i in imports]


@app.post("/api/sales/imports/file", response_model=SalesImportPreview)
def import_sales_file(
    file: UploadFile = File(...),
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    _guard_scope(user, "sales")
    data = file.file.read()
    if not data:
        raise HTTPException(status_code=422, detail="Empty file.")
    leads, skipped = sales_import.parse_file(file.filename or "upload", data)

    file_ref = None
    if file.filename:
        ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin").lower()
        name = f"{sales_import.timestamp_token()}_{user.id}_{levenshtein_token(file.filename)}"
        file_ref = _save_upload(name, ext, data)

    imp = SalesImport(
        department_id=_sales_dept_id(db),
        title=(file.filename or "Imported file").rsplit("/", 1)[-1][:200],
        source_type="file",
        filename=file.filename,
        file_ref=file_ref,
        row_count=0,
        created_by=user.id,
    )
    return _preview(db, imp, leads, skipped)


def levenshtein_token(name: str) -> str:
    import hashlib

    return hashlib.sha256(name.encode("utf-8")).hexdigest()[:8]


def _save_upload(prefix: str, ext: str, data: bytes) -> str:
    import os

    file_dir = os.path.join(config.settings.BASE_DIR, "uploads", "sales")
    os.makedirs(file_dir, exist_ok=True)
    filename = f"{prefix}.{ext}"
    with open(os.path.join(file_dir, filename), "wb") as fh:
        fh.write(data)
    return f"uploads/sales/{filename}"


@app.post("/api/sales/imports/text", response_model=SalesImportPreview)
def import_sales_text(
    title: str = Form(""),
    text: str = Form(""),
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    _guard_scope(user, "sales")
    if not text.strip():
        raise HTTPException(status_code=422, detail="No text provided.")
    leads, skipped = sales_import.parse_text_input(text)
    imp = SalesImport(
        department_id=_sales_dept_id(db),
        title=title.strip()[:200] or "Pasted sales notes",
        source_type="text",
        filename=None,
        file_ref=None,
        row_count=0,
        created_by=user.id,
    )
    return _preview(db, imp, leads, skipped)


@app.post("/api/sales/imports/{import_id}/accept", response_model=list[LeadOut])
def accept_sales_import(
    import_id: int,
    payload: SalesImportAccept,
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    _guard_scope(user, "sales")
    imp = db.get(SalesImport, import_id)
    if imp is None:
        raise HTTPException(status_code=404, detail="Import not found.")
    created: list[Lead] = []
    for item in payload.leads:
        lead = Lead(
            company=item.company,
            contact=item.contact,
            phone=item.phone,
            email=item.email,
            category=item.category,
            address=item.address,
            website=item.website,
            value=item.value,
            status=item.status,
            stage_note=item.stage_note,
            owner_id=user.id,
        )
        db.add(lead)
        created.append(lead)
    db.commit()
    for lead in created:
        db.refresh(lead)
    return created


# --------------------------------------------------------------- marketing


@app.get("/api/marketing/summary", response_model=MarketingSummary)
def marketing_summary(
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    _guard_scope(user, "marketing")
    metrics = (
        db.execute(select(Metric).order_by(Metric.recorded_on.desc()).limit(200))
        .scalars()
        .all()
    )
    posts = (
        db.execute(select(SocialPost).order_by(SocialPost.scheduled_at.desc()))
        .scalars()
        .all()
    )
    instagram = [MetricOut.model_validate(m) for m in metrics if m.platform == "instagram"]
    email = [MetricOut.model_validate(m) for m in metrics if m.platform == "email"]
    return MarketingSummary(
        instagram=instagram[:60],
        email=email[:32],
        posts=[SocialPostOut.model_validate(p) for p in posts],
    )


@app.get("/api/posts", response_model=list[SocialPostOut])
def list_posts(
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    _guard_scope(user, "marketing")
    return (
        db.execute(select(SocialPost).order_by(SocialPost.scheduled_at.desc()))
        .scalars()
        .all()
    )


@app.post("/api/posts", response_model=SocialPostOut)
def create_post(
    payload: SocialPostCreate,
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    _guard_scope(user, "marketing")
    post = SocialPost(**payload.model_dump())
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


@app.patch("/api/posts/{post_id}", response_model=SocialPostOut)
def update_post(
    post_id: int,
    payload: SocialPostUpdate,
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    _guard_scope(user, "marketing")
    post = db.get(SocialPost, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(post, field, value)
    db.commit()
    db.refresh(post)
    return post


# ---------------------------------------------------------------- finance


@app.get("/api/finance/summary", response_model=FinanceSummary)
def finance_summary(
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "cofounder" and user.dept_code != "finance":
        raise HTTPException(status_code=403, detail="Requires finance scope.")

    closed = db.execute(
        select(func.sum(Lead.value)).where(Lead.status == "closed")
    ).scalar_one()
    pipeline = db.execute(
        select(func.sum(Lead.value)).where(Lead.status.in_(["new", "contacted", "closing"]))
    ).scalar_one()
    signed = db.execute(
        select(func.count(Lead.id)).where(Lead.status == "closed")
    ).scalar_one()
    open_leads = db.execute(
        select(func.count(Lead.id)).where(Lead.status.in_(["new", "contacted", "closing"]))
    ).scalar_one()

    fin_dept = db.execute(select(Department).where(Department.code == "finance")).scalar_one_or_none()
    invoices: list[DocOut] = []
    if fin_dept:
        items = (
            db.execute(
                select(DocItem)
                .where(DocItem.department_id == fin_dept.id)
                .order_by(DocItem.created_at.desc())
            )
            .scalars()
            .all()
        )
        invoices = [DocOut.model_validate(d) for d in items]

    return FinanceSummary(
        total_revenue=float(closed or 0.0),
        pipeline_value=float(pipeline or 0.0),
        signed_leads=signed or 0,
        open_leads=open_leads or 0,
        invoices=invoices,
    )


# -------------------------------------------------------------- vault/docs


@app.get("/api/vault/docs", response_model=list[DocOut])
def list_docs(
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(DocItem)
    if user.role != "cofounder":
        stmt = stmt.where(
            DocItem.department_id == (user.department_id or -1),
            DocItem.access_code == "dept",
        )
    docs = db.execute(stmt.order_by(DocItem.created_at.desc())).scalars().all()
    return [DocOut.model_validate(d) for d in docs]


@app.post("/api/vault/docs", response_model=DocOut)
def create_doc(
    payload: DocCreate,
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    _guard_scope(user, "legal")
    doc = DocItem(**payload.model_dump())
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


# ------------------------------------------------------------------- chat


@app.get("/api/chat", response_model=list[ChatOutWithUser])
def list_chat(
    department_id: int,
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "cofounder" and user.department_id != department_id:
        raise HTTPException(status_code=403, detail="Not a member of that department.")
    messages = (
        db.execute(
            select(ChatMessage)
            .where(ChatMessage.department_id == department_id)
            .order_by(ChatMessage.created_at.desc())
        )
        .scalars()
        .all()
    )[:50]
    return [_chat_out(m) for m in reversed(messages)]


@app.post("/api/chat", response_model=ChatOutWithUser)
async def post_chat(
    payload: ChatCreate,
    user: User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "cofounder" and user.department_id != payload.department_id:
        raise HTTPException(status_code=403, detail="Not a member of that department.")
    msg = ChatMessage(
        user_id=user.id,
        department_id=payload.department_id,
        body=payload.body,
        tag=payload.tag,
        thread_id=payload.thread_id,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    await manager.broadcast(
        f"dept:{msg.department_id}",
        {
            "id": msg.id,
            "user_id": user.id,
            "user_name": user.name,
            "department_id": msg.department_id,
            "body": msg.body,
            "tag": msg.tag,
            "thread_id": msg.thread_id,
            "created_at": msg.created_at.isoformat(),
        },
    )
    return _chat_out(msg)