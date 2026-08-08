import { Bot, CheckCircle2, Sparkles } from "lucide-react";

export default function AiSuggestion({ suggestion, onAccept, busy }) {
  return (
    <div className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/[0.04] p-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-fuchsia-300">
        <Sparkles className="h-3 w-3" />
        AI Suggestion
      </div>
      <p className="mt-2 text-sm text-zinc-100">{suggestion.title}</p>
      {suggestion.description && (
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">{suggestion.description}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
        <span className="rounded border border-edge px-1.5 py-0.5">{suggestion.dept_code}</span>
        <span className="rounded border border-edge px-1.5 py-0.5">{suggestion.priority}</span>
        <span className="rounded border border-edge px-1.5 py-0.5">in {suggestion.due_in_days}d</span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button onClick={onAccept} disabled={busy} className="vos-btn-primary !px-3 !py-1.5 text-xs">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {busy ? "Creating…" : "Accept"}
        </button>
        {suggestion.assignee_hint && (
          <span className="flex items-center gap-1 text-[11px] text-zinc-600">
            <Bot className="h-3 w-3" />
            {suggestion.assignee_hint}
          </span>
        )}
      </div>
    </div>
  );
}