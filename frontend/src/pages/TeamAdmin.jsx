import { useCallback, useEffect, useMemo, useState } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, ListChecks, Loader2, Plus, Search, Trash2, UserPlus, Users } from "lucide-react";
import { api } from "../services/api.js";
import { DEPT_LABEL, PRIORITY_CLS, ROLE_LABEL, STATUS_META } from "../consts/roles.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import KpiCard from "../components/ui/KpiCard.jsx";
import Modal from "../components/ui/Modal.jsx";
import { Toast, useToast } from "../components/ui/Toast.jsx";

const STATUS_KEYS = ["queued", "in_progress", "review", "done"];
const PRIORITY_KEYS = ["low", "medium", "high"];

export default function TeamAdmin() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [depts, setDepts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const [fDept, setFDept] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [query, setQuery] = useState("");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ name: "", email: "", password: "", role: "teammate", department_id: "" });
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", description: "", department_id: "", assignee_id: "", priority: "medium", status: "queued", due_date: "" });
  const [resetTarget, setResetTarget] = useState(null); // user to reset password for
  const [resetPw, setResetPw] = useState("");

  const load = useCallback(async () => {
    try {
      const [u, d, t] = await Promise.all([api.users(), api.departments(), api.tasks()]);
      setUsers(u);
      setDepts(d);
      setTasks(t);
    } catch (err) {
      toast.error(err.message);
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () =>
      tasks.filter((t) => {
        if (fDept !== "all" && t.dept_code !== fDept) return false;
        if (fStatus !== "all" && t.status !== fStatus) return false;
        if (query) {
          const q = query.toLowerCase();
          const hay = `${t.title} ${t.assignee_name || ""} ${t.project_name || ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    [tasks, fDept, fStatus, query]
  );

  const openTasks = tasks.filter((t) => t.status !== "done").length;
  const inFlight = tasks.filter((t) => t.status === "in_progress" || t.status === "review").length;

  const createUser = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createUser({
        name: invite.name,
        email: invite.email,
        password: invite.password,
        role: invite.role,
        department_id: invite.department_id ? Number(invite.department_id) : null,
      });
      setInviteOpen(false);
      setInvite({ name: "", email: "", password: "", role: "teammate", department_id: "" });
      toast.success("Teammate added to the roster.");
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const patchUser = async (u, patch) => {
    try {
      await api.updateUser(u.id, patch);
      toast.success(`${u.name} updated.`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const resetPassword = async () => {
    if (!resetTarget || !resetPw.trim()) return;
    setBusy(true);
    try {
      await api.updateUser(resetTarget.id, { password: resetPw.trim() });
      toast.success(`Password reset for ${resetTarget.name}.`);
      setResetTarget(null);
      setResetPw("");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const createTask = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createTask({
        title: taskForm.title,
        description: taskForm.description || null,
        department_id: Number(taskForm.department_id),
        assignee_id: taskForm.assignee_id ? Number(taskForm.assignee_id) : null,
        priority: taskForm.priority,
        status: taskForm.status,
        due_date: taskForm.due_date || null,
      });
      setTaskOpen(false);
      setTaskForm({ title: "", description: "", department_id: "", assignee_id: "", priority: "medium", status: "queued", due_date: "" });
      toast.success("Task created and assigned.");
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const patchTask = async (t, patch) => {
    try {
      await api.updateTask(t.id, patch);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const completeTask = async (t) => {
    try {
      await api.completeTask(t.id, true);
      toast.success(`"${t.title}" completed.`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const deleteTask = async (t) => {
    try {
      await api.deleteTask(t.id);
      toast.success("Task deleted.");
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const roster = useMemo(() => {
    const inDept = (id) => depts.find((d) => d.id === id)?.name || "Executive";
    const taskCount = (uid) => tasks.filter((t) => t.assignee_id === uid && t.status !== "done").length;
    return users.map((u) => ({ ...u, deptLabel: u.dept_code ? DEPT_LABEL[u.dept_code] || inDept(u.department_id) : "Executive", openTasks: taskCount(u.id) }));
  }, [users, depts, tasks]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="vos-badge">
            <Users className="h-3 w-3" />
            TEAM ADMIN · CO-FOUNDER GOVERNANCE
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">Team Admin</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Add teammates and assign or update any task in any department.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTaskOpen(true)} className="vos-btn-primary">
            <Plus className="h-4 w-4" /> Assign Task
          </button>
          <button onClick={() => setInviteOpen(true)} className="vos-btn-ghost">
            <UserPlus className="h-4 w-4" /> Add Teammate
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Users} label="Team members" value={users.length} sub="active roster" tone="red" />
        <KpiCard icon={ListChecks} label="Open tasks" value={openTasks} sub="across all departments" />
        <KpiCard icon={ListChecks} label="In flight" value={inFlight} sub="in_progress + review" />
        <KpiCard icon={ListChecks} label="Done" value={tasks.filter((t) => t.status === "done").length} sub="completed" />
      </section>

      <section className="vos-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Users className="h-4 w-4 text-neon" /> Team Roster
          </h3>
          <button onClick={() => setInviteOpen(true)} className="vos-btn-ghost !px-3 !py-1 text-[11px]">
            <UserPlus className="h-3.5 w-3.5" /> Invite
          </button>
        </div>
        <div className="terminal-scroll max-h-[400px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-edge text-[11px] uppercase tracking-widest text-zinc-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Open tasks</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((u) => (
                <tr key={u.id} className="border-b border-edge/60 last:border-0 hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-200">{u.name}</p>
                    <p className="text-[11px] text-zinc-500">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="vos-input !w-auto !px-2 !py-1 text-xs"
                      value={u.department_id || ""}
                      onChange={(e) => patchUser(u, { department_id: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">Executive</option>
                      {depts.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="vos-input !w-auto !px-2 !py-1 text-xs"
                      value={u.role}
                      onChange={(e) => patchUser(u, { role: e.target.value })}
                    >
                      <option value="cofounder">Co-Founder</option>
                      <option value="lead">Lead</option>
                      <option value="teammate">Teammate</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">{u.openTasks}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => patchUser(u, { active: !u.active })}
                        className={
                          "rounded border px-2 py-0.5 text-[11px] font-semibold transition-colors " +
                          (u.active
                            ? "border-emerald-500/40 text-emerald-400 hover:border-emerald-400"
                            : "border-zinc-700 text-zinc-500 hover:border-neon/40 hover:text-neon")
                        }
                      >
                        {u.active ? "Active" : "Disabled"}
                      </button>
                      <button
                        onClick={() => { setResetTarget(u); setResetPw(""); }}
                        className="rounded border border-edge px-2 py-0.5 text-[11px] text-zinc-500 hover:border-neon/40 hover:text-neon transition-colors"
                        title="Reset password"
                      >
                        <KeyRound className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="vos-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ListChecks className="h-4 w-4 text-neon" /> Task Assignments
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <select className="vos-input !w-auto !px-2 !py-1 text-xs" value={fDept} onChange={(e) => setFDept(e.target.value)}>
              <option value="all">All departments</option>
              {depts.map((d) => (
                <option key={d.id} value={d.code}>{d.name}</option>
              ))}
            </select>
            <select className="vos-input !w-auto !px-2 !py-1 text-xs" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="all">All statuses</option>
              {STATUS_KEYS.map((s) => (
                <option key={s} value={s}>{STATUS_META[s].label}</option>
              ))}
            </select>
            <div className="relative">
              <Search className="absolute left-2 top-1.5 h-3 w-3 text-zinc-600" />
              <input
                className="vos-input !w-auto !py-1 pl-7 text-xs"
                placeholder="Search task…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="terminal-scroll max-h-[480px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-edge text-[11px] uppercase tracking-widest text-zinc-500">
                <th className="px-4 py-3">Task</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Assignee</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-edge/60 last:border-0 hover:bg-white/[0.03]">
                  <td className="max-w-[280px] px-4 py-3">
                    <p className="truncate font-medium text-zinc-200">{t.title}</p>
                    <p className="truncate text-[11px] text-zinc-600">{t.project_name || "standalone"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded border border-edge px-1.5 py-0.5 text-[11px] text-zinc-400">
                      {t.dept_code ? DEPT_LABEL[t.dept_code] : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="vos-input !w-auto !px-2 !py-1 text-xs"
                      value={t.assignee_id || ""}
                      onChange={(e) => patchTask(t, { assignee_id: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">Unassigned</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="vos-input !w-auto !px-2 !py-1 text-xs"
                      value={t.status}
                      onChange={(e) => patchTask(t, { status: e.target.value })}
                    >
                      {STATUS_KEYS.map((s) => (
                        <option key={s} value={s}>{STATUS_META[s].label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className={`vos-input !w-auto !px-2 !py-1 text-xs ${PRIORITY_CLS[t.priority] || "text-zinc-400"}`}
                      value={t.priority}
                      onChange={(e) => patchTask(t, { priority: e.target.value })}
                    >
                      {PRIORITY_KEYS.map((p) => (
                        <option key={p} value={p} className="capitalize">{p}</option>
                      ))}
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">
                    {t.due_date ? t.due_date.slice(0, 10) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {t.status !== "done" && (
                        <button
                          onClick={() => completeTask(t)}
                          className="rounded border border-emerald-500/40 px-2 py-1 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/10"
                        >
                          Complete
                        </button>
                      )}
                      {t.status === "done" && (
                        <span className="text-[11px] text-emerald-500">{STATUS_META.done.label}</span>
                      )}
                      <button
                        onClick={() => deleteTask(t)}
                        className="rounded border border-edge px-2 py-1 text-[11px] text-zinc-500 hover:border-neon/40 hover:text-neon"
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-xs text-zinc-600">No tasks match the filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-edge px-5 py-2.5 text-[11px] text-zinc-600">
          Showing {filtered.length} of {tasks.length} tasks · inline drops update instantly ({user?.name}).
        </div>
      </section>

      <Modal open={inviteOpen} title="Add Teammate" onClose={() => setInviteOpen(false)}>
        <form onSubmit={createUser} className="space-y-4">
          <div>
            <label className="vos-label">Full name *</label>
            <input className="vos-input" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} required />
          </div>
          <div>
            <label className="vos-label">Email *</label>
            <input type="email" className="vos-input" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} required />
          </div>
          <div>
            <label className="vos-label">Password *</label>
            <input type="password" minLength={4} className="vos-input" value={invite.password} onChange={(e) => setInvite({ ...invite, password: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="vos-label">Role</label>
              <select className="vos-input" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
                <option value="teammate">Teammate</option>
                <option value="lead">Lead</option>
                <option value="cofounder">Co-Founder</option>
              </select>
            </div>
            <div>
              <label className="vos-label">Branch</label>
              <select className="vos-input" value={invite.department_id} onChange={(e) => setInvite({ ...invite, department_id: e.target.value })}>
                <option value="">Executive</option>
                {depts.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" disabled={busy} className="vos-btn-primary w-full">{busy ? "Adding…" : "Add teammate"}</button>
        </form>
      </Modal>

      <Modal open={taskOpen} title="Assign Task" onClose={() => setTaskOpen(false)}>
        <form onSubmit={createTask} className="space-y-4">
          <div>
            <label className="vos-label">Title *</label>
            <input className="vos-input" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} required />
          </div>
          <div>
            <label className="vos-label">Description</label>
            <textarea className="vos-input resize-none" rows={3} value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="vos-label">Department *</label>
              <select className="vos-input" value={taskForm.department_id} onChange={(e) => { setTaskForm({ ...taskForm, department_id: e.target.value, assignee_id: "" }); }} required>
                <option value="">Select…</option>
                {depts.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="vos-label">Assignee</label>
              <select className="vos-input" value={taskForm.assignee_id} onChange={(e) => setTaskForm({ ...taskForm, assignee_id: e.target.value })}>
                <option value="">Unassigned</option>
                {users
                  .filter((u) => !taskForm.department_id || u.department_id === Number(taskForm.department_id) || u.role === "cofounder")
                  .map((u) => (
                    <option key={u.id} value={u.id}>{u.name} · {ROLE_LABEL[u.role]}</option>
                  ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="vos-label">Priority</label>
              <select className="vos-input" value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}>
                {PRIORITY_KEYS.map((p) => (
                  <option key={p} value={p} className="capitalize">{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="vos-label">Due date</label>
              <input type="date" className="vos-input" value={taskForm.due_date} onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="vos-label">Status</label>
            <select className="vos-input" value={taskForm.status} onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}>
              {STATUS_KEYS.map((s) => (
                <option key={s} value={s}>{STATUS_META[s].label}</option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={busy} className="vos-btn-primary w-full">{busy ? "Creating…" : "Create & assign"}</button>
        </form>
      </Modal>

      {/* Reset password modal */}
      <Modal open={!!resetTarget} title="Reset Password" onClose={() => setResetTarget(null)}>
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            Set a new password for{" "}
            <span className="font-semibold text-white">{resetTarget?.name}</span>{" "}
            <span className="text-zinc-600">({resetTarget?.email})</span>
          </p>
          <div>
            <label className="vos-label">New password</label>
            <input
              type="password"
              className="vos-input"
              placeholder="Minimum 8 characters"
              minLength={8}
              value={resetPw}
              onChange={(e) => setResetPw(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setResetTarget(null)} className="vos-btn-ghost">Cancel</button>
            <button
              onClick={resetPassword}
              disabled={busy || resetPw.length < 8}
              className="vos-btn-primary"
            >
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : "Reset password"}
            </button>
          </div>
        </div>
      </Modal>

      <Toast toasts={toast.toasts} dismiss={toast.dismiss} />
    </div>
  );
}