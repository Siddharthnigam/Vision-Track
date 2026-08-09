import {
  BarChart3,
  Bot,
  LayoutDashboard,
  Megaphone,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";

export const ROLE_LABEL = {
  cofounder: "Co-Founder",
  lead: "Department Lead",
  teammate: "Teammate",
};

export const DEPT_LABEL = {
  sales: "Sales",
  marketing: "Marketing",
  operations: "Operations",
  finance: "Finance",
  legal: "Legal",
};

export const NAV_ITEMS = [
  { to: "/", label: "Command Center", code: "all", icon: LayoutDashboard },
  { to: "/sales", label: "Sales CRM", code: "sales", icon: BarChart3 },
  { to: "/operations", label: "Operations", code: "operations", icon: Wrench },
  { to: "/marketing", label: "Marketing", code: "marketing", icon: Megaphone },
  { to: "/team", label: "Team Admin", code: "team", icon: Users },
  { to: "/vault", label: "Team & Vault", code: "vault", icon: ShieldCheck },
];

export function canViewNav(user, code) {
  if (!user) return false;
  if (user.role === "cofounder") return true;
  if (code === "all") return true;
  if (code === "vault" || code === "team") return false;
  return user.dept_code === code;
}

export function canViewRoute(user, code) {
  if (!user) return false;
  if (user.role === "cofounder") return true;
  if (code === "all") return true;
  if (code === "vault" || code === "team") return false;
  return user.dept_code === code;
}

export const STATUS_META = {
  queued: { label: "Queued", cls: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300" },
  in_progress: { label: "In Progress", cls: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
  review: { label: "Review", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  done: { label: "Done", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
};

export const LEAD_STATUS = {
  new: { label: "New", cls: "border-zinc-400/40 bg-zinc-400/10 text-zinc-200" },
  contacted: { label: "Contacted", cls: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
  closing: { label: "In Progress", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  closed: { label: "Closed · Won", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
};

export const PRIORITY_CLS = {
  high: "text-red-400",
  medium: "text-amber-300",
  low: "text-zinc-500",
};

export const PROVIDER_LABEL = {
  instagram: "Instagram",
  email: "Email",
};

export const AIChip = ({ active }) =>
  active ? (
    <span className="inline-flex items-center gap-1 rounded border border-fuchsia-500/40 bg-fuchsia-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-300">
      <Bot className="h-3 w-3" /> AI
    </span>
  ) : null;

export const isAdmin = (user) => user?.role === "cofounder";
export const isLead = (user) => user?.role === "cofounder" || user?.role === "lead";