import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  ClipboardPaste,
  FileSpreadsheet,
  FileText,
  Handshake,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "../services/api.js";
import { LEAD_STATUS } from "../consts/roles.jsx";
import { LeadStatusBadge } from "../components/ui/StatusBadge.jsx";
import Modal from "../components/ui/Modal.jsx";

const STAGE_FLOW = ["new", "contacted", "closing", "closed"];

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function fmtMoney(n) {
  return n ? inr.format(n) : "—";
}

const SAMPLE_TEXT = `company\tphone\tcategoryName\twebsite\taddress
Shree Saree House\t+91 98765 43210\tSaree Shop\tssarees.example.com\tNarmada Road, Jabalpur, MP 482001`;

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
};

export default function SalesCRM() {
  const [leads, setLeads] = useState([]);
  const [imports, setImports] = useState([]);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(false);
  const [editLead, setEditLead] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState("file");
  const [toast, setToast] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [pasteText, setPasteText] = useState("");
  const [selected, setSelected] = useState(new Set());

  const load = useCallback(async () => {
    try {
      const [leadsData, importsData] = await Promise.all([api.leads(), api.salesImports()]);
      setLeads(leadsData);
      setImports(importsData);
    } catch (err) {
      setToast(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  const stats = useMemo(() => {
    const s = { all: leads.length, new: 0, contacted: 0, closing: 0, closed: 0 };
    leads.forEach((l) => {
      if (s[l.status] !== undefined) s[l.status] += 1;
    });
    return s;
  }, [leads]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  };

  const doParse = async (kind) => {
    setBusy(true);
    setSelected(new Set());
    try {
      const res =
        kind === "file"
          ? await api.importSalesFile(pendingFile)
          : await api.importSalesText(pasteText, `Pasted sales notes (${new Date().toLocaleString()})`);
      setPreview(res);
      setSelected(new Set(res.leads.map((_, i) => i)));
    } catch (err) {
      setToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleRow = (i) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const acceptImport = async () => {
    if (!preview) return;
    const rows = preview.leads.filter((_, i) => selected.has(i));
    if (!rows.length) {
      setToast("Select at least one row to import.");
      return;
    }
    setBusy(true);
    try {
      await api.acceptSalesImport(preview.source.id, rows);
      showToast(`${rows.length} lead${rows.length > 1 ? "s" : ""} imported into the pipeline.`);
      setImportOpen(false);
      setPreview(null);
      setPendingFile(null);
      setPasteText("");
      await load();
    } catch (err) {
      setToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const advance = async (lead) => {
    const idx = STAGE_FLOW.indexOf(lead.status);
    if (idx < 0 || idx >= STAGE_FLOW.length - 1) return;
    const next = STAGE_FLOW[idx + 1];
    try {
      if (next === "closed") {
        const res = await api.signLead(lead.id);
        showToast(
          `Deal signed! Auto-created ${res.created_tasks.length} tasks across Operations & Marketing.`
        );
      } else {
        await api.updateLead(lead.id, { status: next });
        showToast(`Lead moved to ${LEAD_STATUS[next].label}.`);
      }
      await load();
    } catch (err) {
      showToast(err.message);
    }
  };

  const openAdd = () => {
    setEditLead(null);
    setForm(EMPTY_FORM);
    setModal(true);
  };

  const openEdit = (lead) => {
    setEditLead(lead);
    setForm({
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
    });
    setModal(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    const payload = {
      company: form.company,
      contact: form.contact || null,
      phone: form.phone || null,
      email: form.email || null,
      category: form.category || null,
      address: form.address || null,
      website: form.website || null,
      value: Number(form.value || 0),
      status: form.status,
      stage_note: form.stage_note || null,
    };
    try {
      if (editLead) {
        await api.updateLead(editLead.id, payload);
        showToast("Lead updated.");
      } else {
        await api.createLead(payload);
        showToast("Lead added to pipeline.");
      }
      setModal(false);
      await load();
    } catch (err) {
      setToast(err.message);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await api.deleteLead(deleting.id);
      showToast(`"${deleting.company}" deleted.`);
      setDeleting(null);
      await load();
    } catch (err) {
      showToast(err.message);
      setDeleting(null);
    }
  };

  const telHref = (p) => `tel:${(p || "").replace(/[^\d+]/g, "")}`;

  const stages = ["all", ...STAGE_FLOW];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="vos-badge">
            <BarChart3 className="h-3 w-3" />
            SALES · CRM & PIPELINE
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Sales CRM
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {leads.length} leads ·{" "}
            {fmtMoney(
              leads.filter((l) => l.status !== "closed").reduce((sum, l) => sum + l.value, 0)
            )}{" "}
            open pipeline
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setImportOpen(true)} className="vos-btn-ghost">
            <Upload className="h-4 w-4" /> Import Sales Data
          </button>
          <button onClick={openAdd} className="vos-btn-primary">
            <Plus className="h-4 w-4" /> Add Lead
          </button>
        </div>
      </div>

      {toast && (
        <div className="rounded-lg border border-neon/40 bg-neon/10 px-4 py-2 text-sm text-neon">{toast}</div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stages.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={
              "vos-card !p-3 text-left transition-colors " +
              (filter === s ? "border-neon/50 bg-neon/10" : "hover:border-edge")
            }
          >
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">
              {s === "all" ? "Total" : LEAD_STATUS[s].label}
            </p>
            <p className="mt-1 text-xl font-bold text-white">{stats[s] || 0}</p>
          </button>
        ))}
      </div>

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

      <div className="vos-card overflow-hidden">
        <div className="terminal-scroll max-h-[60vh] overflow-auto">
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
                <tr
                  key={l.id}
                  className="border-b border-edge/60 transition-colors last:border-0 hover:bg-white/[0.03]"
                >
                  <td className="max-w-[260px] px-4 py-3">
                    <p className="truncate font-medium text-zinc-200" title={l.company}>
                      {l.company}
                    </p>
                    <p className="truncate text-[11px] text-zinc-600" title={l.address || ""}>
                      {l.address || "—"}
                    </p>
                    {l.website && (
                      <a
                        href={l.website.startsWith("http") ? l.website : `https://${l.website}`}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate block text-[11px] text-neon/70 hover:text-neon"
                        title={l.website}
                      >
                        {l.website.replace(/^https?:\/\//, "")}
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {l.phone ? (
                      <a
                        href={telHref(l.phone)}
                        className="inline-flex items-center gap-1.5 rounded border border-edge px-2 py-1 font-mono text-xs text-zinc-200 hover:border-neon/50 hover:text-neon"
                        title="Tap to call"
                      >
                        <Phone className="h-3 w-3" /> {l.phone}
                      </a>
                    ) : (
                      "—"
                    )}
                    {l.contact && <p className="mt-1 text-zinc-500">Contact: {l.contact}</p>}
                    {l.email && <p className="text-[11px] text-zinc-600">{l.email}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {l.category ? (
                      <span className="rounded border border-edge bg-white/[0.04] px-2 py-0.5 text-[11px] text-zinc-300">
                        {l.category}
                      </span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-amber-300">{fmtMoney(l.value)}</td>
                  <td className="px-4 py-3">
                    <LeadStatusBadge status={l.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{l.owner_name || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {l.status === "closed" ? (
                        <span className="text-[11px] text-emerald-400">Signed</span>
                      ) : (
                        <button
                          onClick={() => advance(l)}
                          className="vos-btn-ghost !px-2.5 !py-1 text-xs"
                          title={l.status === "closing" ? "Sign deal & close" : "Move to next stage"}
                        >
                          {l.status === "closing" ? (
                            <>
                              <Handshake className="h-3.5 w-3.5" /> Close
                            </>
                          ) : (
                            "Advance"
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(l)}
                        className="vos-btn-ghost !px-2 !py-1 text-xs"
                        title="Edit lead"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleting(l)}
                        className="!px-2 !py-1 text-xs text-red-400/70 hover:text-red-400"
                        title="Delete lead"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-xs text-zinc-600">
                    {query
                      ? "No leads match your search."
                      : "No leads in this stage. Import your sales data or add a lead."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {imports.length > 0 && (
        <div className="vos-card overflow-hidden">
          <p className="border-b border-edge px-4 py-3 text-[11px] uppercase tracking-widest text-zinc-500">
            Recent Imports
          </p>
          <div className="terminal-scroll max-h-48 divide-y divide-edge/60 overflow-auto">
            {imports.map((imp) => (
              <div key={imp.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  {imp.source_type === "text" ? (
                    <ClipboardPaste className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                  ) : (
                    <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-zinc-300">{imp.title}</p>
                    <p className="text-[11px] text-zinc-600">
                      {imp.filename || "pasted text"} · {imp.row_count} rows
                    </p>
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

      <Modal open={modal} title={editLead ? "Edit Lead" : "Add Lead"} onClose={() => setModal(false)}>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="vos-label">Company / Business name *</label>
            <input
              className="vos-input"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="vos-label">Contact person</label>
              <input className="vos-input" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            </div>
            <div>
              <label className="vos-label">Phone (with +91)</label>
              <input className="vos-input" placeholder="+91 98xxx xxxxx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="vos-label">Category / Industry</label>
              <input className="vos-input" placeholder="e.g. Saree Shop, Goldsmith" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div>
              <label className="vos-label">Deal value (₹)</label>
              <input type="number" min="0" className="vos-input" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="vos-label">Address / Area / City</label>
            <textarea className="vos-input resize-y text-xs" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="vos-label">Website</label>
              <input className="vos-input" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
            <div>
              <label className="vos-label">Email</label>
              <input type="email" className="vos-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="vos-label">Stage</label>
              <select className="vos-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STAGE_FLOW.map((s) => (
                  <option key={s} value={s}>{LEAD_STATUS[s].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="vos-label">Notes</label>
              <input className="vos-input" value={form.stage_note} onChange={(e) => setForm({ ...form, stage_note: e.target.value })} />
            </div>
          </div>
          <button type="submit" className="vos-btn-primary w-full">
            {editLead ? "Save changes" : "Create lead"}
          </button>
        </form>
      </Modal>

      <Modal open={!!deleting} title="Delete lead" onClose={() => setDeleting(null)}>
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            Delete <span className="font-medium text-white">{deleting?.company}</span> from the
            pipeline? This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeleting(null)} className="vos-btn-ghost">Cancel</button>
            <button onClick={remove} className="rounded-lg bg-red-500/90 px-4 py-2 text-sm font-medium text-white hover:bg-red-500">
              Delete
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={importOpen} title="Import Sales Data" onClose={() => { setImportOpen(false); setPreview(null); setPendingFile(null); setPasteText(""); }}>
        {preview ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-edge bg-white/[0.02] px-3 py-2 text-xs text-zinc-400">
              Source: <span className="text-zinc-200">{preview.source.title}</span>
              {preview.source.filename && (
                <span className="ml-1 text-zinc-600">({preview.source.filename})</span>
              )} · {preview.leads.length} parsed
              {preview.skipped > 0 && <span className="text-amber-400"> · {preview.skipped} skipped</span>}
            </div>
            <div className="terminal-scroll max-h-[40vh] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-edge text-[11px] uppercase tracking-widest text-zinc-500">
                    <th className="w-8 px-2 py-2" />
                    <th className="px-2 py-2">Company</th>
                    <th className="px-2 py-2">Phone</th>
                    <th className="px-2 py-2">Category</th>
                    <th className="px-2 py-2">Value</th>
                    <th className="px-2 py-2">Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.leads.map((l, i) => (
                    <tr key={i} className="border-b border-edge/60 last:border-0">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          className="accent-neon"
                          checked={selected.has(i)}
                          onChange={() => toggleRow(i)}
                        />
                      </td>
                      <td className="max-w-[200px] px-2 py-2">
                        <p className="truncate font-medium text-zinc-200">{l.company}</p>
                        <p className="truncate text-[11px] text-zinc-600">{l.address || l.stage_note || "—"}</p>
                      </td>
                      <td className="px-2 py-2 font-mono text-[11px] text-zinc-300">{l.phone || "—"}</td>
                      <td className="px-2 py-2 text-[11px] text-zinc-400">{l.category || "—"}</td>
                      <td className="px-2 py-2 font-mono text-[11px] text-amber-300">{fmtMoney(l.value)}</td>
                      <td className="px-2 py-2">
                        <LeadStatusBadge status={l.status} />
                      </td>
                    </tr>
                  ))}
                  {preview.leads.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-xs text-zinc-600">
                        No lead rows detected. Try a header row like Company / Phone / Category / Address.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => setPreview(null)} className="vos-btn-ghost">Back</button>
              <button onClick={acceptImport} disabled={busy} className="vos-btn-primary">
                {busy ? "Importing…" : `Import ${selected.size} lead${selected.size === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                onClick={() => setImportMode("file")}
                className={
                  "flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium " +
                  (importMode === "file" ? "border-neon/50 bg-neon/10 text-neon" : "border-edge text-zinc-500")
                }
              >
                <FileSpreadsheet className="h-4 w-4" /> File (Excel / CSV / PDF)
              </button>
              <button
                onClick={() => setImportMode("text")}
                className={
                  "flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium " +
                  (importMode === "text" ? "border-neon/50 bg-neon/10 text-neon" : "border-edge text-zinc-500")
                }
              >
                <ClipboardPaste className="h-4 w-4" /> Paste Notes / Table
              </button>
            </div>

            {importMode === "file" ? (
              <div>
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-edge bg-white/[0.02] px-4 py-8 text-center hover:border-neon/50">
                  <FileText className="h-6 w-6 text-zinc-500" />
                  <span className="text-xs text-zinc-400">
                    {pendingFile ? pendingFile.name : "Drop an Excel, CSV or PDF with your sale data"}
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,.xlsm,.csv,.tsv,.pdf"
                    className="hidden"
                    onChange={(e) => setPendingFile(e.target.files?.[0] || null)}
                  />
                </label>
                <p className="mt-2 text-[11px] text-zinc-600">
                  Works with columns like <code className="text-zinc-400">title / phone / categoryName / website / address</code>.
                  PDFs are parsed as text — the clearer the table, the better.
                </p>
                <button onClick={() => doParse("file")} disabled={!pendingFile || busy} className="vos-btn-primary mt-3 w-full">
                  {busy ? "Parsing…" : "Parse file"}
                </button>
              </div>
            ) : (
              <div>
                <textarea
                  className="vos-input min-h-[140px] resize-y font-mono text-xs"
                  placeholder={`Paste a tab/comma separated table or one line per deal.\n\nExample:\n${SAMPLE_TEXT}`}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                />
                <p className="mt-2 text-[11px] text-zinc-600">
                  One line per lead, e.g. <code className="text-zinc-400">Company · +91 98xxx · saree shop · area</code>
                </p>
                <button onClick={() => doParse("text")} disabled={!pasteText.trim() || busy} className="vos-btn-primary mt-3 w-full">
                  {busy ? "Parsing…" : "Parse text"}
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}