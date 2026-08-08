import json
import re
from datetime import date, datetime, timedelta
from typing import Any

from google import genai
from google.genai import types
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import config
from ..models import Department, Project, Task, User

_client_instance: genai.Client | None = None

SYSTEM_INSTRUCTION = (
    "You are VisionTrack, the AI scheduling engine of a Web Development & Social "
    "Media Management agency. Given the department, current task, open backlog, "
    "and team roster, infer the single most logical NEXT task. Reply with JSON "
    'only, using this shape: {"title","description","dept_code","priority",'
    '"due_in_days","assignee_hint"}. Keep title under 60 chars. Follow these '
    "workflow rules: sales -> follow-ups and proposal drafting before close; "
    "operations -> dev hand-offs with review gates before Done; marketing -> "
    "content creation, review, then publish, then metrics report; finance -> "
    "invoice after a closed deal; legal -> contract review into the vault."
)

DEPT_HINTS: dict[str, list[str]] = {
    "operations": [
        "Wireframe",
        "UI build",
        "Backend integration",
        "QA & review",
        "Launch deployment",
    ],
    "marketing": [
        "Draft content calendar",
        "Create post assets",
        "Review captions",
        "Schedule & publish",
        "Collect engagement report",
    ],
    "sales": [
        "Send proposal follow-up",
        "Refresh pipeline notes",
        "Book discovery call",
        "Draft close summary",
    ],
    "finance": ["Generate invoice", "Reconcile payment", "Update revenue report"],
    "legal": ["Draft contract addendum", "Review signed NDA", "Archive into vault"],
}


def _client() -> genai.Client:
    global _client_instance
    if _client_instance is None:
        _client_instance = genai.Client(api_key=config.settings.GEMINI_API_KEY)
    return _client_instance


def _extract_json(text: str) -> Any:
    if not text:
        return None
    match = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    candidate = match.group(1) if match else text
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        brace = re.search(r"\{.*\}", candidate, re.DOTALL)
        if brace:
            try:
                return json.loads(brace.group(0))
            except json.JSONDecodeError:
                return None
    return None


async def _ask_gemini(prompt: str) -> Any:
    if not config.settings.GEMINI_API_KEY:
        return None
    try:
        response = await _client().aio.models.generate_content(
            model=config.settings.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                temperature=0.5,
            ),
        )
        return _extract_json(response.text)
    except Exception:
        return None


def _dept_code(task: Task) -> str:
    return task.department.code if task.department else "operations"


def _fallback_description(prev_title: str, dept_code: str) -> str:
    hints = DEPT_HINTS.get(dept_code, DEPT_HINTS["operations"])
    return (
        f"Automated follow-on from completed task \u201c{prev_title}\u201d "
        f"({hints[0]} track). Review dependencies and assign as the next "
        "sequential step."
    )


def _rule_based_next(task: Task) -> dict:
    dept_code = _dept_code(task)
    hints = DEPT_HINTS.get(dept_code, DEPT_HINTS["operations"])
    hint = hints[len(task.title) % len(hints)]
    return {
        "title": f"{hint}: {task.title}",
        "description": _fallback_description(task.title, dept_code),
        "dept_code": dept_code,
        "priority": "medium",
        "due_in_days": 3,
        "assignee_hint": task.assignee.email if task.assignee else None,
    }


def _clean_suggestion(raw: Any, task: Task) -> dict:
    if not isinstance(raw, dict):
        return _rule_based_next(task)
    dept_code = str(raw.get("dept_code") or _dept_code(task))
    if dept_code not in DEPT_HINTS:
        dept_code = _dept_code(task)
    fallback = _rule_based_next(task)
    return {
        "title": str(raw.get("title") or fallback["title"]).strip()[:120],
        "description": str(raw.get("description") or fallback["description"]).strip(),
        "dept_code": dept_code,
        "priority": str(raw.get("priority") or "medium").lower(),
        "due_in_days": int(raw.get("due_in_days") or 3),
        "assignee_hint": str(raw.get("assignee_hint") or "").strip() or None,
    }


