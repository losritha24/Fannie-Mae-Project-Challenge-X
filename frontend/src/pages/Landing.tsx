import { useNavigate } from "react-router-dom";

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #0d1f3c 0%, #1f4e8a 60%, #163a6e 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 24px",
      color: "#eaeef5",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>

      {/* Logo / wordmark */}
      <div style={{ marginBottom: 12, opacity: 0.6, fontSize: 12, letterSpacing: 3, textTransform: "uppercase" }}>
        Fannie Mae
      </div>

      <h1 style={{
        fontSize: "clamp(28px, 5vw, 48px)",
        fontWeight: 700,
        textAlign: "center",
        margin: "0 0 16px",
        lineHeight: 1.2,
        maxWidth: 720,
      }}>
        Agentic AI Property Valuation<br />& Designation Assistant
      </h1>

      <p style={{
        fontSize: 16,
        color: "#93a3bc",
        textAlign: "center",
        maxWidth: 580,
        lineHeight: 1.7,
        margin: "0 0 48px",
      }}>
        An analyst-grade decision-support workstation for property valuation review.
        Ingest documents, aggregate trusted data sources, detect anomalies, and
        explore AI-generated valuation guidance — with full auditability and
        human-review checkpoints built in.
      </p>

      {/* Feature pills */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        justifyContent: "center",
        marginBottom: 56,
        maxWidth: 640,
      }}>
        {[
          "PDF & XML Ingestion",
          "Multi-Source Aggregation",
          "AVM Reconciliation",
          "Anomaly Detection",
          "Knowledge Graph",
          "Chatbot Drill-Down",
          "Audit Trail",
          "Responsible AI",
        ].map((f) => (
          <span key={f} style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 999,
            padding: "5px 14px",
            fontSize: 12,
            color: "#cfd7e5",
          }}>
            {f}
          </span>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={() => navigate("/dashboard")}
        style={{
          background: "#fff",
          color: "#1f4e8a",
          border: "none",
          borderRadius: 8,
          padding: "14px 40px",
          fontSize: 15,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 32px rgba(0,0,0,0.35)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 24px rgba(0,0,0,0.25)";
        }}
      >
        Enter Dashboard →
      </button>

      {/* Disclaimer */}
      <p style={{
        marginTop: 48,
        fontSize: 11,
        color: "rgba(147,163,188,0.6)",
        textAlign: "center",
        maxWidth: 480,
        lineHeight: 1.6,
      }}>
        Decision-support tool only. Not a licensed appraisal, lending decision,
        or regulatory certification. All AI outputs require analyst review before
        use in any regulated process.
      </p>
    </div>
  );
}
