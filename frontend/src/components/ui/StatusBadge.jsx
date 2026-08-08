import { LEAD_STATUS, STATUS_META } from "../../consts/roles.jsx";

export function TaskStatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, cls: "border-edge bg-white/5 text-zinc-400" };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

export function LeadStatusBadge({ status }) {
  const meta = LEAD_STATUS[status] || { label: status, cls: "border-edge bg-white/5 text-zinc-400" };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}