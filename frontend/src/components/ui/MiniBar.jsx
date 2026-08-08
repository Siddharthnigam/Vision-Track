export default function MiniBar({ data, accent = "#ef4444" }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex h-20 items-end gap-1">
      {data.map((d, i) => (
        <div key={i} className="group relative flex-1">
          <div
            title={`${d.label ?? ""}: ${d.value}`}
            className="w-full rounded-t-sm transition-all hover:opacity-80"
            style={{
              height: `${Math.max(8, (d.value / max) * 100)}%`,
              background: `linear-gradient(180deg, ${accent}, rgba(239,68,68,0.15))`,
              boxShadow: "0 0 8px rgba(239,68,68,0.25)",
            }}
          />
        </div>
      ))}
    </div>
  );
}