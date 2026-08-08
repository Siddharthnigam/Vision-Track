"""End-to-end smoke test for VisionTrack API (run with backend venv)."""

import asyncio
import sys

import httpx

BASE = "http://localhost:8000"


def banner(label: str, ok: bool, extra: str = ""):
    print(f"{'[PASS]' if ok else '[FAIL]':7} {label} {extra}")


async def main() -> int:
    async with httpx.AsyncClient(base_url=BASE, timeout=30) as c:
        ok = True

        r = await c.get("/health")
        banner("health", r.status_code == 200 and r.json().get("status") == "ok")

        r = await c.post(
            "/api/auth/login",
            json={"email": "ava@vision.agency", "password": "cofound123"},
        )
        login_ok = r.status_code == 200
        banner("cofounder login", login_ok, str(r.json().get("user", {}).get("role")))
        if not login_ok:
            return 1
        token = r.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        r = await c.get("/api/auth/me", headers=headers)
        banner("auth/me", r.status_code == 200)

        r = await c.get("/api/departments")
        banner("departments", r.status_code == 200 and len(r.json()) == 5)

        r = await c.get("/api/users", headers=headers)
        users = r.json()
        banner("users list (cofounder)", r.status_code == 200 and len(users) >= 9)

        r = await c.get("/api/tasks", headers=headers)
        tasks = r.json()
        banner("tasks list (cofounder)", r.status_code == 200 and len(tasks) >= 15)

        r = await c.get("/api/leads", headers=headers)
        leads = r.json()
        banner("leads list (sales scope via cofounder)", r.status_code == 200 and len(leads) == 12)

        lead_id = leads[0]["id"]
        r_tasks_before = await c.get("/api/tasks", headers=headers)
        n_before = len(r_tasks_before.json())
        r = await c.post(f"/api/leads/{lead_id}/sign", headers=headers, json={})
        sign = r.json()
        banner(
            "lead sign auto-workflow",
            r.status_code == 200 and len(sign.get("created_tasks", [])) >= 4,
            f"{len(sign.get('created_tasks', []))} tasks created",
        )
        r_tasks_after = await c.get("/api/tasks", headers=headers)
        n_after = len(r_tasks_after.json())
        banner("cross-dept tasks persisted", n_after >= n_before + 4, f"{n_before}->{n_after}")

        task_to_complete = next(
            (t for t in r_tasks_after.json() if t["status"] != "done" and t["dept_code"] == "operations"),
            None,
        )
        if task_to_complete:
            r = await c.post(
                f"/api/tasks/{task_to_complete['id']}/complete",
                headers=headers,
                params={"auto_commit": "true"},
            )
            cc = r.json()
            banner(
                "task complete AI chaining",
                r.status_code == 200 and cc.get("auto_created") is True,
                cc.get("note", ""),
            )
        else:
            banner("task complete AI chaining", False, "no open ops task found")

        dept_ids = {d["code"]: d["id"] for d in (await c.get("/api/departments")).json()}
        r = await c.get("/api/chat", headers=headers, params={"department_id": dept_ids["operations"]})
        banner("chat history", r.status_code == 200 and len(r.json()) > 0)

        r = await c.post(
            "/api/chat",
            headers=headers,
            json={
                "body": "Smoke test message",
                "department_id": dept_ids["operations"],
                "tag": "general",
            },
        )
        banner("chat post", r.status_code == 200 and r.json()["body"] == "Smoke test message")

        r = await c.get("/api/finance/summary", headers=headers)
        fin = r.json()
        banner(
            "finance summary",
            r.status_code == 200 and fin["signed_leads"] >= 2,
            f"revenue={fin['total_revenue']}",
        )

        r = await c.get("/api/vault/docs", headers=headers)
        banner("vault docs (cofounder sees all)", r.status_code == 200 and len(r.json()) == 5)

        # --- RBAC checks: Zoe (marketing lead) blocked from sales + operations
        r = await c.post(
            "/api/auth/login",
            json={"email": "zoe@vision.agency", "password": "lead123"},
        )
        zoe_token = r.json()["access_token"]
        zh = {"Authorization": f"Bearer {zoe_token}"}

        r = await c.get("/api/leads", headers=zh)
        banner("RBAC: marketing lead blocked from leads", r.status_code == 403)

        r = await c.get("/api/tasks", headers=zh)
        tasks_zoe = r.json()
        banner("RBAC: lead sees only own dept tasks", all(t["dept_code"] == "marketing" for t in tasks_zoe))

        r = await c.get("/api/users", headers=zh)
        banner("RBAC: marketing lead blocked from user admin", r.status_code == 403)

        r = await c.get("/api/marketing/summary", headers=zh)
        banner("marketing summary", r.status_code == 200)

        # --- teammate: only own tasks, 403 on others
        r = await c.post(
            "/api/auth/login",
            json={"email": "dev@vision.agency", "password": "team123"},
        )
        dev_token = r.json()["access_token"]
        dh = {"Authorization": f"Bearer {dev_token}"}
        r = await c.get("/api/tasks", headers=dh)
        dev_tasks = r.json()
        banner("teammate sees assigned tasks", r.status_code == 200 and len(dev_tasks) >= 1)

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
