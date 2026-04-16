import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../api/client";

interface ChatMessage {
  role: "user" | "assistant";
  content?: string;
  classification?: string;
  direct_answer?: string;
  supporting_evidence?: { source_name: string; source_ref: string; excerpt: string }[];
  data_gaps?: string[];
  suggested_next_action?: string;
}

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const location = useLocation();
  const match = location.pathname.match(/\/case\/([^/]+)/);
  const caseId = match?.[1] ?? null;

  // Listen for chatbot:ask events dispatched by workspace suggestion chips
  useEffect(() => {
    const handler = (e: Event) => {
      const question = (e as CustomEvent<{ question: string }>).detail.question;
      setOpen(true);
      setQ(question);
    };
    window.addEventListener("chatbot:ask", handler);
    return () => window.removeEventListener("chatbot:ask", handler);
  }, []);

  // Auto-scroll to latest message
  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [msgs, open]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const ask = async () => {
    if (!q.trim() || busy || !caseId) return;
    const question = q.trim();
    setMsgs((m) => [...m, { role: "user", content: question }]);
    setQ("");
    setBusy(true);
    try {
      const r = await api.chat(caseId, question);
      setMsgs((m) => [...m, { role: "assistant", ...r }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "assistant", direct_answer: `Error: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  // Only render on case pages
  if (!caseId) return null;

  return (
    <>
      {/* Floating toggle button — fixed bottom-right */}
      <button
        className="chatbot-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chatbot" : "Open evidence-grounded chatbot"}
        title={open ? "Close chatbot" : "Evidence-Grounded Chatbot"}
      >
        {open ? "✕" : "💬"}
      </button>

      {/* Overlay panel */}
      {open && (
        <div
          className="chatbot-panel"
          role="dialog"
          aria-modal="false"
          aria-label="Evidence-Grounded Chatbot"
        >
          {/* Header */}
          <div className="chatbot-header">
            <span>Evidence-Grounded Chatbot</span>
            <button
              className="chatbot-close"
              onClick={() => setOpen(false)}
              aria-label="Close chatbot"
            >
              ✕
            </button>
          </div>

          {/* Subtitle */}
          <p className="chatbot-subtitle muted">
            Ask anything about this property, comparables, anomalies, or valuation methodology.
          </p>

          {/* Message thread */}
          <div className="chatbot-messages">
            {msgs.length === 0 && (
              <div className="chatbot-empty muted">
                No messages yet — ask a question below.
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                {m.role === "user" ? (
                  m.content
                ) : (
                  <>
                    {m.classification && (
                      <span className="pill" style={{ marginBottom: 4, display: "inline-block" }}>
                        {m.classification}
                      </span>
                    )}
                    <div>{m.direct_answer}</div>
                    {m.supporting_evidence?.map((c, j) => (
                      <span key={j} className="cite">
                        → {c.source_name} ({c.source_ref}): {c.excerpt}
                      </span>
                    ))}
                    {m.data_gaps?.length ? (
                      <span className="cite">Gaps: {m.data_gaps.join("; ")}</span>
                    ) : null}
                    {m.suggested_next_action && (
                      <span className="cite">Next: {m.suggested_next_action}</span>
                    )}
                  </>
                )}
              </div>
            ))}
            {busy && (
              <div className="chat-msg assistant chatbot-thinking">
                Thinking…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input row */}
          <div className="chatbot-input-row">
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder='e.g. "Why is the range so wide?"'
              onKeyDown={(e) => e.key === "Enter" && ask()}
              disabled={busy}
              aria-label="Ask the assistant"
            />
            <button onClick={ask} disabled={busy || !q.trim()}>
              Ask
            </button>
          </div>
        </div>
      )}
    </>
  );
}
