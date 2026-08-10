import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  ClipboardPaste,
  FileSpreadsheet,
  FileText,
  Handshake,
  Loader2,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { api } from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { LEAD_STATUS } from "../consts/roles.jsx";
import { LeadStatusBadge } from "../components/ui/StatusBadge.jsx";
import Modal from "../components/ui/Modal.jsx";

// ─── constants ───────────────────────────────────────────────────────────────

const STAGE_FLOW = ["new", "contacted", "closing", "closed"];

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const fmt = (n) => (n ? inr.format(n) : "—");

const EMPTY_FORM = {
  company: "",
  contact: "",
  phone: "",
  email: "",
  category: "",
  address: "",
  website: "",
  value: "",
  status: "new",
  stage_note: "",
  owner_id: "",
};

const SAMPLE_TEXT = `company\tphone\tcategoryName\twebsite\taddress
Shree Saree House\t+91 98765 43210\tSaree Shop\tssarees.example.com\tNarmada Road, Jabalpur, MP 482001`;

// ─── Toast system ─────────────────────────────────────────────────────────────

function Toast({ toasts, dismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg transition-all ${
            t.type === "error"
              ? "border-red-500/40 bg-red-500/10 text-red-300"
              : t.type === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-neon/40 bg-neon/10 text-neon"
          }`}
        >
          {t.type === "error" ? (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span className="flex-1">{t.msg}</span>
          <button onClick={() => dismiss(t.id)} className="ml-2 opacity-60 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const timerRef = useRef({});

  const push = useCallback((msg, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, msg, type }]);
    timerRef.current[id] = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const dismiss = useCallback((id) => {
    clearTimeout(timerRef.current[id]);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const success = useCallback((msg) => push(msg, "success"), [push]);
  const error = useCallback((msg) => push(msg, "error"), [push]);

  return { toasts, dismiss, success, error, info: push };
}

// ─── Pipeline stats bar ───────────────────────────────────────────────────────

function PipelineStats({ leads }) {
  const stats = useMemo(() => {
    const total = leads.reduce((s, l) => s + (l.value || 0), 0);
    const closed = leads.filter((l) => l.status === "closed").reduce((s, l) => s + (l.value || 0), 0);
    const open = leads.filter((l) => l.status !== "closed").reduce((s, l) => s + (l.value || 0), 0);
    const closing = leads.filter((l) => l.status === "closing").reduce((s, l) => s + (l.value || 0), 0);
    const winRate = leads.length
      ? Math.round((leads.filter((l) => l.status === "closed").length / leads.length) * 100)
      : 0;
    return { total, closed, open, closing, winRate };
  }, [leads]);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="vos-card p-4">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500">Open Pipeline</p>
        <p className="mt-1 text-lg font-bold text-white">{fmt(stats.open)}</p>
        <p className="mt-0.5 text-[11px] text-zinc-600">
          {leads.filter((l) => l.status !== "closed").length} active leads
        </p>
      </div>
      <div className="vos-card p-4">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500">In Closing</p>
        <p className="mt-1 text-lg font-bold text-amber-300">{fmt(stats.closing)}</p>
        <p className="mt-0.5 text-[11px] text-zinc-600">
          {leads.filter((l) => l.status === "closing").length} deals
        </p>
      </div>
      <div className="vos-card p-4">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500">Revenue Closed</p>
        <p className="mt-1 text-lg font-bold text-emerald-400">{fmt(stats.closed)}</p>
        <p className="mt-0.5 text-[11px] text-zinc-600">
          {leads.filter((l) => l.status === "closed").length} won
        </p>
      </div>
      <div className="vos-card p-4">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500">Win Rate</p>
        <p className="mt-1 text-lg font-bold text-sky-400">{stats.winRate}%</p>
        <p className="mt-0.5 text-[11px] text-zinc-600">{leads.length} total leads</p>
      </div>
    </div>
  );
}


// ─── Lead form modal ──────────────────────────────────────────────────────────

function LeadForm({ lead, users, onSave, onClose, toast }) {
  const [form, setForm] = useState(
    lead
      ? {
          company: lead.company || "",
          contact: lead.contact || "",
          phone: lead.phone || "",
          email: lead.email || "",
          category: lead.category || "",
          address: lead.address || "",
          website: lead.website || "",
          value: lead.value ? String(lead.value) : "",
          status: lead.status || "new",
          stage_note: lead.stage_note || "",
          owner_id: lead.owner_id ? String(lead.owner_id) : "",
        }
      : { ...EMPTY_FORM }
  );
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.company.trim()) return;
    setSaving(true);
    const payload = {
      company: form.company.trim(),
      contact: form.contact || null,
      phone: form.phone || null,
      email: form.email || null,
      category: form.category || null,
      address: form.address || null,
      website: form.website || null,
      value: Number(form.value || 0),
      status: form.status,
      stage_note: form.stage_note || null,
      owner_id: form.owner_id ? Number(form.owner_id) : null,
    };
    try {
      if (lead) {
        await api.updateLead(lead.id, payload);
        toast.success("Lead updated.");
      } else {
        await api.createLead(payload);
        toast.success("Lead added to pipeline.");
      }
      onSave();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="vos-label">Company / Business name *</label>
        <input className="vos-input" value={form.company} onChange={(e) => set("company", e.target.value)} required autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="vos-label">Contact person</label>
          <input className="vos-input" value={form.contact} onChange={(e) => set("contact", e.target.value)} />
        </div>
        <div>
          <label className="vos-label">Phone</label>
          <input className="vos-input" placeholder="+91 98xxx xxxxx" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="vos-label">Email</label>
          <input type="email" className="vos-input" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div>
          <label className="vos-label">Category / Industry</label>
          <input className="vos-input" placeholder="e.g. Saree Shop" value={form.category} onChange={(e) => set("category", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="vos-label">Deal value (₹)</label>
          <input type="number" min="0" className="vos-input" value={form.value} onChange={(e) => set("value", e.target.value)} />
        </div>
        <div>
          <label className="vos-label">Stage</label>
          <select className="vos-input" value={form.status} onChange={(e) => set("status", e.target.value)}>
            {STAGE_FLOW.map((s) => (
              <option key={s} value={s}>{LEAD_STATUS[s].label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="vos-label">Address / Area / City</label>
        <textarea className="vos-input resize-y text-xs" rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="vos-label">Website</label>
          <input className="vos-input" value={form.website} onChange={(e) => set("website", e.target.value)} />
        </div>
        <div>
          <label className="vos-label">Notes</label>
          <input className="vos-input" value={form.stage_note} onChange={(e) => set("stage_note", e.target.value)} />
        </div>
      </div>
      {users.length > 0 && (
        <div>
          <label className="vos-label">Assign owner</label>
          <select className="vos-input" value={form.owner_id} onChange={(e) => set("owner_id", e.target.value)}>
            <option value="">— Unassigned —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
            ))}
          </select>
        </div>
      )}
      <button type="submit" disabled={saving} className="vos-btn-primary w-full">
        {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : lead ? "Save changes" : "Create lead"}
      </button>
    </form>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ lead, onConfirm, onClose, toast }) {
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await api.deleteLead(lead.id);
      toast.success(`"${lead.company}" removed from pipeline.`);
      onConfirm();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        Delete <span className="font-semibold text-white">{lead?.company}</span> from the pipeline? This cannot be undone.
      </p>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="vos-btn-ghost">Cancel</button>
        <button onClick={confirm} disabled={busy} className="flex items-center gap-2 rounded-lg bg-red-600/80 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Delete
        </button>
      </div>
    </div>
  );
}

// ─── Import modal ─────────────────────────────────────────────────────────────

function ImportModal({ onDone, toast, onClose }) {
  const [mode, setMode] = useState("file");
  const [pendingFile, setPendingFile] = useState(null);
  const [pasteText, setPasteText] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(new Set());

  const parse = async () => {
    setBusy(true);
    try {
      const res =
        mode === "file"
          ? await api.importSalesFile(pendingFile)
          : await api.importSalesText(pasteText, `Pasted notes (${new Date().toLocaleString()})`);
      setPreview(res);
      setSelected(new Set(res.leads.map((_, i) => i)));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleAll = () =>
    setSelected(selected.size === preview.leads.length ? new Set() : new Set(preview.leads.map((_, i) => i)));

  const toggle = (i) =>
    setSelected((p) => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const accept = async () => {
    const rows = preview.leads.filter((_, i) => selected.has(i));
    if (!rows.length) { toast.error("Select at least one row."); return; }
    setBusy(true);
    try {
      await api.acceptSalesImport(preview.source.id, rows);
      toast.success(`${rows.length} lead${rows.length !== 1 ? "s" : ""} imported.`);
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (preview) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-edge bg-white/[0.02] px-3 py-2 text-xs text-zinc-400">
          <span className="text-zinc-200">{preview.source.title}</span>
          {preview.source.filename && <span className="ml-1 text-zinc-600">({preview.source.filename})</span>}
          <span className="ml-2">{preview.leads.length} parsed</span>
          {preview.skipped > 0 && <span className="ml-1 text-amber-400"> · {preview.skipped} skipped</span>}
        </div>
        <div className="overflow-auto rounded-lg border border-edge" style={{ maxHeight: "45vh" }}>
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-edge text-[11px] uppercase tracking-widest text-zinc-500">
                <th className="w-8 px-2 py-2">
                  <input type="checkbox" className="accent-neon" checked={selected.size === preview.leads.length && preview.leads.length > 0} onChange={toggleAll} />
                </th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Value</th>
                <th className="px-3 py-2">Stage</th>
              </tr>
            </thead>
            <tbody>
              {preview.leads.map((l, i) => (
                <tr key={i} className={`border-b border-edge/50 last:border-0 transition-colors ${selected.has(i) ? "" : "opacity-40"}`}>
                  <td className="px-2 py-2"><input type="checkbox" className="accent-neon" checked={selected.has(i)} onChange={() => toggle(i)} /></td>
                  <td className="max-w-[200px] px-3 py-2">
                    <p className="truncate font-medium text-zinc-200">{l.company}</p>
                    <p className="truncate text-[11px] text-zinc-600">{l.address || "—"}</p>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-zinc-300">{l.phone || "—"}</td>
                  <td className="px-3 py-2 text-[11px] text-zinc-400">{l.category || "—"}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-amber-300">{fmt(l.value)}</td>
                  <td className="px-3 py-2"><LeadStatusBadge status={l.status} /></td>
                </tr>
              ))}
              {preview.leads.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-zinc-600">No rows detected. Try header: Company / Phone / Category / Address</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => setPreview(null)} className="vos-btn-ghost">← Back</button>
          <p className="text-xs text-zinc-500">{selected.size} of {preview.leads.length} selected</p>
          <button onClick={accept} disabled={busy || !selected.size} className="vos-btn-primary">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</> : `Import ${selected.size} lead${selected.size !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[{ k: "file", icon: FileSpreadsheet, label: "File (Excel / CSV)" }, { k: "text", icon: ClipboardPaste, label: "Paste Table / Notes" }].map(({ k, icon: Icon, label }) => (
          <button key={k} onClick={() => setMode(k)} className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors ${mode === k ? "border-neon/50 bg-neon/10 text-neon" : "border-edge text-zinc-500 hover:border-zinc-600"}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
      {mode === "file" ? (
        <div>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-edge bg-white/[0.02] px-4 py-10 text-center hover:border-neon/40 transition-colors">
            <FileText className="h-7 w-7 text-zinc-600" />
            <span className="text-xs text-zinc-400">{pendingFile ? <span className="text-neon">{pendingFile.name}</span> : "Drop or click to upload Excel, CSV, TSV or PDF"}</span>
            <span className="text-[11px] text-zinc-600">Columns: Company · Phone · Category · Address · Website · Value</span>
            <input type="file" accept=".xlsx,.xlsm,.csv,.tsv,.pdf" className="hidden" onChange={(e) => setPendingFile(e.target.files?.[0] || null)} />
          </label>
          <button onClick={parse} disabled={!pendingFile || busy} className="vos-btn-primary mt-3 w-full">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Parsing…</> : "Parse & Preview"}
          </button>
        </div>
      ) : (
        <div>
          <textarea className="vos-input min-h-[150px] resize-y font-mono text-xs" placeholder={`Paste tab/comma separated data or one deal per line.\n\nExample:\n${SAMPLE_TEXT}`} value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
          <button onClick={parse} disabled={!pasteText.trim() || busy} className="vos-btn-primary mt-3 w-full">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Parsing…</> : "Parse & Preview"}
          </button>
        </div>
      )}
    </div>
  );
}


// ─── Main page ────────────────────────────────────────────────────────────────

export default function SalesCRM() {
  const { user } = useAuth();
  const isCofounder = user?.role === "cofounder";

  const [leads, setLeads] = useState([]);
  const [imports, setImports] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  // modals
  const [editLead, setEditLead] = useState(null);   // null = closed, false = new, object = edit
  const [deleteLead, setDeleteLead] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  // advancing stage
  const [advancingId, setAdvancingId] = useState(null);

  const toast = useToast();

  // ── load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const fetches = [api.leads(), api.salesImports()];
      if (isCofounder) fetches.push(api.teamUsers());
      const results = await Promise.all(fetches);
      setLeads(results[0]);
      setImports(results[1]);
      if (isCofounder) setUsers(results[2]);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [isCofounder]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  // ── derived data ──────────────────────────────────────────────────────────

  const STAGES = ["all", ...STAGE_FLOW];

  const stageCounts = useMemo(() => {
    const s = { all: leads.length, new: 0, contacted: 0, closing: 0, closed: 0 };
    leads.forEach((l) => { if (s[l.status] !== undefined) s[l.status]++; });
    return s;
  }, [leads]);

  const filtered = useMemo(() => {
    let out = filter === "all" ? leads : leads.filter((l) => l.status === filter);
    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter((l) =>
        [l.company, l.contact, l.phone, l.email, l.category, l.address]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(q))
      );
    }
    return out;
  }, [leads, filter, query]);

  // ── actions ───────────────────────────────────────────────────────────────

  const advance = async (lead) => {
    const idx = STAGE_FLOW.indexOf(lead.status);
    if (idx < 0 || idx >= STAGE_FLOW.length - 1) return;
    const next = STAGE_FLOW[idx + 1];
    setAdvancingId(lead.id);
    try {
      if (next === "closed") {
        const res = await api.signLead(lead.id);
        toast.success(`Deal signed! ${res.created_tasks.length} tasks auto-created across Operations & Marketing.`);
      } else {
        await api.updateLead(lead.id, { status: next });
        toast.success(`Moved to ${LEAD_STATUS[next].label}.`);
      }
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAdvancingId(null);
    }
  };

  const telHref = (p) => `tel:${(p || "").replace(/[^\d+]/g, "")}`;

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="vos-badge">
            <BarChart3 className="h-3 w-3" /> SALES · CRM & PIPELINE
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Sales CRM
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {leads.length} leads · {fmt(leads.filter((l) => l.status !== "closed").reduce((s, l) => s + l.value, 0))} open pipeline
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setImportOpen(true)} className="vos-btn-ghost">
            <Upload className="h-4 w-4" /> Import Sales Data
          </button>
          <button onClick={() => setEditLead(false)} className="vos-btn-primary">
            <Plus className="h-4 w-4" /> Add Lead
          </button>
        </div>
      </div>

      {/* Pipeline value stats */}
      <PipelineStats leads={leads} />

      {/* Stage filter tabs */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {STAGES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`vos-card !p-3 text-left transition-colors ${filter === s ? "border-neon/50 bg-neon/10" : "hover:border-zinc-600"}`}
          >
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">
              {s === "all" ? "All" : LEAD_STATUS[s].label}
            </p>
            <p className="mt-1 text-xl font-bold text-white">{stageCounts[s] || 0}</p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
          <input
            className="vos-input !pl-9"
            placeholder="Search by company, phone, category, city…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className="text-xs text-zinc-600">{filtered.length} shown</span>
      </div>

      {/* Leads table */}
      <div className="vos-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading leads…
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-edge text-[11px] uppercase tracking-widest text-zinc-500">
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Phone / Contact</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id} className="border-b border-edge/60 last:border-0 transition-colors hover:bg-white/[0.02]">
                    <td className="max-w-[240px] px-4 py-3">
                      <p className="truncate font-medium text-zinc-200" title={l.company}>{l.company}</p>
                      <p className="truncate text-[11px] text-zinc-600" title={l.address || ""}>{l.address || "—"}</p>
                      {l.website && (
                        <a
                          href={l.website.startsWith("http") ? l.website : `https://${l.website}`}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-[11px] text-neon/70 hover:text-neon"
                        >
                          {l.website.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400">
                      {l.phone ? (
                        <a href={telHref(l.phone)} className="inline-flex items-center gap-1.5 rounded border border-edge px-2 py-1 font-mono text-xs text-zinc-200 hover:border-neon/50 hover:text-neon">
                          <Phone className="h-3 w-3" /> {l.phone}
                        </a>
                      ) : "—"}
                      {l.contact && <p className="mt-1 text-zinc-500">{l.contact}</p>}
                      {l.email && <p className="text-[11px] text-zinc-600">{l.email}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {l.category
                        ? <span className="rounded border border-edge bg-white/[0.04] px-2 py-0.5 text-[11px] text-zinc-300">{l.category}</span>
                        : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-amber-300">{fmt(l.value)}</td>
                    <td className="px-4 py-3"><LeadStatusBadge status={l.status} /></td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{l.owner_name || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {l.status === "closed" ? (
                          <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                            <TrendingUp className="h-3 w-3" /> Won
                          </span>
                        ) : (
                          <button
                            onClick={() => advance(l)}
                            disabled={advancingId === l.id}
                            className="vos-btn-ghost !px-2.5 !py-1 text-xs"
                            title={l.status === "closing" ? "Sign deal & close" : "Move to next stage"}
                          >
                            {advancingId === l.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : l.status === "closing"
                              ? <><Handshake className="h-3.5 w-3.5" /> Close</>
                              : "Advance"}
                          </button>
                        )}
                        <button onClick={() => setEditLead(l)} className="vos-btn-ghost !px-2 !py-1 text-xs" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setDeleteLead(l)} className="rounded p-1.5 text-red-400/60 hover:text-red-400 transition-colors" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-xs text-zinc-600">
                      {query ? "No leads match your search." : "No leads in this stage. Import data or add a lead."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent imports */}
      {imports.length > 0 && (
        <div className="vos-card overflow-hidden">
          <p className="border-b border-edge px-4 py-3 text-[11px] uppercase tracking-widest text-zinc-500">
            Recent Imports
          </p>
          <div className="max-h-48 divide-y divide-edge/60 overflow-auto">
            {imports.map((imp) => (
              <div key={imp.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  {imp.source_type === "text"
                    ? <ClipboardPaste className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                    : <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-zinc-500" />}
                  <div className="min-w-0">
                    <p className="truncate text-zinc-300">{imp.title}</p>
                    <p className="text-[11px] text-zinc-600">{imp.filename || "pasted text"} · {imp.row_count} rows</p>
                  </div>
                </div>
                <span className="shrink-0 text-[11px] text-zinc-600">
                  {new Date(imp.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add / Edit lead modal */}
      <Modal
        open={editLead !== null}
        title={editLead ? "Edit Lead" : "Add Lead"}
        onClose={() => setEditLead(null)}
      >
        <LeadForm
          lead={editLead || null}
          users={users}
          onSave={load}
          onClose={() => setEditLead(null)}
          toast={toast}
        />
      </Modal>

      {/* Delete confirm modal */}
      <Modal open={!!deleteLead} title="Delete lead" onClose={() => setDeleteLead(null)}>
        <DeleteConfirm
          lead={deleteLead}
          onConfirm={load}
          onClose={() => setDeleteLead(null)}
          toast={toast}
        />
      </Modal>

      {/* Import modal */}
      <Modal
        open={importOpen}
        title="Import Sales Data"
        wide
        onClose={() => setImportOpen(false)}
      >
        <ImportModal
          onDone={load}
          toast={toast}
          onClose={() => setImportOpen(false)}
        />
      </Modal>

      {/* Toast notifications */}
      <Toast toasts={toast.toasts} dismiss={toast.dismiss} />
    </div>
  );
}
