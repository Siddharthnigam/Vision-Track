"""Seed the VisionTrack demo database.

Run directly:  python -m scripts.seed
Or rely on the app lifespan auto-seed (runs automatically on empty DB).
Idempotent: never duplicates departments/users/business data on re-run.
"""

from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine
from app.models import (
    ChatMessage,
    Department,
    DocItem,
    Lead,
    Metric,
    Project,
    SocialPost,
    Task,
    User,
)
from app.services.security import hash_password

DEPARTMENTS = [
    {"code": "sales", "name": "Sales", "color": "#ef4444"},
    {"code": "marketing", "name": "Marketing", "color": "#d946ef"},
    {"code": "operations", "name": "Operations", "color": "#38bdf8"},
    {"code": "finance", "name": "Finance", "color": "#f59e0b"},
    {"code": "legal", "name": "Legal", "color": "#8b5cf6"},
]

USERS = [
    # role, name, email, dept, password
    ("cofounder", "Ava Chen", "ava@vision.agency", None, "cofound123"),
    ("lead", "Marcus Webb", "marcus@vision.agency", "sales", "lead123"),
    ("teammate", "Theo Reed", "theo@vision.agency", "sales", "team123"),
    ("lead", "Priya Patel", "priya@vision.agency", "operations", "lead123"),
    ("teammate", "Dev Kumar", "dev@vision.agency", "operations", "team123"),
    ("lead", "Zoe Lin", "zoe@vision.agency", "marketing", "lead123"),
    ("teammate", "Mia Foster", "mia@vision.agency", "marketing", "team123"),
    ("lead", "Sam Costa", "sam@vision.agency", "finance", "lead123"),
    ("lead", "Dana Ives", "dana@vision.agency", "legal", "lead123"),
]

LEADS = [
    ("Northwind Co", "Rick Alonzo", "rick@northwind.io", 4200, "contacted", "Met at expo; wants brand site"),
    ("LumenSphere", "Sana Qadir", "sana@lumensphere.com", 8500, "closing", "Proposal sent; follow-up Thu"),
    ("Harbor & Thread", "Elle Marsh", "elle@harborthread.com", 12500, "new", "Warm referral from Dana Ives"),
    ("Ferro Dynamics", "Kai Tanaka", "kai@ferrodyn.com", 6000, "contacted", "Needs portfolio refresh"),
    ("Bayside Bakes", "Nora Lima", "nora@baysidebakes.com", 2400, "closed", "Retainer signed for 6 mo"),
    ("Peak Athletics", "Jules Van", "jules@peakathletics.com", 9800, "closing", "Scope call booked"),
    ("Studio Nine Films", "Ari Bell", "ari@st9films.com", 5200, "new", "Wants social cutovers"),
    ("Morrow Interiors", "Grace Okon", "grace@morrowinteriors.com", 7300, "contacted", "Sent intro deck"),
    ("Pulse Fitness Co.", "Ian Cross", "ian@pulsefit.co", 4100, "closed", "Site + Instagram audit retainer"),
    ("Kindred Roasters", "Lena Dove", "lena@kindredroast.com", 3150, "contacted", "Follow-up booked"),
    ("Apex Legal Partners", "Milo Hart", "milo@apexlegal.com", 15000, "closing", "Brand + web overhaul"),
    ("Wander Routes", "Idan Ra", "idan@wanderroutes.com", 6800, "new", "Cold inbound via Instagram"),
]

PROJECTS = [
    # (name, client, dept, status, desc, start, due)
    ("LumenStudio site rebuild", "Lumen Studio", "operations", "active",
     "Full marketing website rebuild for Lumen Studio.", date.today() - timedelta(days=14), date.today() + timedelta(days=21)),
    ("Pulse Fitness audit", "Pulse Fitness Co.", "operations", "completed",
     "Website + Instagram performance audit and fixes.", date.today() - timedelta(days=40), date.today() - timedelta(days=5)),
    ("Harbor & Thread launch", "Harbor & Thread", "operations", "active",
     "Boutique storefront with blog and IG Shop integration.", date.today() - timedelta(days=3), date.today() + timedelta(days=35)),
    ("Kindred Roasters campaign", "Kindred Roasters", "marketing", "active",
     "Weekly IG content calendar + email newsletter series.", date.today() - timedelta(days=7), date.today() + timedelta(days=28)),
]

