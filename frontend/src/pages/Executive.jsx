import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Banknote, CheckCircle2, DollarSign, FolderKanban, ListTodo } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../services/api.js";
import { DEPT_LABEL } from "../consts/roles.jsx";
import KpiCard from "../components/ui/KpiCard.jsx";
import { TaskStatusBadge } from "../components/ui/StatusBadge.jsx";

const DEPT_ORDER = ["sales", "marketing", "operations", "finance", "legal"];

function HealthBars({ counts }) {
  const total = counts.queued + counts.in_progress + counts.review + counts.done || 1;
  const segments = [
    { key: "queued",      label: "Queued",      color: "#71717a" },
    { key: "in_progress", label: "In Progress", color: "#38bdf8" },
    { key: "review",      label: "Review",      color: "#f59e0b" },
    { key: "done",        label: "Done",        color: "#10b981" },
  ];
  return (
    <div>
      <div className="flex h-2.5 gap-1 overflow-hidden rounded-full bg-obsidian">
        {segments.map((s) => (
          <div
            key={s.key}
            style={{ width: `${(counts[s.key] / total) * 100}%`, background: s.color }}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-zinc-500">
        {segments.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label} · {counts[s.key]}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Executive() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [depts, setDepts] = useState([]);
  const [finance, setFinance] = useState(null);
  const [leads, setLeads] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d] = await Promise.all([
        api.departments(),
        api.tasks().then(setTasks),
        api.projects().then(setProjects),
      ]);
      setDepts(d);
      const isExec = user?.role === "cofounder";
      api.financeSummary()
        .then(setFinance)
        .catch(() => setFinance(null));
      api.leads()
        .then(setLeads)
        .catch(() => setLeads(null));
      if (!isExec) {
        // ensure peer data is not misleading for non-exec users
        setFinance(null);
        setLeads(null);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const statusCounts = useMemo(() => {
    const counts = { queued: 0, in_progress: 0, review: 0, done: 0 };
    tasks.forEach((t) => {
      if (counts[t.status] !== undefined) counts[t.status] += 1;
    });
    return counts;
  }, [tasks]);

  const deptStats = useMemo(() => {
    const byDept = {};
    tasks.forEach((t) => {
      const code = t.dept_code || "unassigned";
      byDept[code] = byDept[code] || { open: 0, done: 0 };
      if (t.status === "done") byDept[code].done += 1;
      else byDept[code].open += 1;
    });
    return byDept;
  }, [tasks]);

  const revenue = finance?.total_revenue ?? 0;
  const pipeline = finance?.pipeline_value ?? 0;
  const openLeads =
    user.role === "cofounder" && leads ? leads.filter((l) => l.status !== "closed").length : null;
  const signed =
    finance?.signed_leads ?? (leads ? leads.filter((l) => l.status === "closed").length : null);

  return (
    <div className="space-y-6">
      <div>
        <p className="vos-badge">
          <Activity className="h-3 w-3" />
          {user.role === "cofounder" ? "CO-FOUNDER COMMAND CENTER" : "DEPARTMENT OVERVIEW"}
        </p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {user.role === "cofounder" ? "Command Center" : "Your Workspace"}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">Cross-department operational intelligence.</p>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-1.5 text-xs">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={DollarSign}
          label="Revenue"
          value={finance ? fmtMoney(revenue) : "—"}
          sub="$ from closed leads"
          tone="red"
        />
        <KpiCard
          icon={Banknote}
          label="Pipeline Value"
          value={finance ? fmtMoney(pipeline) : "—"}
          sub={openLeads !== null ? `${openLeads} open leads` : "finance scope"}
        />
        <KpiCard
          icon={FolderKanban}
          label="Active Projects"
          value={projects.filter((p) => p.status === "active").length}
          sub={`${projects.length} total`}
        />
        <KpiCard
          icon={ListTodo}
          label="Open Tasks"
          value={tasks.filter((t) => t.status !== "done").length}
          sub="your scope"
          tone="red"
        />
      </div>

      <section className="vos-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Task Health</h3>
          <span className="text-[11px] text-zinc-500">{tasks.length} tasks in scope</span>
        </div>
        <HealthBars counts={statusCounts} />
      </section>

      <section className="vos-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-white">Department Pulse</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(user.role === "cofounder" ? DEPT_ORDER : [user.dept_code])
            .filter(Boolean)
            .map((code) => {
              const s = deptStats[code] || { open: 0, done: 0 };
              return (
                <div key={code} className="rounded-xl border border-edge bg-obsidian p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-zinc-200">{DEPT_LABEL[code] || code}</p>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  </div>
                  <p className="mt-2 text-2xl font-bold text-white">{s.open}</p>
                  <p className="text-[11px] text-zinc-500">open · {s.done} done</p>
                </div>
              );
            })}
        </div>
      </section>

      {(user.role === "cofounder") && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="vos-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-white">Finance Snapshot</h3>
            {finance && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-edge p-3">
                  <p className="text-[11px] text-zinc-500">Signed deals</p>
                  <p className="mt-1 text-xl font-bold text-white">{finance.signed_leads}</p>
                </div>
                <div className="rounded-lg border border-edge p-3">
                  <p className="text-[11px] text-zinc-500">Invoice docs</p>
                  <p className="mt-1 text-xl font-bold text-white">{finance.invoices.length}</p>
                </div>
              </div>
            )}
            {!finance && <p className="text-xs text-zinc-600">Finance scope only for co-founders.</p>}
          </section>

          <section className="vos-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-white">Pipeline</h3>
            {leads ? (
              <div className="grid grid-cols-3 gap-3 text-center">
                {["new", "contacted", "closing", "closed"].map((st) => {
                  const n = leads.filter((l) => l.status === st).length;
                  return (
                    <div key={st} className="rounded-lg border border-edge p-3">
                      <p className="text-lg font-bold text-neon">{n}</p>
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{st}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">Sales scope only.</p>
            )}
          </section>
        </div>
      )}

      <section className="vos-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Recent Tasks</h3>
          <span className="text-[11px] text-zinc-500">latest first</span>
        </div>
        <div className="divide-y divide-edge/60">
          {tasks.slice(0, 6).map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm text-zinc-200">
                  {t.title}
                  {t.ai_generated && (
                    <span className="ml-2 rounded border border-fuchsia-500/40 bg-fuchsia-500/10 px-1.5 py-px text-[10px] font-semibold text-fuchsia-300">
                      AI
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-zinc-600">
                  {t.project_name || "Standalone"} · {t.assignee_name || "Unassigned"} · {t.dept_code}
                </p>
              </div>
              <TaskStatusBadge status={t.status} />
            </div>
          ))}
          {tasks.length === 0 && <p className="py-4 text-xs text-zinc-600">No tasks in scope.</p>}
        </div>
      </section>
    </div>
  );
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function fmtMoney(n) {
  return n ? inr.format(n) : "—";
}