import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

export default function Cases() {
  const navigate = useNavigate();
  const cases = useQuery({ queryKey: ["cases"], queryFn: api.listCases, refetchInterval: 5000 });

  return (
    <>
      <h2>Property Workspace</h2>
      <p className="muted">
        Select a case below to open its full analysis — valuation range, imagery, anomalies,
        comparables, knowledge graph, and chatbot.
      </p>

      {cases.isLoading && <p>Loading cases…</p>}

      {cases.data?.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <p className="muted">No cases yet.</p>
          <button onClick={() => navigate("/evaluate")}>Start New Evaluation</button>
        </div>
      )}

      {cases.data && cases.data.length > 0 && (
        <div>
          {cases.data.map((c: any) => (
            <div key={c.case_id} className="card" style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              cursor: "pointer", transition: "box-shadow 0.15s",
            }}
              onClick={() => navigate(`/case/${c.case_id}`)}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)")}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = "")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: "#e8f5e9", border: "2px solid #2e7d4a",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, flexShrink: 0,
                }}>🏠</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{c.address}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{c.case_id}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "#5b6472" }}>Anomalies</div>
                  <span className={`pill ${c.anomaly_count > 0 ? "warn" : "ok"}`} style={{ fontSize: 13, fontWeight: 700 }}>
                    {c.anomaly_count}
                  </span>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "#5b6472" }}>Confidence</div>
                  <span className="pill ok" style={{ fontSize: 13, fontWeight: 700 }}>
                    {(c.overall_confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <button onClick={e => { e.stopPropagation(); navigate(`/case/${c.case_id}`); }}>
                  Open →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <button className="secondary" onClick={() => navigate("/evaluate")}>
          + New Evaluation
        </button>
      </div>
    </>
  );
}
