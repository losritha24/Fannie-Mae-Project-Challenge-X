import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { api } from "../api/client";

function PropertyImages({ address }: { address: string }) {
  const [streetErr, setStreetErr] = useState(false);
  const [satErr, setSatErr] = useState(false);
  const enc = encodeURIComponent(address);
  return (
    <div className="card">
      <h2>Property Imagery <span className="badge-src" style={{ marginLeft: 6 }}>Google Maps</span></h2>
      <p className="muted">
        Street View and satellite imagery of the subject property. For reference only — not an appraisal document.
      </p>
      <div className="grid-2">
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Street View</div>
          {streetErr ? (
            <div style={{ height: 220, background: "#f4f7f5", border: "1px solid var(--border)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="muted">No Street View imagery available for this address</span>
            </div>
          ) : (
            <img src={`/api/v1/maps/streetview?address=${enc}`} alt={`Street view of ${address}`}
              onError={() => setStreetErr(true)}
              style={{ width: "100%", borderRadius: 6, border: "1px solid var(--border)", display: "block" }} />
          )}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Satellite View</div>
          {satErr ? (
            <div style={{ height: 220, background: "#f4f7f5", border: "1px solid var(--border)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="muted">Satellite imagery unavailable</span>
            </div>
          ) : (
            <img src={`/api/v1/maps/satellite?address=${enc}`} alt={`Satellite view of ${address}`}
              onError={() => setSatErr(true)}
              style={{ width: "100%", borderRadius: 6, border: "1px solid var(--border)", display: "block" }} />
          )}
        </div>
      </div>
    </div>
  );
}

function sevPill(s: string) {
  return <span className={`pill ${s === "critical" ? "crit" : s === "moderate" ? "warn" : "ok"}`}>{s}</span>;
}

async function exportToPDF(address: string, caseId: string, contentRef: HTMLElement) {
  const { default: jsPDF } = await import("jspdf");
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(contentRef, { scale: 1.5, useCORS: true, backgroundColor: "#f0faf3" });
  const imgData = canvas.toDataURL("image/jpeg", 0.85);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const ratio = canvas.width / canvas.height;
  const imgW = pageW - 20;
  const imgH = imgW / ratio;
  let y = 10;
  pdf.setFontSize(9);
  pdf.setTextColor(100);
  pdf.text(`PropertyInsight AI · ${address} · ${caseId} · Exported ${new Date().toLocaleDateString()}`, 10, y);
  y += 6;
  if (imgH <= pageH - y - 10) {
    pdf.addImage(imgData, "JPEG", 10, y, imgW, imgH);
  } else {
    // Multi-page: slice canvas into A4-height chunks
    const sliceH = Math.floor(canvas.height * (pageH - y - 10) / imgH);
    let srcY = 0;
    while (srcY < canvas.height) {
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = Math.min(sliceH, canvas.height - srcY);
      const ctx = sliceCanvas.getContext("2d")!;
      ctx.drawImage(canvas, 0, srcY, canvas.width, sliceCanvas.height, 0, 0, canvas.width, sliceCanvas.height);
      const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.85);
      const sliceImgH = sliceCanvas.height * imgW / canvas.width;
      pdf.addImage(sliceData, "JPEG", 10, y, imgW, sliceImgH);
      srcY += sliceH;
      if (srcY < canvas.height) { pdf.addPage(); y = 10; }
    }
  }
  pdf.text("Decision-support tool only. Not a licensed appraisal. Analyst review required.", 10, pdf.internal.pageSize.getHeight() - 6);
  pdf.save(`PropertyInsight-${caseId}.pdf`);
}

export default function Workspace() {
  const { id = "CASE-1001" } = useParams();
  const c = useQuery({ queryKey: ["case", id], queryFn: () => api.getCase(id) });
  const val = useQuery({ queryKey: ["val", id], queryFn: () => api.valuation(id) });
  const comps = useQuery({ queryKey: ["comps", id], queryFn: () => api.comparables(id) });
  const anoms = useQuery({ queryKey: ["anoms", id], queryFn: () => api.anomalies(id) });
  const vision = useQuery({ queryKey: ["vis", id], queryFn: () => api.vision(id) });
  const [exporting, setExporting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  async function handleExport() {
    if (!contentRef.current || !c.data) return;
    setExporting(true);
    try { await exportToPDF(c.data.address, c.data.case_id, contentRef.current); }
    finally { setExporting(false); }
  }

  useEffect(() => {
    if (id) fetch(`/api/v1/history/${id}`, { method: "GET" });
    fetch("/api/v1/cases/" + id).catch(() => {});
  }, [id]);

  if (c.isLoading) return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <p className="muted">Loading case…</p>
    </div>
  );
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

  const h = c.data.hypothesis;

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
        <div>
          <h2 style={{ margin: 0 }}>{c.data.address}</h2>
          <div className="muted">Case {c.data.case_id} · Parcel {c.data.parcel_id}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to={`/case/${id}/graph`}><button className="secondary" style={{ fontSize: 13 }}>Knowledge Graph</button></Link>
          <Link to={`/case/${id}/audit`}><button className="secondary" style={{ fontSize: 13 }}>Audit & History</button></Link>
          <button onClick={handleExport} disabled={exporting}
            style={{ background: "#2e7d4a", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", cursor: exporting ? "wait" : "pointer", fontWeight: 600, fontSize: 13 }}>
            {exporting ? "Exporting…" : "Export PDF"}
          </button>
        </div>
      </div>

      <div ref={contentRef}>
      <PropertyImages address={c.data.address} />

      {/* AI Summary */}
      {h && (
        <div className="card">
          <h2>AI Summary</h2>

          {h.thesis && (
            <div style={{ background: "#e8f5ec", border: "1px solid #b0d4bb", borderRadius: 8, padding: "12px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#2e7d4a", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Bottom Line</div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: "#1b1f27" }}>{h.thesis}</div>
            </div>
          )}

          {(h.facts?.length > 0 || h.estimates?.length > 0) && (
            <div className="grid-2" style={{ gap: 10, marginBottom: 14 }}>
              {h.facts?.length > 0 && (
                <div style={{ background: "#f4faf6", borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#5b6472", textTransform: "uppercase", marginBottom: 6 }}>✅ What We Know</div>
                  {h.facts.map((x: string, i: number) => (
                    <div key={i} style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 4, color: "#1b1f27" }}>• {x}</div>
                  ))}
                </div>
              )}
              {h.estimates?.length > 0 && (
                <div style={{ background: "#f4faf6", borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#5b6472", textTransform: "uppercase", marginBottom: 6 }}>📊 Estimated</div>
                  {h.estimates.map((x: string, i: number) => (
                    <div key={i} style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 4, color: "#1b1f27" }}>• {x}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {h.risks?.length > 0 && (
            <div style={{ background: "#fff8e1", border: "1px solid #f5c842", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#b35d00", textTransform: "uppercase", marginBottom: 6 }}>⚠️ Things to Watch</div>
              {h.risks.map((x: string, i: number) => (
                <div key={i} style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 4, color: "#1b1f27" }}>• {x}</div>
              ))}
            </div>
          )}

          {h.confidence_commentary && (
            <div style={{ fontSize: 12, color: "#5b6472", borderTop: "1px solid var(--border)", paddingTop: 10, marginBottom: 10 }}>
              🎯 {h.confidence_commentary}
            </div>
          )}

          {h.suggested_next_actions?.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#5b6472", textTransform: "uppercase", marginBottom: 6 }}>Recommended Next Steps</div>
              {h.suggested_next_actions.map((x: string, i: number) => (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: 8,
                  fontSize: 12, lineHeight: 1.5, marginBottom: 6,
                  background: "#f4faf6", borderRadius: 6, padding: "6px 10px",
                }}>
                  <span style={{ color: "#2e7d4a", fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                  {x}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Valuation Guidance Range</h2>
          {val.data && (
            <>
              <div style={{ fontSize: 28, fontWeight: 600 }}>
                ${val.data.floor_value.toLocaleString()} – ${val.data.ceiling_value.toLocaleString()}
              </div>
              <div className="muted">
                Weighted estimate ${val.data.weighted_estimate.toLocaleString()} · Confidence {(val.data.overall_confidence * 100).toFixed(0)}%
              </div>
              <p className="muted" style={{ marginTop: 10 }}>
                The model blends comparables, FHFA house-price trend, and AVM vendor data to produce a guidance range. Conflicting factors widen the band.
              </p>
              {val.data.contributing_factors?.length > 0 && (
                <>
                  <h3 style={{ fontSize: 13 }}>Contributing factors</h3>
                  <ul>{val.data.contributing_factors.map((x: string) => <li key={x}>{x}</li>)}</ul>
                </>
              )}
              {val.data.conflicting_factors?.length > 0 && (
                <>
                  <h3 style={{ fontSize: 13 }}>Conflicting factors</h3>
                  <ul>{val.data.conflicting_factors.map((x: string) => <li key={x}>{x}</li>)}</ul>
                </>
              )}
              {(val.data.data_quality_notes?.length > 0 || val.data.missing_data_impact?.length > 0) && (
                <>
                  <h3 style={{ fontSize: 13 }}>Data quality notes</h3>
                  <ul>{(val.data.data_quality_notes ?? val.data.missing_data_impact ?? []).map((x: string) => <li key={x}>{x}</li>)}</ul>
                </>
              )}
              <div className="muted">
                Model {val.data.model_version} · Prompt {val.data.prompt_version} · Data {val.data.data_version}
              </div>
            </>
          )}
        </div>

        <div className="card">
          <h2>Anomalies — Human Review</h2>
          <table>
            <thead>
              <tr>
                <th>Severity</th>
                <th>Category</th>
                <th>Description</th>
                <th>Evidence</th>
                <th>Review Required</th>
              </tr>
            </thead>
            <tbody>
              {anoms.data?.map((a: any) => (
                <tr key={a.anomaly_id}>
                  <td>{sevPill(a.severity)}</td>
                  <td><strong>{a.category.replace(/_/g, " ")}</strong></td>
                  <td>{a.description}</td>
                  <td className="muted" style={{ fontSize: 11 }}>{(a.evidence ?? []).join(" · ")}</td>
                  <td>{a.requires_review
                    ? <span className="pill warn">Yes</span>
                    : <span className="pill ok">No</span>}
                  </td>
                </tr>
              ))}
              {!anoms.data?.length && (
                <tr><td colSpan={5} className="muted">No anomalies detected.</td></tr>
              )}
            </tbody>
          </table>
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
                <td>{(x.similarity_score * 100).toFixed(0)}%</td>
                <td>{(x.reliability_score * 100).toFixed(0)}%</td>
                <td><span className="badge-src">{x.provenance?.source_name ?? "—"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Computer Vision & Condition Findings</h2>
        {vision.data?.map((v: any) => (
          <div key={v.finding_id} style={{ marginBottom: 10 }}>
            <strong>{v.finding}</strong> · <span className="pill">conf {(v.confidence * 100).toFixed(0)}%</span>
            <div className="muted">{v.explanation}</div>
            <div className="cite">Limitations: {v.limitations}</div>
          </div>
        ))}
        {!vision.data?.length && <p className="muted">No condition findings available.</p>}
      </div>
      </div>
    </>
  );
}
