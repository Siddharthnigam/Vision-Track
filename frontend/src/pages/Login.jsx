import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Loader2, Lock, Mail } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

const DEMOS = [
  ["Ava Chen", "Co-Founder", "ava@vision.agency", "cofound123"],
  ["Marcus Webb", "Sales Lead", "marcus@vision.agency", "lead123"],
  ["Priya Patel", "Ops Lead", "priya@vision.agency", "lead123"],
  ["Zoe Lin", "Marketing Lead", "zoe@vision.agency", "lead123"],
  ["Theo Reed", "Sales Teammate", "theo@vision.agency", "team123"],
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const fill = (demoEmail, demoPass) => {
    setEmail(demoEmail);
    setPassword(demoPass);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-neon/40 bg-gradient-to-br from-neon/20 to-crimson/10 shadow-glow">
            <Eye className="h-5 w-5 text-neon animate-pulseglow" />
          </span>
          <span className="text-xl font-bold tracking-tight text-white">
            Vision<span className="text-neon vos-glow-text">Track</span>
          </span>
        </div>

        <form onSubmit={submit} className="vos-card p-6">
          <h1 className="text-lg font-semibold text-white">Sign in to Agency OS</h1>
          <p className="mt-1 text-xs text-zinc-500">Role-based access control enforced server-side.</p>

          {error && (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          )}

          <div className="mt-5 space-y-4">
            <div>
              <label className="vos-label">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-zinc-600" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="vos-input pl-9"
                  placeholder="you@agency.com"
                  required
                />
              </div>
            </div>
            <div>
              <label className="vos-label">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-zinc-600" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="vos-input pl-9"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>
          </div>

          <button type="submit" disabled={busy} className="vos-btn-primary mt-5 w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="vos-card mt-4 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Demo accounts — click to autofill
          </p>
          <div className="mt-2 space-y-1.5">
            {DEMOS.map(([name, role, mail, pass]) => (
              <button
                key={mail}
                onClick={() => fill(mail, pass)}
                className="flex w-full items-center justify-between rounded-lg border border-edge px-3 py-2 text-left text-xs transition-colors hover:border-neon/40 hover:bg-neon/5"
              >
                <span className="text-zinc-300">
                  <span className="font-semibold text-white">{name}</span>
                  <span className="ml-2 text-zinc-500">{role}</span>
                </span>
                <code className="text-[10px] text-neon/80">{mail}</code>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}