TASKS = [
    # (project, title, status, priority, dept, assignee_email, due_offset_days)
    ("Pulse Fitness audit", "Top-level QA review", "done", "high", "operations", "priya@vision.agency", -1),
    ("Pulse Fitness audit", "Deploy performance patch", "done", "high", "operations", "dev@vision.agency", -2),
    ("Pulse Fitness audit", "Notify client of improvements", "done", "medium", "operations", "theo@vision.agency", -3),
    ("LumenStudio site rebuild", "Design homepage mockup", "done", "high", "operations", "dev@vision.agency", -1),
    ("LumenStudio site rebuild", "Develop core page templates", "in_progress", "high", "operations", "dev@vision.agency", 6),
    ("LumenStudio site rebuild", "CMS + hosting setup", "queued", "medium", "operations", "theo@vision.agency", 10),
    ("LumenStudio site rebuild", "QA + content pass", "queued", "medium", "operations", "theo@vision.agency", 16),
    ("LumenStudio site rebuild", "Launch + client handover", "queued", "high", "operations", "priya@vision.agency", 21),
    ("Harbor & Thread launch", "Collect brand assets", "in_progress", "high", "operations", "theo@vision.agency", 2),
    ("Harbor & Thread launch", "Storefront build", "queued", "high", "operations", "dev@vision.agency", 12),
    ("Harbor & Thread launch", "Instagram Shop setup", "queued", "medium", "marketing", "mia@vision.agency", 18),
    ("Kindred Roasters campaign", "Design IG creative batch 1", "review", "high", "marketing", "mia@vision.agency", 1),
    ("Kindred Roasters campaign", "Schedule weekly posts", "in_progress", "medium", "marketing", "zoe@vision.agency", 4),
    ("Kindred Roasters campaign", "Compile engagement report", "queued", "low", "marketing", "mia@vision.agency", 22),
    (None, "Draft proposal - Apex Legal Partners", "in_progress", "high", "sales", "marcus@vision.agency", 2),
    (None, "Follow up new inbound leads", "queued", "medium", "sales", "theo@vision.agency", 3),
]

METRIC_SERIES = [
    ("instagram", "followers", 18200, 40, "count", 14),
    ("instagram", "total_reach", 5200, 90, "count", 14),
    ("instagram", "engagement_rate", 3.4, 0.08, "pct", 14),
    ("instagram", "profile_views", 900, 25, "count", 14),
    ("email", "open_rate", 41.0, 0.4, "pct", 14),
    ("email", "click_rate", 6.8, 0.15, "pct", 14),
    ("email", "delivered", 4800, 55, "count", 14),
    ("email", "bounce_rate", 1.4, -0.03, "pct", 14),
]

POSTS = [
    ("instagram", "Client reveal: Harbor & Thread storefront — live in 2 weeks!", 1, "scheduled"),
    ("instagram", "Behind the studio: our QA checklist before every launch.", 2, "scheduled"),
    ("instagram", "New blog: 5 Instagram metrics that matter.", -1, "published"),
    ("instagram", "Case study carousel — Pulse Fitness +38% reach.", -3, "published"),
    ("email", "Monthly digest: what we shipped this cycle.", 4, "draft"),
    ("email", "Client onboarding checklist v2.", 6, "draft"),
]

DOCS = [
    ("finance", "June revenue report", "policy", "reports/june-2026.pdf", "dept"),
    ("finance", "Invoice INV-2041 - Harbor & Thread", "invoice", "finance/inv-2041.pdf", "dept"),
    ("legal", "Master client NDA", "nda", "legal/nda-master.pdf", "dept"),
    ("legal", "Agency service contract v3", "contract", "legal/contract-v3.pdf", "cofounder-only"),
    ("legal", "Vendor privacy policy", "policy", "legal/vendor-privacy.pdf", "dept"),
]

