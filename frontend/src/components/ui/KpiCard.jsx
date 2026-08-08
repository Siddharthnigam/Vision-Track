export default function KpiCard({ icon: Icon, label, value, sub, tone = "default" }) {
  return (
    <div className="vos-card relative overflow-hidden p-5">
      <div className="glossy pointer-events-none absolute inset-0" />
      <div className="relative flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            {label}
          </p>
          <p className="mt-3 truncate text-2xl font-bold text-white">{value}</p>
          {sub && <p className="mt-2 truncate text-xs text-zinc-500">{sub}</p>}
        </div>
        <span
          className={
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border " +
            (tone === "red"
              ? "border-neon/40 bg-neon/10 text-neon shadow-glow-sm"
              : "border-edge bg-white/5 text-zinc-400")
          }
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}