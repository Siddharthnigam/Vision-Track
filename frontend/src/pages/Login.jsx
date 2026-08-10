import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Loader2, Lock, Mail } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

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
      setError(err.message || "Invalid email or password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-neon/40 bg-gradient-to-br from-neon/20 to-crimson/10">
            <Eye className="h-5 w-5 text-neon" />
          </span>
          <span className="text-xl font-bold tracking-tight text-white">
            Vision<span className="text-neon">Track</span>
          </span>
        </div>

        {/* Form card */}
        <form onSubmit={submit} className="vos-card p-6 space-y-5">
          <div>
            <h1 className="text-lg font-semibold text-white">Sign in</h1>
            <p className="mt-1 text-xs text-zinc-500">
              Access is managed by your organisation admin.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="vos-label">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-zinc-600" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="vos-input pl-9"
                placeholder="you@company.com"
                required
                autoFocus
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

          <button type="submit" disabled={busy} className="vos-btn-primary w-full">
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>

          <p className="text-center text-[11px] text-zinc-600">
            Locked out? Contact your organisation admin to reset your password.
          </p>
        </form>

      </div>
    </div>
  );
}
