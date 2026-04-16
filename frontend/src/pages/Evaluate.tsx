import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../api/client";

function PropertyImages({ address }: { address: string }) {
  const [streetErr, setStreetErr] = useState(false);
  const [satErr, setSatErr] = useState(false);
  const enc = encodeURIComponent(address);
  const streetUrl = `/api/v1/maps/streetview?address=${enc}`;
  const satUrl    = `/api/v1/maps/satellite?address=${enc}`;

  return (
    <div className="card">
      <h2>Property Imagery <span className="badge-src" style={{ marginLeft: 6 }}>Google Maps</span></h2>
      <p className="muted">
        Street View and satellite imagery of the subject property. Sourced from Google Maps —
        for reference only, not an appraisal document.
      </p>
      <div className="grid-2">
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Street View</div>
          {streetErr ? (
            <div style={{ height: 220, background: "#f7f8fa", border: "1px solid var(--border)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="muted">No Street View imagery available for this address</span>
            </div>
          ) : (
            <img src={streetUrl} alt={`Street view of ${address}`}
              onError={() => setStreetErr(true)}
              style={{ width: "100%", borderRadius: 6, border: "1px solid var(--border)", display: "block" }} />
          )}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Satellite View</div>
          {satErr ? (
            <div style={{ height: 220, background: "#f7f8fa", border: "1px solid var(--border)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="muted">Satellite imagery unavailable</span>
            </div>
          ) : (
            <img src={satUrl} alt={`Satellite view of ${address}`}
              onError={() => setSatErr(true)}
              style={{ width: "100%", borderRadius: 6, border: "1px solid var(--border)", display: "block" }} />
          )}
        </div>
      </div>
    </div>
  );
}

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];

type EvalResult = any;

export default function Evaluate() {
  const location = useLocation();
  const prefill = (location.state as any)?.prefill ?? "";
  const [form, setForm] = useState({
    address_line: prefill || "123 Maple Street",
    city: "Austin",
    state: "TX",
    zip_code: "78701",
    parcel_id: "",
    notes: "",
  });
  const [result, setResult] = useState<EvalResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const upd = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true); setResult(null);
    try {
      const r = await api.evaluate(form);
      setResult(r);
    } catch (ex: any) {
      setErr(ex.message || "Evaluation failed");
    } finally {
      setBusy(false);
    }
  };

  const v = result?.valuation;
  const h = result?.hypothesis;

  return (
    <>
      <h2>New Property Evaluation</h2>
      <p className="muted">
        Enter a U.S. home address to generate a decision-support valuation range and
        hypothesis. The output includes source provenance, confidence, anomalies, comparables,
        and plain-language rationale. Not a licensed appraisal.
      </p>

      <form className="card" onSubmit={submit} aria-label="Property evaluation form">
        <div className="grid-2">
          <div>
            <label>Street address <span aria-hidden="true">*</span></label>
            <input required value={form.address_line} onChange={upd("address_line")} />
          </div>
          <div>
            <label>City <span aria-hidden="true">*</span></label>
            <input required value={form.city} onChange={upd("city")} />
          </div>
        </div>
        <div className="grid-3" style={{ marginTop: 10 }}>
          <div>
            <label>State <span aria-hidden="true">*</span></label>
            <select required value={form.state} onChange={upd("state")}>
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label>ZIP code <span aria-hidden="true">*</span></label>
            <input required pattern="\d{5}(-\d{4})?" value={form.zip_code} onChange={upd("zip_code")} />
          </div>
          <div>
            <label>Parcel ID <span className="muted">(optional)</span></label>
            <input value={form.parcel_id} onChange={upd("parcel_id")} />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <label>Case notes <span className="muted">(optional)</span></label>
          <textarea rows={2} value={form.notes} onChange={upd("notes")} />
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
          <button type="submit" disabled={busy}>{busy ? "Evaluating…" : "Evaluate Property"}</button>
          <button type="button" className="secondary" onClick={() => setResult(null)} disabled={!result}>Clear</button>
        </div>
        {err && <p style={{ color: "var(--crit)" }}>{err}</p>}
      </form>

      {result && (
        <>
          <div className="card">
            <h2>
              Valuation Guidance
              <span className="pill" style={{ marginLeft: 8 }}>
                engine: {result.engine}
              </span>
            </h2>
            <div style={{ fontSize: 28, fontWeight: 600 }}>
              ${v.floor_value.toLocaleString()} – ${v.ceiling_value.toLocaleString()}
            </div>
            <div className="muted">
              Weighted mid ${v.weighted_estimate.toLocaleString()} · Median ${v.median_value.toLocaleString()} ·
              Confidence band ${v.confidence_band_low.toLocaleString()} – ${v.confidence_band_high.toLocaleString()} ·
              Overall confidence {(v.overall_confidence*100).toFixed(0)}%
            </div>
            <p className="muted" style={{ marginTop: 10 }}>
              Summary: the band blends County Assessor facts, Multiple Listing Service (MLS) facts, and comparable sales
              from Zillow, Redfin, and HouseCanary. Reliability weighting favors public and licensed sources.
              Conflicting signals and missing data widen the band.
            </p>
            <div className="muted">
              Model {v.model_version} · Prompt {v.prompt_version} · Data {v.data_version}
            </div>
          </div>

          <PropertyImages address={result.address} />

          <div className="grid-2">
            <div className="card">
              <h2>Hypothesis &amp; Rationale</h2>
              <p><strong>Thesis.</strong> {h.thesis}</p>
              <h3 style={{ fontSize: 13 }}>Facts</h3>
              <ul>{h.facts.map((x: string) => <li key={x}>{x}</li>)}</ul>
              <h3 style={{ fontSize: 13 }}>Estimates (model-derived)</h3>
              <ul>{h.estimates.map((x: string) => <li key={x}>{x}</li>)}</ul>
              <h3 style={{ fontSize: 13 }}>Assumptions</h3>
              <ul>{h.assumptions.map((x: string) => <li key={x}>{x}</li>)}</ul>
              <h3 style={{ fontSize: 13 }}>Risks &amp; data gaps</h3>
              <ul>{h.risks.map((x: string) => <li key={x}>{x}</li>)}</ul>
              <h3 style={{ fontSize: 13 }}>Rationale</h3>
              <p>{h.rationale}</p>
              {h.confidence_commentary && (
                <>
                  <h3 style={{ fontSize: 13 }}>Confidence commentary</h3>
                  <p>{h.confidence_commentary}</p>
                </>
              )}
              <h3 style={{ fontSize: 13 }}>Suggested next actions</h3>
              <ul>{h.suggested_next_actions.map((x: string) => <li key={x}>{x}</li>)}</ul>
            </div>

            <div className="card">
              <h2>Property Facts (with source)</h2>
              <table>
                <thead><tr><th>Field</th><th>Value</th><th>Source</th><th>Conf.</th></tr></thead>
                <tbody>
                  {Object.entries(result.property_facts).map(([k, f]: any) => (
                    <tr key={k}>
                      <td>{k}</td>
                      <td>{String(f.normalized_value)}</td>
                      <td><span className="badge-src">{f.provenance.source_name}</span></td>
                      <td>{(f.confidence*100).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3 style={{ fontSize: 13, marginTop: 14 }}>Contributing factors</h3>
              <ul>{v.contributing_factors.map((x: string) => <li key={x}>{x}</li>)}</ul>
              <h3 style={{ fontSize: 13 }}>Conflicting factors</h3>
              <ul>{v.conflicting_factors.length ? v.conflicting_factors.map((x: string) => <li key={x}>{x}</li>) : <li className="muted">None detected</li>}</ul>
              <h3 style={{ fontSize: 13 }}>Missing data impact</h3>
              <ul>{v.missing_data_impact.map((x: string) => <li key={x}>{x}</li>)}</ul>
            </div>
          </div>

          <div className="card">
            <h2>AVM Vendor Comparison</h2>
            <p className="muted">
              Automated Valuation Model (AVM) estimates from multiple vendors. Floor/ceiling of the
              aligned range comes from the lowest vendor low and highest vendor high.
            </p>
            <table>
              <thead>
                <tr><th>Vendor</th><th>Estimate</th><th>Low</th><th>High</th><th>Confidence</th><th>Freshness</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {(result.avm_vendors || []).map((v: any) => (
                  <tr key={v.vendor}>
                    <td><strong>{v.vendor}</strong></td>
                    <td>${Number(v.estimate).toLocaleString()}</td>
                    <td>${Number(v.low).toLocaleString()}</td>
                    <td>${Number(v.high).toLocaleString()}</td>
                    <td>{(v.confidence*100).toFixed(0)}%</td>
                    <td>{v.as_of_days}d</td>
                    <td className="muted">{v.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>Key Datapoint Alignment</h2>
            <p className="muted">
              Same field reported by different sources (Appraisal, Broker Price Opinion, MLS,
              HouseCanary, Redfin, Zillow, Computer Vision). Conflicts are routed to analyst review.
            </p>
            {(result.alignment || []).map((row: any) => (
              <div key={row.field} style={{ marginBottom: 14 }}>
                <div>
                  <strong>{row.field}</strong>{" "}
                  <span className={`pill ${row.alignment === "conflict" ? "crit" : row.alignment === "minor_variance" ? "warn" : "ok"}`}>
                    {row.alignment}
                  </span>
                </div>
                <div className="muted" style={{ marginBottom: 4 }}>{row.commentary}</div>
                <table>
                  <thead><tr><th>Source</th><th>Value</th></tr></thead>
                  <tbody>
                    {(row.values_by_source || []).map((v: any, i: number) => (
                      <tr key={i}>
                        <td><span className="badge-src">{v.source}</span></td>
                        <td>{String(v.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          <div className="card">
            <h2>Comparable Sales</h2>
            <table>
              <thead>
                <tr>
                  <th>Address</th><th>Dist (mi)</th><th>Sale $</th>
                  <th>Sqft</th><th>Similarity</th><th>Reliability</th><th>Source</th>
                </tr>
              </thead>
              <tbody>
                {result.comparables.map((x: any) => (
                  <tr key={x.comp_id}>
                    <td>{x.address}</td>
                    <td>{x.distance_miles}</td>
                    <td>${Number(x.sale_price).toLocaleString()}</td>
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
            <h2>Anomalies</h2>
            {result.anomalies.length === 0 && <p className="muted">No anomalies detected.</p>}
            {result.anomalies.map((a: any) => (
              <div key={a.anomaly_id} style={{ marginBottom: 8 }}>
                <span className={`pill ${a.severity === "critical" ? "crit" : a.severity === "moderate" ? "warn" : "ok"}`}>{a.severity}</span>
                <strong> {a.category}</strong>
                <div className="muted">{a.description}</div>
                <div className="cite">Evidence: {a.evidence.join(" · ")}</div>
                {a.recommended_action && <div className="cite">Recommended action: {a.recommended_action}</div>}
              </div>
            ))}
          </div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>Case {result.case_id}</strong> created. Continue in the workspace to upload
                documents, run the agent chatbot, and view the knowledge graph.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Link to={`/case/${result.case_id}`}><button>Open Workspace</button></Link>
                <Link to={`/case/${result.case_id}/graph`}><button className="secondary">Graph</button></Link>
                <Link to={`/case/${result.case_id}/audit`}><button className="secondary">Audit</button></Link>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
