import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";

function sevPill(s: string) {
  return <span className={`pill ${s === "critical" ? "crit" : s === "moderate" ? "warn" : "ok"}`}>{s}</span>;
}

export default function Workspace() {
  const { id = "CASE-1001" } = useParams();
  const c = useQuery({ queryKey: ["case", id], queryFn: () => api.getCase(id) });
  const val = useQuery({ queryKey: ["val", id], queryFn: () => api.valuation(id) });
  const comps = useQuery({ queryKey: ["comps", id], queryFn: () => api.comparables(id) });
  const anoms = useQuery({ queryKey: ["anoms", id], queryFn: () => api.anomalies(id) });
  const vision = useQuery({ queryKey: ["vis", id], queryFn: () => api.vision(id) });

  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    if (!q.trim() || busy) return;
    const question = q;
    setMsgs((m) => [...m, { role: "user", content: question }]);
    setQ("");
    setBusy(true);
    try {
      const r = await api.chat(id, question);
      setMsgs((m) => [...m, { role: "assistant", ...r }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "assistant", direct_answer: `Error: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  if (c.isLoading) return <p>Loading…</p>;
  if (c.isError || !c.data) {
    return (
      <div className="card">
        <h2>Case not available</h2>
        <p className="muted">
          Case <code>{id}</code> is not loaded in the current backend session. The in-memory
          store resets on restart. Create a fresh evaluation to continue.
        </p>
        <Link to="/evaluate"><button>Start New Evaluation</button></Link>
      </div>
    );
  }

  return (
    <>
      <h2>{c.data.address}</h2>
      <div className="muted">Case {c.data.case_id} · Parcel {c.data.parcel_id}</div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Valuation Guidance Range</h2>
          {val.data && (
            <>
              <div style={{ fontSize: 28, fontWeight: 600 }}>
                ${val.data.floor_value.toLocaleString()} – ${val.data.ceiling_value.toLocaleString()}
              </div>
              <div className="muted">
                Weighted estimate ${val.data.weighted_estimate.toLocaleString()} · Confidence {(val.data.overall_confidence*100).toFixed(0)}%
              </div>
              <p className="muted" style={{ marginTop: 10 }}>
                This chart summary: the model blends comparables, the FHFA house-price trend, and
                document-extracted facts to produce a guidance range. Conflicting factors widen the band.
              </p>
              <h3 style={{ fontSize: 13 }}>Contributing factors</h3>
              <ul>{val.data.contributing_factors.map((x: string) => <li key={x}>{x}</li>)}</ul>
              <h3 style={{ fontSize: 13 }}>Conflicting factors</h3>
              <ul>{val.data.conflicting_factors.map((x: string) => <li key={x}>{x}</li>)}</ul>
              <h3 style={{ fontSize: 13 }}>Missing data impact</h3>
              <ul>{val.data.missing_data_impact.map((x: string) => <li key={x}>{x}</li>)}</ul>
              <div className="muted">
                Model {val.data.model_version} · Prompt {val.data.prompt_version} · Data {val.data.data_version}
              </div>
            </>
          )}
        </div>

        <div className="card">
          <h2>Anomalies — Human Review</h2>
          {anoms.data?.map((a: any) => (
            <div key={a.anomaly_id} style={{ marginBottom: 10 }}>
              {sevPill(a.severity)} <strong>{a.category}</strong>
              <div className="muted">{a.description}</div>
              <div className="cite">Evidence: {a.evidence.join(" · ")}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Comparable Properties</h2>
        <table>
          <thead>
            <tr>
              <th>Address</th><th>Dist (mi)</th><th>Sale $</th>
              <th>Sqft</th><th>Similarity</th><th>Reliability</th><th>Source</th>
            </tr>
          </thead>
          <tbody>
            {comps.data?.map((x: any) => (
              <tr key={x.comp_id}>
                <td>{x.address}</td>
                <td>{x.distance_miles}</td>
                <td>${x.sale_price?.toLocaleString()}</td>
                <td>{x.square_feet}</td>
                <td>{(x.similarity_score*100).toFixed(0)}%</td>
                <td>{(x.reliability_score*100).toFixed(0)}%</td>
                <td><span className="badge-src">{x.provenance.source_name}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Computer Vision Findings</h2>
        {vision.data?.map((v: any) => (
          <div key={v.finding_id} style={{ marginBottom: 10 }}>
            <strong>{v.finding}</strong> · <span className="pill">conf {(v.confidence*100).toFixed(0)}%</span>
            <div className="muted">{v.explanation}</div>
            <div className="cite">Limitations: {v.limitations}</div>
          </div>
        ))}
      </div>

      <div className="card" role="region" aria-label="Chatbot drill-down">
        <h2>Evidence-Grounded Chatbot</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Ask anything about this property, its comparables, anomalies, AVM vendors, documents,
          or valuation methodology. Every question is answered by the LLM with the full case
          context injected, and answers are cited back to case fields.
        </p>
        <div style={{ maxHeight: 320, overflow: "auto", margin: "10px 0" }}>
          {msgs.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}>
              {m.role === "user" ? m.content : (
                <>
                  <strong>{m.classification && <span className="pill">{m.classification}</span>} </strong>
                  {m.direct_answer}
                  {m.supporting_evidence?.map((c: any, j: number) => (
                    <span key={j} className="cite">→ {c.source_name} ({c.source_ref}): {c.excerpt}</span>
                  ))}
                  {m.data_gaps?.length ? <span className="cite">Gaps: {m.data_gaps.join("; ")}</span> : null}
                  {m.suggested_next_action && <span className="cite">Next: {m.suggested_next_action}</span>}
                </>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder='Ask anything — e.g. "Why is the estimated range so wide?"'
            onKeyDown={(e) => e.key === "Enter" && ask()}
            disabled={busy}
            aria-label="Ask the assistant"
          />
          <button onClick={ask} disabled={busy}>{busy ? "Thinking…" : "Ask"}</button>
        </div>
      </div>
    </>
  );
}
