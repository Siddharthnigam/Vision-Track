import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X, Zap } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { api, wsUrl } from "../services/api.js";
import { ChatSocket } from "../services/ws.js";

const TAGS = ["general", "help", "dependency", "campaign"];

const TAG_CLS = {
  general: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
  help: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  dependency: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
  campaign: "border-sky-500/40 bg-sky-500/10 text-sky-300",
};

const TAG_ICON = {
  general: "🤝",
  help: "🆘",
  dependency: "🔗",
  campaign: "📣",
};

function timeLabel(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function ChatDrawer() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [deptId, setDeptId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [tag, setTag] = useState("general");
  const [tagFilter, setTagFilter] = useState("all");
  const [depts, setDepts] = useState([]);
  const [status, setStatus] = useState("closed");
  const socketRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    api.departments().then(setDepts).catch(() => {});
    if (user?.department_id) setDeptId(user.department_id);
  }, [user]);

  useEffect(() => {
    if (!open || !deptId) return;
    api
      .chat(deptId)
      .then((rows) => setMessages(rows))
      .catch(() => {});
  }, [open, deptId]);

  useEffect(() => {
    if (!open || !deptId || !user) return;
    socketRef.current?.close();
    socketRef.current = new ChatSocket(wsUrl(deptId), {
      onMessage: (msg) => {
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === msg.id);
          return exists ? prev : [...prev, msg];
        });
      },
      onStatus: setStatus,
    });
    return () => socketRef.current?.close();
  }, [open, deptId, user]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, tagFilter]);

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    const optimistic = {
      id: `local-${Date.now()}`,
      user_id: user.id,
      user_name: user.name,
      department_id: deptId,
      body: text,
      tag,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setBody("");
    const sent = socketRef.current?.send({ body: text, tag }) || false;
    if (!sent) {
      try {
        const created = await api.sendChat({ body: text, department_id: deptId, tag });
        setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? created : m)));
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      }
    }
  };

  const visible = messages.filter((m) => tagFilter === "all" || m.tag === tagFilter);

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-neon/40 bg-gradient-to-br from-neon to-crimson text-white shadow-glow-lg transition-transform hover:scale-105"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-50 flex h-[70vh] w-[calc(100vw-2.5rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-edge bg-surface shadow-glow-lg">
          <header className="flex items-center justify-between border-b border-edge px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">Collaboration Hub</p>
              <p className="text-[11px] text-zinc-500">
                {status === "open" ? (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <span className="h-1.5 w-1.5 animate-pulseglow rounded-full bg-emerald-400" />
                    Live · connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-zinc-500">
                    <Zap className="h-3 w-3" /> REST fallback
                  </span>
                )}
              </p>
            </div>
            <select
              value={deptId ?? ""}
              onChange={(e) => setDeptId(Number(e.target.value))}
              className="vos-input !w-auto !py-1 text-xs"
            >
              {[
                ...(user?.role === "cofounder" ? depts : []),
                ...(user?.department_id ? depts.filter((d) => d.id === user.department_id) : []),
              ]
                .filter((d, i, a) => a.findIndex((x) => x.id === d.id) === i)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    #{d.name}
                  </option>
                ))}
            </select>
          </header>

          <div className="flex flex-wrap gap-1.5 border-b border-edge/60 px-4 py-2">
            <button
              onClick={() => setTagFilter("all")}
              className={
                "rounded-full border px-2.5 py-0.5 text-[11px] " +
                (tagFilter === "all" ? "border-neon/50 bg-neon/10 text-neon" : "border-edge text-zinc-500")
              }
            >
              All
            </button>
            {TAGS.map((t) => (
              <button
                key={t}
                onClick={() => setTagFilter(t)}
                className={
                  "rounded-full border px-2.5 py-0.5 text-[11px] " +
                  (tagFilter === t ? "border-neon/50 bg-neon/10 text-neon" : "border-edge text-zinc-500")
                }
              >
                {TAG_ICON[t]} {t}
              </button>
            ))}
          </div>

          <div ref={listRef} className="terminal-scroll flex-1 space-y-3 overflow-y-auto p-4">
            {visible.length === 0 && (
              <p className="text-center text-xs text-zinc-600">No messages in this channel.</p>
            )}
            {visible.map((m) => {
              const mine = m.user_id === user?.id;
              return (
                <div key={m.id} className={mine ? "flex flex-col items-end" : "flex flex-col items-start"}>
                  <div
                    className={
                      "max-w-[85%] rounded-xl border px-3 py-2 text-xs leading-relaxed " +
                      (mine
                        ? "border-neon/40 bg-gradient-to-br from-neon/20 to-crimson/10 text-zinc-100"
                        : "border-edge bg-obsidian text-zinc-300")
                    }
                  >
                    <div className="mb-1 flex items-center gap-2 text-[10px] text-zinc-500">
                      <span className="font-semibold text-neon">{m.user_name}</span>
                      <span
                        className={
                          "rounded border px-1 py-px " +
                          (TAG_CLS[m.tag] || TAG_CLS.general)
                        }
                      >
                        {m.tag}
                      </span>
                      <span>{timeLabel(m.created_at)}</span>
                    </div>
                    {m.body}
                  </div>
                </div>
              );
            })}
          </div>

          <footer className="border-t border-edge p-3">
            <div className="mb-2 flex gap-1.5">
              {TAGS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTag(t)}
                  className={
                    "rounded-full border px-2 py-0.5 text-[10px] " +
                    (tag === t ? "border-neon/50 bg-neon/10 text-neon" : "border-edge text-zinc-500")
                  }
                >
                  {TAG_ICON[t]} {t}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Message the department…"
                className="vos-input"
              />
              <button onClick={send} disabled={!body.trim()} className="vos-btn-primary !px-3">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </footer>
        </div>
      )}
    </>
  );
}