CHAT_STARTER = [
    ("operations", "priya@vision.agency", "dependency", "Sales signed Harbor & Thread - assets landing at EOD."),
    ("marketing", "zoe@vision.agency", "campaign", "Kindred creative batch v1 is staged; reviewers wanted @operations."),
    ("sales", "marcus@vision.agency", "help", "Anybody holding the Apex branding kit?"),
    ("operations", "dev@vision.agency", "general", "Beacon CMS env is up - hook links are in the channel."),
]


def seed_departments(db: Session) -> dict[str, Department]:
    existing = {d.code: d for d in db.execute(select(Department)).scalars()}
    for spec in DEPARTMENTS:
        if spec["code"] not in existing:
            db.add(Department(**spec))
    db.commit()
    return {d.code: d for d in db.execute(select(Department)).scalars()}


def seed_users(db: Session, depts: dict[str, Department]) -> dict[str, User]:
    existing = {u.email: u for u in db.execute(select(User)).scalars()}
    for role, name, email, dept_code, password in USERS:
        if email not in existing:
            db.add(
                User(
                    name=name,
                    email=email,
                    password_hash=hash_password(password),
                    role=role,
                    department_id=depts[dept_code].id if dept_code else None,
                )
            )
    db.commit()
    return {u.email: u for u in db.execute(select(User)).scalars()}


def seed_business(db: Session, depts: dict[str, Department], users: dict[str, User]) -> None:
    has_leads = db.execute(select(func.count(Lead.id))).scalar_one() > 0
    has_tasks = db.execute(select(func.count(Task.id))).scalar_one() > 0
    if has_leads or has_tasks:
        return

    marcus = users["marcus@vision.agency"]
    for (company, contact, email, value, status, note) in LEADS:
        db.add(
            Lead(
                company=company,
                contact=contact,
                email=email,
                value=value,
                status=status,
                stage_note=note,
                owner_id=marcus.id,
                signed_at=datetime.utcnow() - timedelta(days=20) if status == "closed" else None,
            )
        )

    project_by_name: dict[str, Project] = {}
    for (name, client, dept_code, status, desc, start, due) in PROJECTS:
        project = Project(
            name=name,
            client=client,
            department_id=depts[dept_code].id,
            status=status,
            description=desc,
            start_date=start,
            due_date=due,
        )
        db.add(project)
        project_by_name[name] = project
    db.flush()

    for (proj, title, status, priority, dept_code, assignee, offset) in TASKS:
        db.add(
            Task(
                title=title,
                status=status,
                priority=priority,
                department_id=depts[dept_code].id,
                project_id=project_by_name[proj].id if proj else None,
                assignee_id=users[assignee].id if assignee in users else None,
                creator_id=users["ava@vision.agency"].id,
                due_date=date.today() + timedelta(days=offset) if proj else None,
                completed_at=datetime.utcnow() - timedelta(days=abs(offset)) if status == "done" else None,
                source="seed",
            )
        )

    today = date.today()
    for (platform, label, start, delta, unit, days) in METRIC_SERIES:
        for i in range(days):
            rec = today - timedelta(days=days - 1 - i)
            db.add(
                Metric(
                    platform=platform,
                    label=label,
                    value=round(start + delta * i, 2),
                    unit=unit,
                    recorded_on=rec,
                )
            )

    now = datetime.utcnow()
    for (platform, content, due_day, status) in POSTS:
        db.add(
            SocialPost(
                platform=platform,
                content=content,
                scheduled_at=now + timedelta(days=due_day),
                status=status,
            )
        )

    for (dept_code, title, doc_type, ref, access) in DOCS:
        db.add(
            DocItem(
                department_id=depts[dept_code].id,
                title=title,
                doc_type=doc_type,
                file_ref=ref,
                access_code=access,
            )
        )

    for (dept_code, assignee_email, tag, body) in CHAT_STARTER:
        db.add(
            ChatMessage(
                user_id=users[assignee_email].id,
                department_id=depts[dept_code].id,
                tag=tag,
                body=body,
            )
        )

    db.commit()


def run() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        depts = seed_departments(db)
        users = seed_users(db, depts)
        seed_business(db, depts, users)
        print("VisionTrack demo database seeded.")
        print("Login: ava@vision.agency / cofound123")
    finally:
        db.close()


if __name__ == "__main__":
    run()