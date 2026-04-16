import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
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

export default function Workspace() {
  const { id = "CASE-1001" } = useParams();
  const c = useQuery({ queryKey: ["case", id], queryFn: () => api.getCase(id) });
  const val = useQuery({ queryKey: ["val", id], queryFn: () => api.valuation(id) });
  const comps = useQuery({ queryKey: ["comps", id], queryFn: () => api.comparables(id) });
  const anoms = useQuery({ queryKey: ["anoms", id], queryFn: () => api.anomalies(id) });
  const vision = useQuery({ queryKey: ["vis", id], queryFn: () => api.vision(id) });

  useEffect(() => {
    if (id) fetch(`/api/v1/history/${id}`, { method: "GET" });
    fetch("/api/v1/cases/" + id).catch(() => {});
  }, [id]);

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

      <PropertyImages address={c.data.address} />

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
              <h3 style={{ fontSize: 13 }}>Contributing factors</h3>
              <ul>{val.data.contributing_factors.map((x: string) => <li key={x}>{x}</li>)}</ul>
              <h3 style={{ fontSize: 13 }}>Conflicting factors</h3>
              <ul>{val.data.conflicting_factors.map((x: string) => <li key={x}>{x}</li>)}</ul>
              {val.data.data_quality_notes?.length > 0 && (
                <>
                  <h3 style={{ fontSize: 13 }}>Data quality notes</h3>
                  <ul>{val.data.data_quality_notes.map((x: string) => <li key={x}>{x}</li>)}</ul>
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
                  <td className="muted" style={{ fontSize: 11 }}>{a.evidence.join(" · ")}</td>
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
                <td><span className="badge-src">{x.provenance.source_name}</span></td>
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
    </>
  );
}
