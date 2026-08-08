import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FolderPlus, Play, Plus, Sparkles, Wrench } from "lucide-react";
import { api } from "../services/api.js";
import { AIChip, DEPT_LABEL, STATUS_META } from "../consts/roles.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { TaskStatusBadge } from "../components/ui/StatusBadge.jsx";
import AiSuggestion from "../components/ui/AiSuggestion.jsx";
import Modal from "../components/ui/Modal.jsx";

const COLUMNS = {
  queued: "Queued",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
};
const STATUS_KEYS = ["queued", "in_progress", "review", "done"];
const PRIORITY_KEYS = ["low", "medium", "high"];

const PROJECT_STATUSES = {
  active: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  at_risk: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  completed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  on_hold: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
};

export default function Operations() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [team, setTeam] = useState([]);
  const [depts, setDepts] = useState([]);
  const [activeProject, setActiveProject] = useState("all");
  const [projectStatus, setProjectStatus] = useState("all");
  const [suggestions, setSuggestions] = useState({});
  const [busySuggestion, setBusySuggestion] = useState(null);
  const [toast, setToast] = useState("");

  const [projOpen, setProjOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [projForm, setProjForm] = useState({ name: "", client: "", description: "", department_id: "", status: "active", due_date: "" });
  const [taskForm, setTaskForm] = useState({ title: "", description: "", department_id: "", project_id: "", assignee_id: "", priority: "medium", status: "queued", due_date: "" });

  const canManage = user.role === "cofounder" || user.role === "lead";

  const load = useCallback(async () => {
    try {
      const [t, p, m, d] = await Promise.all([api.tasks(), api.projects(), api.teamUsers(), api.departments()]);
      setTasks(t);
      setProjects(p);
      setTeam(m);
      setDepts(d);
    } catch (err) {
      setToast(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const showToast = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 2600);
  };

  const scopedTasks = useMemo(() => {
    let list = tasks;
    if (activeProject !== "all") list = list.filter((t) => t.project_id === activeProject);
    return list;
  }, [tasks, activeProject]);

  const columns = useMemo(() => {
    const acc = { queued: [], in_progress: [], review: [], done: [] };
    scopedTasks.forEach((t) => {
      if (acc[t.status]) acc[t.status].push(t);
    });
    return acc;
  }, [scopedTasks]);

  const visibleProjects = useMemo(() => {
    const base = activeProject === "all" ? projects : projects.concat();
    return projectStatus === "all" ? base : base.filter((p) => p.status === projectStatus);
  }, [projects, activeProject, projectStatus]);

  const progressFor = (pid) => {
    const pt = tasks.filter((t) => t.project_id === pid);
    if (!pt.length) return { pct: 0, done: 0, total: 0 };
    const done = pt.filter((t) => t.status === "done").length;
    return { pct: Math.round((done / pt.length) * 100), done, total: pt.length };
  };

  const deptLabel = (id) => {
    const d = depts.find((x) => x.id === id);
    return d ? DEPT_LABEL[d.code] || d.name : "Unassigned";
  };

  const move = async (task, nextStatus) => {
    if (nextStatus === "done") {
      try {
        const res = await api.completeTask(task.id, true);
        showToast(
          res.auto_created ? "Completed. AI chained the next task into the backlog." : "Task completed."
        );
      } catch (err) {
        showToast(err.message);
      }
    } else {
      try {
        await api.updateTask(task.id, { status: nextStatus });
      } catch (err) {
        showToast(err.message);
      }
    }
    load();
  };

  const createProject = async (e) => {
    e.preventDefault();
    try {
      await api.createProject({
        name: projForm.name,
        client: projForm.client || null,
        description: projForm.description || null,
        department_id: Number(projForm.department_id || user?.department_id),
        status: projForm.status,
        due_date: projForm.due_date || null,
      });
      setProjOpen(false);
      setProjForm({ name: "", client: "", description: "", department_id: "", status: "active", due_date: "" });
      showToast("Project created. Now assign tasks to it.");
      load();
    } catch (err) {
      showToast(err.message);
    }
  };

  const createTask = async (e) => {
    e.preventDefault();
    const deptId = Number(taskForm.department_id || user?.department_id);
    const assigneeId =
      user?.role === "teammate" ? user.id : taskForm.assignee_id ? Number(taskForm.assignee_id) : null;
    try {
      await api.createTask({
        title: taskForm.title,
        description: taskForm.description || null,
        department_id: deptId,
        project_id: taskForm.project_id ? Number(taskForm.project_id) : null,
        assignee_id: assigneeId,
        priority: taskForm.priority,
        status: taskForm.status || "queued",
        due_date: taskForm.due_date || null,
      });
      setTaskOpen(false);
      setTaskForm({ title: "", description: "", department_id: "", project_id: "", assignee_id: "", priority: "medium", status: "queued", due_date: "" });
      showToast(assigneeId ? "Task created and assigned to the project." : "Task created.");
      load();
    } catch (err) {
      showToast(err.message);
    }
  };

  const openTaskModal = () => {
    setTaskForm({ ...taskForm, department_id: user?.department_id || "" });
    setTaskOpen(true);
  };

  const fetchSuggestions = async (projectId) => {
    if (busySuggestion) return;
    setBusySuggestion(projectId);
    try {
      const res = await api.aiSuggestForProject(projectId);
      setSuggestions((prev) => ({ ...prev, [projectId]: res.options }));
    } catch (err) {
      showToast(err.message);
    } finally {
      setBusySuggestion(null);
    }
  };

  const acceptSuggestion = async (projectId, s) => {
    try {
      const project = projects.find((p) => p.id === projectId);
      await api.createTask({
        title: s.title,
        description: s.description,
        status: "queued",
        priority: s.priority,
        department_id: project?.department_id,
        project_id: projectId,
        ai_generated: true,
      });
      setSuggestions((prev) => ({ ...prev, [projectId]: [] }));
      showToast("AI task accepted into the backlog.");
      load();
    } catch (err) {
      showToast(err.message);
    }
  };

  const teamOptions = (deptId) =>
    team.filter((t) => t.active && (!deptId || t.department_id === deptId || t.role === "cofounder"));

  const projectsFor = (deptId) =>
    projects.filter((p) => !deptId || p.department_id === deptId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="vos-badge">
            <Wrench className="h-3 w-3" />
            OPERATIONS · PROJECT & TASK DELIVERY
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">Operations Board</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {scopedTasks.length} tasks · every task belongs to a project {canManage && "· you can add projects and assign work"}
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <>
              <button onClick={() => setProjOpen(true)} className="vos-btn-ghost">
                <FolderPlus className="h-4 w-4" /> New Project
              </button>
              <button onClick={openTaskModal} className="vos-btn-primary">
                <Plus className="h-4 w-4" /> New Task
              </button>
            </>
          )}
        </div>
      </div>

      {toast && (
        <div className="rounded-lg border border-neon/40 bg-neon/10 px-4 py-2 text-sm text-neon">{toast}</div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {visibleProjects.map((p) => {
          const prog = progressFor(p.id);
          return (
            <div key={p.id} className="vos-card p-5">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-semibold text-white">{p.name}</p>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${PROJECT_STATUSES[p.status] || "border-edge text-zinc-400"}`}>
                  {p.status}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">
                {deptLabel(p.department_id)}
                {p.client ? ` · ${p.client}` : ""}
              </p>
              <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] text-zinc-500">
                  <span>Progress</span>
                  <span>{prog.done}/{prog.total} done</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-neon/80" style={{ width: `${prog.pct}%` }} />
                </div>
              </div>
              <p className="mt-3 text-[10px] text-zinc-600">
                {p.due_date ? `Due ${p.due_date.slice(0, 10)}` : "No due date"}
              </p>
            </div>
          );
        })}
        {projects.length === 0 && (
          <div className="text-sm text-zinc-600 lg:col-span-4">No projects yet — create one to start tracking delivery.</div>
        )}
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <select
          value={activeProject}
          onChange={(e) => setActiveProject(e.target.value)}
          className="vos-input !w-auto"
        >
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1.5">
          {["all", "active", "at_risk", "completed", "on_hold"].map((s) => (
            <button
              key={s}
              onClick={() => setProjectStatus(s)}
              className={
                "rounded-lg border px-2.5 py-1 text-[11px] capitalize " +
                (projectStatus === s ? "border-neon/50 bg-neon/10 text-neon" : "border-edge text-zinc-500")
              }
            >
              {s === "all" ? "All" : s.replace("_", " ")}
            </button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(COLUMNS).map(([key, label]) => (
          <div key={key} className="flex flex-col rounded-2xl border border-edge bg-surface/60 p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{label}</h3>
              <span className="rounded-full border border-edge px-2 text-[10px] text-zinc-500">
                {columns[key].length}
              </span>
            </div>
            <div className="flex-1 space-y-2.5">
              {columns[key].map((t) => (
                <div key={t.id} className="rounded-xl border border-edge bg-obsidian p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium leading-snug text-zinc-200">{t.title}</p>
                    <AIChip active={t.ai_generated} />
                  </div>
                  {t.project_name && (
                    <p className="mt-1.5 inline-flex max-w-full truncate rounded border border-edge px-1.5 py-0.5 text-[10px] text-zinc-400">
                      {t.project_name}
                    </p>
                  )}
                  <p className="mt-1.5 text-[11px] text-zinc-600">
                    {t.assignee_name || "Unassigned"} · {t.due_date || "no due"}
                  </p>
                  {!t.project_name && (
                    <p className="mt-1 text-[11px] text-zinc-700">not attached to a project</p>
                  )}
                  <div className="mt-2 flex gap-1.5">
                    {t.status === "queued" && (
                      <button onClick={() => move(t, "in_progress")} className="vos-btn-ghost !px-2.5 !py-1 text-[11px]">
                        <Play className="h-3 w-3" /> Start
                      </button>
                    )}
                    {t.status === "in_progress" && (
                      <button onClick={() => move(t, "review")} className="vos-btn-ghost !px-2.5 !py-1 text-[11px]">
                        Ready review
                      </button>
                    )}
                    {t.status === "review" && (
                      <button onClick={() => move(t, "done")} className="vos-btn-ghost !px-2.5 !py-1 text-[11px]">
                        <CheckCircle2 className="h-3 w-3" /> Complete
                      </button>
                    )}
                    {t.status === "done" && <TaskStatusBadge status="done" />}
                  </div>
                </div>
              ))}
              {columns[key].length === 0 && (
                <p className="rounded-lg border border-dashed border-edge p-3 text-center text-[11px] text-zinc-700">
                  Empty
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <section className="vos-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Sparkles className="h-4 w-4 text-fuchsia-400" /> AI Next-Task Suggestions
          </h3>
          <span className="text-[11px] text-zinc-500">per project</span>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {projects.slice(0, 3).length === 0 && (
            <p className="text-xs text-zinc-600">No projects yet — ask the sales team to sign a deal.</p>
          )}
          {projects.slice(0, 3).map((p) => (
            <div key={p.id} className="rounded-xl border border-edge bg-obsidian p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-zinc-200">{p.name}</p>
                <button
                  onClick={() => fetchSuggestions(p.id)}
                  disabled={busySuggestion === p.id}
                  className="vos-btn-ghost !px-3 !py-1 text-[11px]"
                >
                  {busySuggestion === p.id
                    ? "Asking…"
                    : suggestions[p.id]?.length
                    ? "Refresh"
                    : "Suggest"}
                </button>
              </div>
              {suggestions[p.id]?.length ? (
                <div className="space-y-2.5">
                  {suggestions[p.id].map((s, i) => (
                    <AiSuggestion
                      key={`${p.id}-${i}`}
                      suggestion={s}
                      onAccept={() => acceptSuggestion(p.id, s)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-zinc-600">
                  Ask the AI engine for the next sequential step on this project.
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <Modal open={projOpen} title="New Project" onClose={() => setProjOpen(false)}>
        <form onSubmit={createProject} className="space-y-4">
          <div>
            <label className="vos-label">Project name *</label>
            <input className="vos-input" value={projForm.name} onChange={(e) => setProjForm({ ...projForm, name: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="vos-label">Client</label>
              <input className="vos-input" value={projForm.client} onChange={(e) => setProjForm({ ...projForm, client: e.target.value })} />
            </div>
            <div>
              <label className="vos-label">Status</label>
              <select className="vos-input" value={projForm.status} onChange={(e) => setProjForm({ ...projForm, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="at_risk">At risk</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On hold</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="vos-label">Owning team</label>
              <select
                className="vos-input"
                value={projForm.department_id}
                onChange={(e) => setProjForm({ ...projForm, department_id: e.target.value })}
                required
              >
                {user?.role === "cofounder" ? (
                  <>
                    <option value="">Select…</option>
                    {depts.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </>
                ) : (
                  <option value={user?.department_id}>{DEPT_LABEL[user?.dept_code] || "My team"}</option>
                )}
              </select>
            </div>
            <div>
              <label className="vos-label">Due date</label>
              <input type="date" className="vos-input" value={projForm.due_date} onChange={(e) => setProjForm({ ...projForm, due_date: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="vos-label">Description</label>
            <textarea className="vos-input resize-none" rows={3} value={projForm.description} onChange={(e) => setProjForm({ ...projForm, description: e.target.value })} />
          </div>
          <button type="submit" className="vos-btn-primary w-full">Create project</button>
        </form>
      </Modal>

      <Modal open={taskOpen} title="New Task" onClose={() => setTaskOpen(false)}>
        <form onSubmit={createTask} className="space-y-4">
          <div>
            <label className="vos-label">Title *</label>
            <input className="vos-input" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="vos-label">Project *</label>
              <select
                className="vos-input"
                value={taskForm.project_id}
                onChange={(e) => setTaskForm({ ...taskForm, project_id: e.target.value })}
                required
              >
                <option value="">Select project…</option>
                {projectsFor(taskForm.department_id || undefined).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-zinc-600">Every task is attached to the project this team is working on.</p>
            </div>
            <div>
              <label className="vos-label">Team</label>
              <select
                className="vos-input"
                value={taskForm.department_id}
                onChange={(e) => {
                  setTaskForm({ ...taskForm, department_id: e.target.value, assignee_id: "", project_id: "" });
                }}
                required
              >
                {user?.role === "cofounder" ? (
                  <>
                    <option value="">Select…</option>
                    {depts.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </>
                ) : (
                  <option value={user?.department_id}>{DEPT_LABEL[user?.dept_code] || "My team"}</option>
                )}
              </select>
            </div>
          </div>
          {user?.role !== "teammate" && (
            <div>
              <label className="vos-label">Assignee</label>
              <select
                className="vos-input"
                value={taskForm.assignee_id}
                onChange={(e) => setTaskForm({ ...taskForm, assignee_id: e.target.value })}
              >
                <option value="">Unassigned</option>
                {teamOptions(taskForm.department_id || undefined).map((t) => (
                  <option key={t.id} value={t.id}>{t.name} · {DEPT_LABEL[t.dept_code] || "Executive"}</option>
                ))}
              </select>
            </div>
          )}
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
          <button type="submit" className="vos-btn-primary w-full">Create task</button>
        </form>
      </Modal>
    </div>
  );
}