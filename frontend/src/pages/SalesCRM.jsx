import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Handshake, Plus } from "lucide-react";
import { api } from "../services/api.js";
import { LEAD_STATUS, PRIORITY_CLS } from "../consts/roles.jsx";
import { LeadStatusBadge } from "../components/ui/StatusBadge.jsx";
import Modal from "../components/ui/Modal.jsx";

const STAGE_FLOW = ["new", "contacted", "closing", "closed"];

function fmtMoney(n) {
  return `$${Math.round(n || 0).toLocaleString()}`;
}

export default function SalesCRM() {
  const [leads, setLeads] = useState([]);
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState("");
  const [form, setForm] = useState({ company: "", contact: "", email: "", value: "", status: "new", stage_note: "" });

  const load = useCallback(async () => {
    try {
      setLeads(await api.leads());
    } catch (err) {
      setToast(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => (filter === "all" ? leads : leads.filter((l) => l.status === filter)),
    [leads, filter]
  );

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  };

  const advance = async (lead) => {
    const idx = STAGE_FLOW.indexOf(lead.status);
    if (idx < 0 || idx >= STAGE_FLOW.length - 1) return;
    const next = STAGE_FLOW[idx + 1];
    if (next === "closed") {
      try {
        const res = await api.signLead(lead.id);
        showToast(
          `Deal signed! Auto-created ${res.created_tasks.length} tasks across Operations & Marketing.`
        );
      } catch (err) {
        showToast(err.message);
      }
    } else {
      try {
        await api.updateLead(lead.id, { status: next });
        showToast(`Lead moved to ${next}.`);
      } catch (err) {
        showToast(err.message);
      }
    }
    load();
  };

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.createLead({
        company: form.company,
        contact: form.contact || null,
        email: form.email || null,
        value: Number(form.value || 0),
        status: form.status,
        stage_note: form.stage_note || null,
      });
      setModal(false);
      setForm({ company: "", contact: "", email: "", value: "", status: "new", stage_note: "" });
      showToast("Lead added to pipeline.");
      load();
    } catch (err) {
      showToast(err.message);
    }
  };

  const stages = ["all", ...STAGE_FLOW];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="vos-badge">
            <BarChart3 className="h-3 w-3" />
            SALES · CRM & PIPELINE
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">Sales CRM</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {leads.length} leads ·{" "}
            {fmtMoney(leads.filter((l) => l.status !== "closed").reduce((s, l) => s + l.value, 0))} pipeline
          </p>
        </div>
        <button onClick={() => setModal(true)} className="vos-btn-primary">
          <Plus className="h-4 w-4" /> Add Lead
        </button>
      </div>

      {toast && (
        <div className="rounded-lg border border-neon/40 bg-neon/10 px-4 py-2 text-sm text-neon">{toast}</div>
      )}

      <div className="flex flex-wrap gap-2">
        {stages.map((s) => {
          const count = s === "all" ? leads.length : leads.filter((l) => l.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={
                "rounded-full border px-3 py-1 text-xs font-medium capitalize " +
                (filter === s ? "border-neon/50 bg-neon/10 text-neon" : "border-edge text-zinc-500")
              }
            >
              {s} <span className="ml-1 text-[10px]">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="vos-card overflow-hidden">
        <div className="terminal-scroll max-h-[560px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-edge text-[11px] uppercase tracking-widest text-zinc-500">
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-b border-edge/60 transition-colors last:border-0 hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-200">{l.company}</p>
                    <p className="text-[11px] text-zinc-600">{l.stage_note || "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {l.contact || "—"}
                    {l.email && <p className="text-[11px] text-zinc-600">{l.email}</p>}
                  </td>
                  <td className={`px-4 py-3 font-mono text-xs ${PRIORITY_CLS.medium}`}>{fmtMoney(l.value)}</td>
                  <td className="px-4 py-3">
                    <LeadStatusBadge status={l.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{l.owner_name || "—"}</td>
                  <td className="px-4 py-3">
                    {l.status === "closed" ? (
                      <span className="text-[11px] text-emerald-400">Signed ✓</span>
                    ) : (
                      <button onClick={() => advance(l)} className="vos-btn-ghost !px-3 !py-1.5 text-xs">
                        {l.status === "closing" ? (
                          <>
                            <Handshake className="h-3.5 w-3.5" /> Sign deal
                          </>
                        ) : (
                          "Advance"
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-zinc-600">
                    No leads in this stage.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} title="Add Lead" onClose={() => setModal(false)}>
        <form onSubmit={create} className="space-y-4">
          <div>
            <label className="vos-label">Company *</label>
            <input
              className="vos-input"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="vos-label">Contact</label>
              <input className="vos-input" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            </div>
            <div>
              <label className="vos-label">Value ($)</label>
              <input type="number" min="0" className="vos-input" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="vos-label">Email</label>
            <input type="email" className="vos-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="vos-label">Stage</label>
            <select className="vos-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STAGE_FLOW.map((s) => (
                <option key={s} value={s}>{LEAD_STATUS[s].label}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="vos-btn-primary w-full">Create lead</button>
        </form>
      </Modal>
    </div>
  );
}