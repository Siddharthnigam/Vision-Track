import { NavLink } from "react-router-dom";
import { Eye, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { canViewNav, DEPT_LABEL, NAV_ITEMS, ROLE_LABEL } from "../consts/roles.jsx";

function linkClass({ isActive }) {
  return [
    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
    isActive
      ? "bg-neon/10 text-neon shadow-glow-sm"
      : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
  ].join(" ");
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const visible = NAV_ITEMS.filter((item) => canViewNav(user, item.code));

  return (
    <aside className="sticky top-0 flex h-screen w-16 flex-col gap-6 border-r border-edge/80 bg-obsidian/80 px-2 py-4 backdrop-blur-md md:w-60 md:px-4">
      <NavLink to="/" className="flex items-center justify-center gap-2.5 md:justify-start">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-neon/40 bg-gradient-to-br from-neon/20 to-crimson/10 shadow-glow-sm">
          <Eye className="h-5 w-5 text-neon animate-pulseglow" />
        </span>
        <span className="hidden text-lg font-bold tracking-tight text-white md:inline">
          Vision<span className="text-neon vos-glow-text">Track</span>
        </span>
      </NavLink>

      <nav className="flex flex-1 flex-col gap-1">
        {visible.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={linkClass} end={to === "/"}>
            <Icon className="h-4 w-4 shrink-0" />
            <span className="hidden md:inline">{label}</span>
          </NavLink>
        ))}
      </nav>

      {user && (
        <div className="border-t border-edge/80 pt-3">
          <div className="flex items-center gap-2.5 px-1">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neon/40 bg-neon/10 text-xs font-bold text-neon">
              {user.name
                .split(" ")
                .map((s) => s[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <div className="hidden min-w-0 md:block">
              <p className="truncate text-xs font-semibold text-white">{user.name}</p>
              <p className="truncate text-[11px] text-zinc-500">
                {ROLE_LABEL[user.role]} · {user.dept_code ? DEPT_LABEL[user.dept_code] : "Executive"}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-edge px-3 py-2 text-xs font-medium text-zinc-500 transition-colors hover:border-neon/40 hover:text-neon md:justify-start"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Log out</span>
          </button>
        </div>
      )}
    </aside>
  );
}