def _build_context(task: Task) -> str:
    open_siblings = "\n".join(f"- {t.title}" for t in _list_open_tasks(task)) or "- none"
    return (
        f"Department: {task.department.name if task.department else 'unknown'}\n"
        f"Current task completed: {task.title}\n"
        f"Project: {task.project.name if task.project else 'none'}\n"
        f"Assignee: {task.assignee.name if task.assignee else 'unassigned'}\n"
        f"Open sibling tasks:\n{open_siblings}"
    )


def _list_open_tasks(task: Task) -> list[Task]:
    if not task.project:
        return []
    return [t for t in task.project.tasks if t.id != task.id and t.status != "done"][:8]


async def suggest_next(db: Session, task: Task) -> dict:
    prompt = f"Context:\n{_build_context(task)}"
    return _clean_suggestion(await _ask_gemini(prompt), task)


async def suggest_options(db: Session, project: Project, count: int = 3) -> list[dict]:
    titles = [t.title for t in project.tasks if t.status != "done"]
    prompt = (
        f"Department: {project.department.name if project.department else 'operations'}\n"
        f"Project: {project.name} (client: {project.client or 'n/a'})\n"
        "Not-yet-complete backlog:\n"
        + ("\n".join(f"- {t}" for t in titles[:8]) or "- none")
        + f"\nPropose {count} distinct next-task options as a JSON array. "
        'Each: {"title":"...","description":"...","dept_code":"...",'
        '"priority":"low|medium|high","due_in_days":N,"assignee_hint":"..."}'
    )
    raw = await _ask_gemini(prompt)

    fallback_hints = DEPT_HINTS.get(
        project.department.code if project.department else "operations",
        DEPT_HINTS["operations"],
    )
    selected = raw if isinstance(raw, list) and all(isinstance(i, dict) for i in raw) else []
    if not selected:
        selected = [
            {
                "title": f"{fallback_hints[i % len(fallback_hints)]} for {project.name}",
                "description": "Suggested next step for this project.",
                "dept_code": project.department.code if project.department else "operations",
                "priority": "medium",
                "due_in_days": 3,
                "assignee_hint": None,
            }
            for i in range(count)
        ]
    return selected[:count]


def commit_next(db: Session, suggestion: dict, creator: User | None, source: str) -> Task:
    dept_code = suggestion.get("dept_code") or (creator.dept_code if creator else "operations")
    department = db.execute(
        select(Department).where(Department.code == dept_code)
    ).scalar_one_or_none()
    dept_id = department.id if department else creator.department_id
    assignee = _pick_assignee(db, dept_code, suggestion.get("assignee_hint"))
    due = _parse_due(suggestion.get("due_date"), suggestion.get("due_in_days", 3))
    task = Task(
        title=suggestion["title"],
        description=suggestion["description"],
        status="queued",
        priority=suggestion["priority"],
        department_id=dept_id,
        due_date=due,
        assignee_id=assignee.id if assignee else None,
        creator_id=creator.id if creator else None,
        ai_generated=True,
        source=source,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def _parse_due(raw: Any, fallback_days: int = 3) -> date:
    if isinstance(raw, str):
        try:
            return datetime.fromisoformat(raw).date()
        except ValueError:
            pass
    if isinstance(raw, (int, float)):
        fallback_days = int(raw)
    return date.today() + timedelta(days=fallback_days)


def _pick_assignee(db: Session, dept_code: str, hint: str | None) -> User | None:
    dept = db.execute(select(Department).where(Department.code == dept_code)).scalar_one_or_none()
    if hint:
        user = db.execute(select(User).where(User.email == hint.strip())).scalar_one_or_none()
        if user:
            return user
    if dept:
        leader = (
            db.execute(
                select(User)
                .where(User.department_id == dept.id, User.role == "lead")
                .order_by(User.id)
            )
            .scalars()
            .first()
        )
        if leader:
            return leader
        return (
            db.execute(select(User).where(User.department_id == dept.id)).scalars().first()
        )
    return None


LEAD_WORKFLOW = {
    "operations": {
        "title": "Web build for {company}",
        "tasks": [
            "Design mockup & receive approval",
            "Develop site (core pages)",
            "QA, edits & launch",
        ],
    },
    "marketing": {
        "title": "Social onboarding for {company}",
        "tasks": [
            "Create IG business profile & optimize bio",
            "Draft 1-week content calendar",
        ],
    },
}