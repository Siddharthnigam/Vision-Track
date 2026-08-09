from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------- Auth / User


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=255)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: str
    active: bool
    department_id: Optional[int] = None
    created_at: datetime


class UserWithDept(UserOut):
    dept_code: Optional[str] = None
    dept_name: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserWithDept


class UserCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=4, max_length=255)
    role: str = Field(default="teammate")
    department_id: Optional[int] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    department_id: Optional[int] = None
    active: Optional[bool] = None
    password: Optional[str] = None


# ------------------------------------------------------------ Departments


class DepartmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    color: str


# ------------------------------------------------------------------ Tasks


class TaskBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    status: str = Field(default="queued")
    priority: str = Field(default="medium")
    department_id: int
    project_id: Optional[int] = None
    assignee_id: Optional[int] = None
    due_date: Optional[date] = None


class TaskCreate(TaskBase):
    ai_generated: bool = False
    source: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    department_id: Optional[int] = None
    project_id: Optional[int] = None
    assignee_id: Optional[int] = None
    due_date: Optional[date] = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str] = None
    status: str
    priority: str
    department_id: int
    project_id: Optional[int] = None
    assignee_id: Optional[int] = None
    creator_id: Optional[int] = None
    due_date: Optional[date] = None
    ai_generated: bool
    source: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


class TaskWithNames(TaskOut):
    assignee_name: Optional[str] = None
    project_name: Optional[str] = None
    dept_code: Optional[str] = None


# ----------------------------------------------------------------- AI


class AiNextTask(BaseModel):
    title: str
    description: str
    dept_code: str
    priority: str = "medium"
    due_in_days: int = 3
    assignee_hint: Optional[str] = None


class TaskCompleteResponse(BaseModel):
    task: TaskOut
    auto_created: bool
    suggested_next: Optional[AiNextTask] = None
    note: str


# --------------------------------------------------------------- Projects


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    client: Optional[str] = None
    description: Optional[str] = None
    status: str = "active"
    department_id: int
    start_date: Optional[date] = None
    due_date: Optional[date] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    client: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[date] = None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    client: Optional[str] = None
    description: Optional[str] = None
    status: str
    department_id: int
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    created_at: datetime


class ProjectWithTasks(ProjectOut):
    tasks: list[TaskOut] = []


class AiSuggestResponse(BaseModel):
    project_id: int
    options: list[AiNextTask] = []


# ------------------------------------------------------------------ Leads


class LeadCreate(BaseModel):
    company: str = Field(..., min_length=1, max_length=160)
    contact: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    category: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    value: float = Field(default=0.0, ge=0)
    status: str = Field(default="new")
    stage_note: Optional[str] = None
    owner_id: Optional[int] = None


class LeadUpdate(BaseModel):
    company: Optional[str] = None
    contact: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    category: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    value: Optional[float] = None
    status: Optional[str] = None
    stage_note: Optional[str] = None
    owner_id: Optional[int] = None


class LeadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company: str
    contact: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    category: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    value: float
    status: str
    stage_note: Optional[str] = None
    owner_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    signed_at: Optional[datetime] = None


class LeadOutWithOwner(LeadOut):
    owner_name: Optional[str] = None


class LeadSignResult(BaseModel):
    lead: LeadOut
    created_tasks: list[TaskOut] = []
    notes: list[str] = []


# ---------------------------------------------------------------- Sales import


class ImportedLead(BaseModel):
    company: str
    contact: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    category: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    value: float = 0.0
    status: str = "new"
    stage_note: Optional[str] = None


class SalesImportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    department_id: int
    title: str
    source_type: str
    filename: Optional[str] = None
    file_ref: Optional[str] = None
    row_count: int
    created_by: Optional[int] = None
    created_at: datetime


class SalesImportPreview(BaseModel):
    source: SalesImportOut
    leads: list[ImportedLead]
    skipped: int = 0
    error: Optional[str] = None


class SalesImportAccept(BaseModel):
    leads: list[ImportedLead]


# --------------------------------------------------------------- Marketing


class SocialPostCreate(BaseModel):
    platform: str = Field(default="instagram")
    content: str = Field(..., min_length=1)
    scheduled_at: Optional[datetime] = None
    status: str = "draft"


class SocialPostUpdate(BaseModel):
    content: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    status: Optional[str] = None


class SocialPostOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    platform: str
    content: str
    scheduled_at: Optional[datetime] = None
    status: str
    engagement: int
    created_at: datetime


class MetricOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    platform: str
    label: str
    value: float
    unit: Optional[str] = None
    recorded_on: date


class MarketingSummary(BaseModel):
    instagram: list[MetricOut] = []
    email: list[MetricOut] = []
    posts: list[SocialPostOut] = []


# ----------------------------------------------------------------- Finance


class FinanceSummary(BaseModel):
    total_revenue: float = 0.0
    pipeline_value: float = 0.0
    signed_leads: int = 0
    open_leads: int = 0
    invoices: list["DocOut"] = []


# --------------------------------------------------------------- Vault / Docs


class DocCreate(BaseModel):
    department_id: int
    title: str = Field(..., min_length=1, max_length=200)
    doc_type: str = "policy"
    file_ref: Optional[str] = None
    access_code: str = "dept"


class DocOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    department_id: int
    title: str
    doc_type: str
    file_ref: Optional[str] = None
    access_code: str
    created_at: datetime


# ------------------------------------------------------------------- Chat


class ChatCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=2000)
    department_id: int
    tag: str = "general"
    thread_id: Optional[str] = None


class ChatOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    department_id: int
    body: str
    tag: str
    thread_id: Optional[str] = None
    created_at: datetime


class ChatOutWithUser(ChatOut):
    user_name: str = ""


FinanceSummary.model_rebuild()