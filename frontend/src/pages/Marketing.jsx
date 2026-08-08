import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarClock, Instagram, Mail, Plus } from "lucide-react";
import { api } from "../services/api.js";
import { PROVIDER_LABEL } from "../consts/roles.jsx";
import KpiCard from "../components/ui/KpiCard.jsx";
import MiniBar from "../components/ui/MiniBar.jsx";
import Modal from "../components/ui/Modal.jsx";

function seriesFor(data, platform, label) {
  return data
    .filter((m) => m.platform === platform && m.label === label)
    .sort((a, b) => new Date(a.recorded_on) - new Date(b.recorded_on))
    .map((m) => ({ value: m.value, label: m.label }));
}

const POST_STATUS_CLS = {
  draft: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
  scheduled: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  published: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
};

function fmtNum(n) {
  const x = Number(n || 0);
  if (x >= 1000) return `${(x / 1000).toFixed(1)}k`;
  return Math.round(x).toLocaleString();
}

export default function Marketing() {
  const [data, setData] = useState(null);
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ platform: "instagram", content: "", status: "draft" });

  const load = useCallback(async () => {
    try {
      setData(await api.marketingSummary());
    } catch (err) {
      setToast(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const latest = useMemo(() => {
    const pick = (p, l) => {
      const arr = (data?.instagram || data?.email || []).filter(
        (m) => m.platform === p && m.label === l
      );
      return arr[0]?.value ?? 0;
    };
    return {
      igFollowers: pick("instagram", "followers"),
      igReach: pick("instagram", "total_reach"),
      igEngagement: pick("instagram", "engagement_rate"),
      igViews: pick("instagram", "profile_views"),
      openRate: pick("email", "open_rate"),
      clickRate: pick("email", "click_rate"),
      delivered: pick("email", "delivered"),
      bounceRate: pick("email", "bounce_rate"),
    };
  }, [data]);

  const igFollowers = useMemo(() => seriesFor(data?.instagram || [], "instagram", "followers"), [data]);
  const igReach = useMemo(() => seriesFor(data?.instagram || [], "instagram", "total_reach"), [data]);
  const emailOpen = useMemo(() => seriesFor(data?.email || [], "email", "open_rate"), [data]);
  const emailCtr = useMemo(() => seriesFor(data?.email || [], "email", "click_rate"), [data]);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.createPost(form);
      setModal(false);
      setForm({ platform: "instagram", content: "", status: "draft" });
      setToast("Post created.");
      load();
    } catch (err) {
      setToast(err.message);
    }
  };

  const showToast = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 2600);
  };

  const toggleStatus = async (post) => {
    const map = { draft: "scheduled", scheduled: "published" };
    try {
      await api.updatePost(post.id, { status: map[post.status] || "published" });
      load();
    } catch (err) {
      showToast(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="vos-badge">
            <BarChart3 className="h-3 w-3" />
            MARKETING · SOCIAL & EMAIL ANALYTICS
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">Marketing</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {PROVIDER_LABEL.instagram} engagement + email funnel tracking.
          </p>
        </div>
        <button onClick={() => setModal(true)} className="vos-btn-primary">
          <Plus className="h-4 w-4" /> Create Post
        </button>
      </div>

      {toast && (
        <div className="rounded-lg border border-neon/40 bg-neon/10 px-4 py-2 text-sm text-neon">{toast}</div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Instagram} label="Followers" value={fmtNum(latest.igFollowers)} sub="last 14 days" tone="red" />
        <KpiCard icon={Instagram} label="Reach (14d)" value={fmtNum(latest.igReach)} sub="top of funnel" />
        <KpiCard icon={Instagram} label="Engagement Rate" value={`${latest.igEngagement}%`} sub="per post" />
        <KpiCard icon={Instagram} label="Profile views" value={fmtNum(latest.igViews)} sub="14-day total" />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="vos-card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <Instagram className="h-4 w-4 text-neon" /> Instagram Growth
          </h3>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-zinc-500">Followers</p>
              <MiniBar data={igFollowers} accent="#ef4444" />
            </div>
            <div>
              <p className="text-[11px] text-zinc-500">Reach</p>
              <MiniBar data={igReach} accent="#fb7185" />
            </div>
          </div>
          <p className="text-[11px] text-zinc-600">Daily rollup from the metrics vault.</p>
        </div>

        <div className="vos-card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <Mail className="h-4 w-4 text-neon" /> Email Metrics
          </h3>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-zinc-500">Open rate %</p>
              <MiniBar data={emailOpen} accent="#38bdf8" />
            </div>
            <div>
              <p className="text-[11px] text-zinc-500">Click rate %</p>
              <MiniBar data={emailCtr} accent="#22d3ee" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-edge p-3">
              <p className="text-[11px] text-zinc-500">Delivered</p>
              <p className="mt-1 text-xl font-bold text-white">{fmtNum(latest.delivered)}</p>
            </div>
            <div className="rounded-lg border border-edge p-3">
              <p className="text-[11px] text-zinc-500">Bounce rate</p>
              <p className="mt-1 text-xl font-bold text-white">{latest.bounceRate}%</p>
            </div>
          </div>
        </div>
      </section>

      <section className="vos-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <CalendarClock className="h-4 w-4 text-neon" /> Content Schedule
          </h3>
          <span className="text-[11px] text-zinc-500">{data?.posts?.length ?? 0} posts</span>
        </div>
        <div className="terminal-scroll max-h-[420px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-edge text-[11px] uppercase tracking-widest text-zinc-500">
                <th className="px-4 py-3">Platform</th>
                <th className="px-4 py-3">Content</th>
                <th className="px-4 py-3">Scheduled</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {data?.posts?.map((p) => (
                <tr key={p.id} className="border-b border-edge/60 last:border-0 hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-xs text-zinc-300">
                      {p.platform === "instagram" ? <Instagram className="h-3.5 w-3.5 text-neon" /> : <Mail className="h-3.5 w-3.5 text-neon" />}
                      {PROVIDER_LABEL[p.platform]}
                    </span>
                  </td>
                  <td className="max-w-[300px] truncate px-4 py-3 text-xs text-zinc-400">{p.content}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">
                    {p.scheduled_at ? new Date(p.scheduled_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${POST_STATUS_CLS[p.status]}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.status !== "published" && (
                      <button onClick={() => toggleStatus(p)} className="vos-btn-ghost !px-3 !py-1 text-[11px]">
                        {p.status === "draft" ? "Schedule" : "Mark published"}
                      </button>
                    )}
                    {p.status === "published" && (
                      <span className="text-xs text-zinc-600">{p.engagement} engagements</span>
                    )}
                  </td>
                </tr>
              ))}
              {data && data.posts?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-xs text-zinc-600">No posts scheduled.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={modal} title="Create Post" onClose={() => setModal(false)}>
        <form onSubmit={create} className="space-y-4">
          <div>
            <label className="vos-label">Platform</label>
            <select className="vos-input" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
              <option value="instagram">Instagram</option>
              <option value="email">Email</option>
            </select>
          </div>
          <div>
            <label className="vos-label">Content</label>
            <textarea
              className="vos-input resize-none"
              rows={4}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="vos-label">Status</label>
            <select className="vos-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </div>
          <button type="submit" className="vos-btn-primary w-full">Create</button>
        </form>
      </Modal>
    </div>
  );
}