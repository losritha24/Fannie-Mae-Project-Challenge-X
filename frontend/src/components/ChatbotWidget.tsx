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
  const [iconError, setIconError] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const location = useLocation();
  const match = location.pathname.match(/\/case\/([^/]+)/);
  const caseId = match?.[1] ?? null;

  // Listen for chatbot:ask events dispatched by suggestion chips
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
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const ask = async () => {
    if (!q.trim() || busy) return;
    const question = q.trim();
    setMsgs((m) => [...m, { role: "user", content: question }]);
    setQ("");
    setBusy(true);
    try {
      const r = await api.chat(caseId ?? "general", question);
      setMsgs((m) => [...m, { role: "assistant", ...r }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "assistant", direct_answer: `Error: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  const iconSrc = "/chatbot-icon.png";

  return (
    <>
      {/* Floating toggle button — always visible, fixed bottom-right */}
      <button
        className="chatbot-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chatbot" : "Open Property AI Assistant"}
        title={open ? "Close chatbot" : "Property AI Assistant"}
      >
        {open ? (
          <span style={{ fontSize: 20, lineHeight: 1 }}>✕</span>
        ) : iconError ? (
          <span style={{ fontSize: 28, lineHeight: 1 }}>🤖</span>
        ) : (
          <img
            src={iconSrc}
            alt="Property AI Assistant"
            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
            onError={() => setIconError(true)}
          />
        )}
      </button>

      {/* Overlay panel */}
      {open && (
        <div
          className="chatbot-panel"
          role="dialog"
          aria-modal="false"
          aria-label="Property AI Assistant"
        >
          {/* Header */}
          <div className="chatbot-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {!iconError && (
                <img
                  src={iconSrc}
                  alt=""
                  style={{ width: 24, height: 24, objectFit: "contain" }}
                  onError={() => setIconError(true)}
                />
              )}
              <span>Property AI Assistant</span>
            </div>
            <button
              className="chatbot-close"
              onClick={() => setOpen(false)}
              aria-label="Close chatbot"
            >
              ✕
            </button>
          </div>

          {/* Subtitle */}
          {!caseId && (
            <p className="chatbot-subtitle muted" style={{ fontSize: 12 }}>
              Ask anything about property valuation, comparables, or market trends.
            </p>
          )}

          {/* Message thread */}
          <div className="chatbot-messages">
            {msgs.length === 0 && (
              <div className="chatbot-empty muted">
                {caseId
                  ? "Ask anything about this property — valuation, comparables, anomalies, or market trends."
                  : "Ask me about property valuation methods, AVM models, market trends, or open a property workspace for case-specific analysis."}
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
              placeholder={
                caseId
                  ? 'e.g. "Why is the range so wide?"'
                  : 'e.g. "How are AVM models calculated?"'
              }
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
