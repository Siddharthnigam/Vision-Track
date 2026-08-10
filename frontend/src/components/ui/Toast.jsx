import { useCallback, useRef, useState } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";

// ─── useToast hook ────────────────────────────────────────────────────────────

export function useToast() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const push = useCallback((msg, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, msg, type }]);
    timers.current[id] = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id]);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return {
    toasts,
    dismiss,
    success: useCallback((msg) => push(msg, "success"), [push]),
    error:   useCallback((msg) => push(msg, "error"),   [push]),
    info:    push,
  };
}

// ─── Toast display component ──────────────────────────────────────────────────

export function Toast({ toasts, dismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm w-full">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${
            t.type === "error"
              ? "border-red-500/40 bg-red-500/10 text-red-300"
              : t.type === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-neon/40 bg-neon/10 text-neon"
          }`}
        >
          {t.type === "error" ? (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span className="flex-1">{t.msg}</span>
          <button
            onClick={() => dismiss(t.id)}
            className="ml-1 shrink-0 opacity-50 hover:opacity-100 transition-opacity"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
