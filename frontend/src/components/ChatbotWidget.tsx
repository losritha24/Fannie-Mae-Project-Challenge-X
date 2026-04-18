import { useState, useRef, useEffect, useCallback } from "react";
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

  // Drag state
  const [pos, setPos] = useState<{ right: number; bottom: number }>({ right: 24, bottom: 24 });
  const dragging = useRef(false);
  const dragStart = useRef<{ mouseX: number; mouseY: number; right: number; bottom: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const location = useLocation();
  const match = location.pathname.match(/\/case\/([^/]+)/);
  const caseId = match?.[1] ?? null;

  useEffect(() => {
    const handler = (e: Event) => {
      const question = (e as CustomEvent<{ question: string }>).detail.question;
      setOpen(true);
      setQ(question);
    };
    window.addEventListener("chatbot:ask", handler);
    return () => window.removeEventListener("chatbot:ask", handler);
  }, []);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Drag handlers on the header
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, right: pos.right, bottom: pos.bottom };
  }, [pos]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !dragStart.current) return;
      const dx = dragStart.current.mouseX - e.clientX;
      const dy = dragStart.current.mouseY - e.clientY;
      const newRight = Math.max(8, Math.min(window.innerWidth - 80, dragStart.current.right + dx));
      const newBottom = Math.max(8, Math.min(window.innerHeight - 80, dragStart.current.bottom + dy));
      setPos({ right: newRight, bottom: newBottom });
    };
    const onMouseUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

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
      {/* Floating toggle button */}
      <button
        ref={toggleRef}
        className="chatbot-toggle"
        onClick={() => setOpen((o) => !o)}
        style={{ right: pos.right, bottom: pos.bottom }}
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
          ref={panelRef}
          className="chatbot-panel"
          role="dialog"
          aria-modal="false"
          aria-label="Property AI Assistant"
          style={{ right: pos.right, bottom: pos.bottom + 80 }}
        >
          {/* Header — drag handle */}
          <div
            className="chatbot-header"
            onMouseDown={onMouseDown}
            style={{ cursor: "grab", userSelect: "none" }}
          >
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
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginLeft: 4 }}>drag to move</span>
            </div>
            <button
              className="chatbot-close"
              onClick={() => setOpen(false)}
              onMouseDown={(e) => e.stopPropagation()}
              aria-label="Close chatbot"
            >
              ✕
            </button>
          </div>

          {!caseId && (
            <p className="chatbot-subtitle muted" style={{ fontSize: 12 }}>
              Ask anything about property valuation, comparables, or market trends.
            </p>
          )}

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
                    <div>
                      {m.direct_answer?.split('\n').map((line, j) => (
                        <div key={j} style={{ marginBottom: line.startsWith('•') ? 4 : 0 }}>{line}</div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
            {busy && (
              <div className="chat-msg assistant chatbot-thinking">Thinking…</div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="chatbot-input-row">
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={caseId ? 'e.g. "Why is the range so wide?"' : 'e.g. "How are AVM models calculated?"'}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              disabled={busy}
              aria-label="Ask the assistant"
            />
            <button onClick={ask} disabled={busy || !q.trim()}>Ask</button>
          </div>
        </div>
      )}
    </>
  );
}
