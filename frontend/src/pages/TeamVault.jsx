import { useCallback, useEffect, useState } from "react";
import { FileText, Plus, ShieldCheck, UserPlus, Users } from "lucide-react";
import { api } from "../services/api.js";
import { DEPT_LABEL, ROLE_LABEL } from "../consts/roles.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import Modal from "../components/ui/Modal.jsx";

const RBAC_MATRIX = [
  { capability: "View command center", cofounder: "✓", lead: "✓", teammate: "✓" },
  { capability: "View own department", cofounder: "✓", lead: "✓", teammate: "✓" },
  { capability: "Manage department tasks", cofounder: "✓", lead: "✓", teammate: "own only" },
  { capability: "Reassign / override tasks", cofounder: "✓", lead: "✓", teammate: "—" },
  { capability: "Sign deals (pipeline close)", cofounder: "✓", lead: "✓", teammate: "—" },
  { capability: "Finance & Legal vault", cofounder: "✓", lead: "own dept", teammate: "own dept" },
  { capability: "Create users / assign branches", cofounder: "✓", lead: "—", teammate: "—" },
];

const DOC_TYPE_CLS = {
  contract: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  invoice: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  nda: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  policy: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
};

export default function TeamVault() {
  const { user } = useAuth();
  const [tab, setTab] = useState("team");
  const [users, setUsers] = useState([]);
  const [depts, setDepts] = useState([]);
  const [docs, setDocs] = useState([]);
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "teammate", department_id: "" });

  const load = useCallback(async () => {
    try {
      const [u, d, docs] = await Promise.all([api.users(), api.departments(), api.vaultDocs()]);
      setUsers(u);
      setDepts(d);
      setDocs(docs);
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

  const createUser = async (e) => {
    e.preventDefault();
    try {
      await api.createUser({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        department_id: form.department_id ? Number(form.department_id) : null,
      });
      setModal(false);
      setForm({ name: "", email: "", password: "", role: "teammate", department_id: "" });
      showToast("User created and branch assigned.");
      load();
    } catch (err) {
      showToast(err.message);
    }
  };

  const toggleActive = async (u) => {
    try {
      await api.updateUser(u.id, { active: !u.active });
      showToast(u.active ? `${u.name} deactivated.` : `${u.name} re-activated.`);
      load();
    } catch (err) {
      showToast(err.message);
    }
  };

  const fileDoc = async (e) => {
    e.preventDefault();
    try {
      await api.createDoc({
        department_id: Number(e.target.department_id.value),
        title: e.target.title.value,
        doc_type: e.target.doc_type.value,
        file_ref: e.target.file_ref.value || null,
        access_code: e.target.access_code.value,
      });
      e.target.reset();
      showToast("Document filed to vault.");
      load();
    } catch (err) {
      showToast(err.message);
    }
  };

  const deptName = (id) => {
    const d = depts.find((x) => x.id === id);
    return d ? DEPT_LABEL[d.code] : "Executive";
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="vos-badge">
          <ShieldCheck className="h-3 w-3" />
          TEAM VAULT · RBAC
        </p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">Team & Vault</h2>
        <p className="mt-1 text-sm text-zinc-500">Co-Founder governance — users, branches, docs.</p>
      </div>

      {toast && (
        <div className="rounded-lg border border-neon/40 bg-neon/10 px-4 py-2 text-sm text-neon">{toast}</div>
      )}

      <div className="flex gap-2">
        {[
          { id: "team", label: "Team" },
          { id: "rbac", label: "RBAC Matrix" },
          { id: "vault", label: "Finance & Legal Vault" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              "rounded-lg border px-3 py-1.5 text-xs font-medium " +
              (tab === t.id ? "border-neon/50 bg-neon/10 text-neon" : "border-edge text-zinc-500")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "team" && (
        <section className="vos-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-edge px-5 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Users className="h-4 w-4 text-neon" /> Team Roster
            </h3>
            <button onClick={() => setModal(true)} className="vos-btn-primary !px-3 !py-1.5 text-xs">
              <UserPlus className="h-3.5 w-3.5" /> Invite user
            </button>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-surface">
              <tr className="border-b border-edge text-[11px] uppercase tracking-widest text-zinc-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-edge/60 last:border-0 hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-200">{u.name}</p>
                    {u.id === user.id && <span className="text-[10px] text-neon">you</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="rounded border border-edge px-1.5 py-0.5 text-[11px] text-zinc-300">
                      {ROLE_LABEL[u.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {u.dept_code ? DEPT_LABEL[u.dept_code] : "Executive"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "text-[11px] font-semibold " +
                        (u.active ? "text-emerald-400" : "text-zinc-600")
                      }
                    >
                      {u.active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(u)}
                      className="vos-btn-ghost !px-3 !py-1 text-[11px]"
                    >
                      {u.active ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === "rbac" && (
        <section className="vos-card overflow-hidden">
          <div className="border-b border-edge px-5 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <ShieldCheck className="h-4 w-4 text-neon" /> Permission Matrix
            </h3>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-surface">
              <tr className="border-b border-edge text-[11px] uppercase tracking-widest text-zinc-500">
                <th className="px-4 py-3">Capability</th>
                <th className="px-4 py-3">Co-Founder</th>
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">Teammate</th>
              </tr>
            </thead>
            <tbody>
              {RBAC_MATRIX.map((r, i) => (
                <tr key={i} className="border-b border-edge/60 last:border-0">
                  <td className="px-4 py-2.5 text-xs text-zinc-300">{r.capability}</td>
                  <td className="px-4 py-2.5 text-xs text-emerald-400">{r.cofounder}</td>
                  <td className="px-4 py-2.5 text-xs text-zinc-300">{r.lead}</td>
                  <td className="px-4 py-2.5 text-xs text-zinc-500">{r.teammate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === "vault" && (
        <section className="vos-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <FileText className="h-4 w-4 text-neon" /> Document Vault
            </h3>
            {user?.role === "cofounder" && (
              <form
                onSubmit={fileDoc}
                className="flex flex-wrap items-center gap-2"
                style={{ display: "contents" }}
              >
                <button type="submit" className="vos-btn-ghost !px-3 !py-1 text-[11px]">
                  + File finance/legal doc
                </button>
              </form>
            )}
          </div>
          <ul className="divide-y divide-edge/60">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-200">{d.title}</p>
                  <p className="text-[11px] text-zinc-600">
                    {deptName(d.department_id)} · {d.access_code}
                  </p>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${DOC_TYPE_CLS[d.doc_type] || "border-edge text-zinc-400"}`}>
                  {d.doc_type}
                </span>
              </li>
            ))}
            {docs.length === 0 && <li className="px-5 py-6 text-xs text-zinc-600">Vault is empty.</li>}
          </ul>
        </section>
      )}

      <Modal open={modal} title="Invite User" onClose={() => setModal(false)}>
        <form onSubmit={createUser} className="space-y-4">
          <div>
            <label className="vos-label">Full name *</label>
            <input className="vos-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label className="vos-label">Email *</label>
            <input type="email" className="vos-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div>
            <label className="vos-label">Password *</label>
            <input type="password" className="vos-input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="vos-label">Role</label>
              <select className="vos-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="teammate">Teammate</option>
                <option value="lead">Lead</option>
                <option value="cofounder">Co-Founder</option>
              </select>
            </div>
            <div>
              <label className="vos-label">Branch</label>
              <select className="vos-input" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                <option value="">Executive</option>
                {depts.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" className="vos-btn-primary w-full">Create user</button>
        </form>
      </Modal>
    </div>
  );
}