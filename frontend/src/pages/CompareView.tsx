import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#a5222f",
  moderate: "#b35d00",
  informational: "#2e7d4a",
};

function sevPill(s: string) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
      background: s === "critical" ? "#fde7ea" : s === "moderate" ? "#fff3e0" : "#e8f5e9",
      color: SEVERITY_COLOR[s] ?? "#5b6472",
    }}>{s}</span>
  );
}

function ConfBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ height: 6, background: "#e0ede5", borderRadius: 999, overflow: "hidden", marginTop: 4 }}>
      <div style={{ height: "100%", width: `${value}%`, background: color, borderRadius: 999, transition: "width 0.4s ease" }} />
    </div>
  );
}

function confColor(pct: number) {
  if (pct >= 75) return "#2e7d4a";
  if (pct >= 50) return "#b35d00";
  return "#a5222f";
}

function CaseColumn({ caseId }: { caseId: string }) {
  const c = useQuery({ queryKey: ["case", caseId], queryFn: () => api.getCase(caseId), enabled: !!caseId });
  const val = useQuery({ queryKey: ["val", caseId], queryFn: () => api.valuation(caseId), enabled: !!caseId });
  const comps = useQuery({ queryKey: ["comps", caseId], queryFn: () => api.comparables(caseId), enabled: !!caseId });
  const anoms = useQuery({ queryKey: ["anoms", caseId], queryFn: () => api.anomalies(caseId), enabled: !!caseId });

  if (c.isLoading || val.isLoading) {
    return <div style={{ flex: 1, minWidth: 0 }}><div className="card"><p className="muted">Loading {caseId}…</p></div></div>;
  }
  if (c.isError || !c.data) {
    return <div style={{ flex: 1, minWidth: 0 }}><div className="card"><p className="muted">Case not found.</p></div></div>;
  }

  const confPct = val.data ? Math.round(val.data.overall_confidence * 100) : 0;

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header */}
      <div className="card" style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{c.data.address}</div>
        <div className="muted" style={{ fontSize: 11 }}>{c.data.case_id} · Parcel {c.data.parcel_id ?? "—"}</div>
        <Link to={`/case/${caseId}`} style={{ fontSize: 12, marginTop: 6, display: "inline-block" }}>Open full workspace →</Link>
      </div>

      {/* Valuation */}
      <div className="card" style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#5b6472", textTransform: "uppercase", marginBottom: 8 }}>Valuation Range</div>
        {val.data ? (
          <>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1b1f27" }}>
              ${val.data.floor_value.toLocaleString()} – ${val.data.ceiling_value.toLocaleString()}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              Estimate: ${val.data.weighted_estimate.toLocaleString()}
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#5b6472" }}>
                <span>Confidence</span>
                <span style={{ color: confColor(confPct), fontWeight: 700 }}>{confPct}%</span>
              </div>
              <ConfBar value={confPct} color={confColor(confPct)} />
            </div>
          </>
        ) : <p className="muted">No valuation data.</p>}
      </div>

      {/* Anomalies */}
      <div className="card" style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#5b6472", textTransform: "uppercase", marginBottom: 8 }}>
          Anomalies ({anoms.data?.length ?? 0})
        </div>
        {anoms.data?.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {anoms.data.map((a: any) => (
              <div key={a.anomaly_id} style={{
                fontSize: 12, padding: "6px 10px", borderRadius: 6,
                background: "#f4f7f5", borderLeft: `3px solid ${SEVERITY_COLOR[a.severity] ?? "#ccc"}`,
              }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
                  {sevPill(a.severity)}
                  <strong style={{ fontSize: 12 }}>{a.category.replace(/_/g, " ")}</strong>
                </div>
                <div className="muted" style={{ fontSize: 11 }}>{a.description}</div>
              </div>
            ))}
          </div>
        ) : <p className="muted" style={{ fontSize: 12 }}>No anomalies detected.</p>}
      </div>

      {/* Top 3 Comps */}
      <div className="card" style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#5b6472", textTransform: "uppercase", marginBottom: 8 }}>Top Comparables</div>
        {comps.data?.length ? (
          comps.data.slice(0, 3).map((x: any) => (
            <div key={x.comp_id} style={{ fontSize: 12, marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{x.address}</div>
              <div className="muted">
                ${x.sale_price?.toLocaleString() ?? "—"} · {x.distance_miles} mi · {Math.round(x.similarity_score * 100)}% similar
              </div>
            </div>
          ))
        ) : <p className="muted" style={{ fontSize: 12 }}>No comparables.</p>}
      </div>

      {/* AI Summary thesis */}
      {c.data.hypothesis?.thesis && (
        <div className="card" style={{ padding: "14px 16px", background: "#e8f5ec", border: "1px solid #b0d4bb" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#2e7d4a", textTransform: "uppercase", marginBottom: 4 }}>AI Bottom Line</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: "#1b1f27" }}>{c.data.hypothesis.thesis}</div>
        </div>
      )}
    </div>
  );
}

export default function CompareView() {
  const cases = useQuery({ queryKey: ["cases"], queryFn: api.listCases, refetchInterval: 10000 });
  const [selected, setSelected] = useState<string[]>(["", ""]);

  function setSlot(i: number, val: string) {
    setSelected(prev => { const next = [...prev]; next[i] = val; return next; });
  }

  function addSlot() {
    if (selected.length < 3) setSelected(prev => [...prev, ""]);
  }

  function removeSlot(i: number) {
    setSelected(prev => prev.filter((_, idx) => idx !== i));
  }

  const activeCols = selected.filter(s => s !== "");

  return (
    <>
      <h2>Case Comparison</h2>
      <p className="muted">Select up to 3 cases to compare valuation ranges, anomalies, and comparables side-by-side.</p>

      {/* Case pickers */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {selected.map((val, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <select
                value={val}
                onChange={e => setSlot(i, e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13, background: "#fff", minWidth: 240 }}
              >
                <option value="">— Select case {i + 1} —</option>
                {cases.data?.map((c: any) => (
                  <option key={c.case_id} value={c.case_id} disabled={selected.includes(c.case_id) && selected[i] !== c.case_id}>
                    {c.case_id} · {c.address}
                  </option>
                ))}
              </select>
              {selected.length > 2 && (
                <button onClick={() => removeSlot(i)}
                  style={{ background: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "4px 8px", cursor: "pointer", color: "#a5222f", fontSize: 13 }}>
                  ✕
                </button>
              )}
            </div>
          ))}
          {selected.length < 3 && (
            <button onClick={addSlot}
              style={{ padding: "6px 14px", borderRadius: 6, border: "1px dashed #2e7d4a", background: "transparent", color: "#2e7d4a", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
              + Add Case
            </button>
          )}
        </div>
        {cases.isLoading && <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>Loading cases…</p>}
        {!cases.isLoading && !cases.data?.length && (
          <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>No cases yet. <Link to="/evaluate">Run a new evaluation</Link> first.</p>
        )}
      </div>

      {/* Comparison columns */}
      {activeCols.length > 0 && (
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          {selected.map((caseId, i) =>
            caseId ? <CaseColumn key={`${caseId}-${i}`} caseId={caseId} /> : null
          )}
        </div>
      )}

      {activeCols.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "#5b6472" }}>
          Select at least one case above to begin comparing.
        </div>
      )}
    </>
  );
}
