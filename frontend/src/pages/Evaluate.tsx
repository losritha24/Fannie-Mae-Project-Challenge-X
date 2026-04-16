import { useState, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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

const SOURCE_TYPE_COLOR: Record<string, string> = {
  public: "#1565c0",
  licensed: "#6a1b9a",
  market_signal: "#e65100",
};

export default function Evaluate() {
  const location = useLocation();
  const prefill = (location.state as any)?.prefill ?? "";
  const sourcesQuery = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  const allSources: any[] = sourcesQuery.data ?? [];

  const [form, setForm] = useState({
    address_line: prefill || "123 Maple Street",
    city: "Austin",
    state: "TX",
    zip_code: "78701",
    parcel_id: "",
    notes: "",
  });
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [sourcesInitialized, setSourcesInitialized] = useState(false);

  // Initialize all sources as selected once loaded
  if (allSources.length > 0 && !sourcesInitialized) {
    setSelectedSources(new Set(allSources.map((s: any) => s.name)));
    setSourcesInitialized(true);
  }

  const toggleSource = (name: string) => {
    setSelectedSources(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const [result, setResult] = useState<EvalResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Valuation docs (PDF/XML) — shown after evaluation
  const [files, setFiles] = useState<File[]>([]);
  const [docResults, setDocResults] = useState<any[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Property images — in the form
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imgDragOver, setImgDragOver] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const addImages = (incoming: File[]) => {
    const valid = incoming.filter(f => f.type.startsWith("image/"));
    setImages(prev => [...prev, ...valid]);
    valid.forEach(f => {
      const url = URL.createObjectURL(f);
      setImagePreviews(prev => [...prev, url]);
    });
  };

  const removeImage = (i: number) => {
    URL.revokeObjectURL(imagePreviews[i]);
    setImages(prev => prev.filter((_, idx) => idx !== i));
    setImagePreviews(prev => prev.filter((_, idx) => idx !== i));
  };

  const upd = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true); setResult(null); setDocResults([]); setFiles([]);
    try {
      const payload = { ...form, selected_sources: Array.from(selectedSources) };
      const r = await api.evaluate(payload);
      setResult(r);
      // Auto-upload queued property images
      if (images.length > 0) {
        for (const img of images) {
          try { await api.uploadImage(r.case_id, img); } catch { /* non-fatal */ }
        }
      }
    } catch (ex: any) {
      setErr(ex.message || "Evaluation failed");
    } finally {
      setBusy(false);
    }
  };

  const analyzeDocuments = async () => {
    if (!result || files.length === 0) return;
    setUploadBusy(true);
    const results: any[] = [];
    for (const f of files) {
      try {
        const dr = await api.uploadDocument(result.case_id, f);
        results.push({ filename: f.name, ...dr });
      } catch (ex: any) {
        results.push({ filename: f.name, error: ex.message });
      }
    }
    setDocResults(results);
    setUploadBusy(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter(f =>
      f.name.toLowerCase().endsWith(".pdf") || f.name.toLowerCase().endsWith(".xml")
    );
    setFiles(prev => [...prev, ...dropped]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    setFiles(prev => [...prev, ...picked]);
    e.target.value = "";
  };

  const removeFile = (i: number) => setFiles(prev => prev.filter((_, idx) => idx !== i));

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
        {/* Data source selection */}
        <div style={{ marginTop: 16 }}>
          <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>
            Data Sources
            <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>
              ({selectedSources.size} of {allSources.length} selected)
            </span>
          </label>
          <p className="muted" style={{ marginBottom: 8, marginTop: 0 }}>
            Select which sources to include in the valuation. Deselect any you want excluded.
          </p>
          {sourcesQuery.isLoading ? (
            <span className="muted">Loading sources…</span>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {allSources.map((src: any) => {
                const on = selectedSources.has(src.name);
                const color = SOURCE_TYPE_COLOR[src.type] ?? "#2e7d4a";
                return (
                  <button
                    key={src.name}
                    type="button"
                    onClick={() => toggleSource(src.name)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "5px 12px", borderRadius: 999, fontSize: 12,
                      border: `1.5px solid ${color}`,
                      background: on ? color : "#fff",
                      color: on ? "#fff" : color,
                      cursor: "pointer", fontWeight: 600,
                      transition: "all 0.15s",
                    }}
                  >
                    {on ? "✓ " : ""}{src.name}
                    <span style={{
                      fontSize: 10, opacity: 0.75,
                      background: on ? "rgba(255,255,255,0.2)" : `${color}22`,
                      padding: "1px 5px", borderRadius: 4,
                    }}>
                      {(src.reliability * 100).toFixed(0)}%
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {allSources.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button type="button" className="secondary" style={{ fontSize: 11, padding: "3px 10px" }}
                onClick={() => setSelectedSources(new Set(allSources.map((s: any) => s.name)))}>
                Select all
              </button>
              <button type="button" className="secondary" style={{ fontSize: 11, padding: "3px 10px" }}
                onClick={() => setSelectedSources(new Set())}>
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Property image upload */}
        <div style={{ marginTop: 16 }}>
          <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>
            Property Images <span className="muted" style={{ fontWeight: 400 }}>(optional — JPG, PNG, WEBP)</span>
          </label>
          <p className="muted" style={{ marginBottom: 8, marginTop: 0 }}>
            Upload exterior or interior photos to support condition analysis.
          </p>
          <div
            onDragOver={e => { e.preventDefault(); setImgDragOver(true); }}
            onDragLeave={() => setImgDragOver(false)}
            onDrop={e => { e.preventDefault(); setImgDragOver(false); addImages(Array.from(e.dataTransfer.files)); }}
            onClick={() => imageInputRef.current?.click()}
            style={{
              border: `2px dashed ${imgDragOver ? "#2e7d4a" : "#b0c4b8"}`,
              borderRadius: 8, padding: "16px", textAlign: "center",
              cursor: "pointer", background: imgDragOver ? "#e8f5ec" : "#f4faf6",
              transition: "all 0.15s",
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 4 }}>🖼️</div>
            <div style={{ fontSize: 13, color: "#5b6472" }}>
              Drag & drop images, or <span style={{ color: "#2e7d4a", fontWeight: 600 }}>click to browse</span>
            </div>
            <input ref={imageInputRef} type="file" multiple accept="image/*"
              style={{ display: "none" }}
              onChange={e => { addImages(Array.from(e.target.files || [])); e.target.value = ""; }} />
          </div>

          {images.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {images.map((img, i) => (
                <div key={i} style={{ position: "relative", width: 80, height: 80 }}>
                  <img src={imagePreviews[i]} alt={img.name}
                    style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 6, border: "1px solid #b0c4b8", display: "block" }} />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    style={{
                      position: "absolute", top: -6, right: -6,
                      background: "#a5222f", color: "#fff",
                      border: "none", borderRadius: "50%",
                      width: 18, height: 18, fontSize: 11, lineHeight: "18px",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      padding: 0,
                    }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
          <button type="submit" disabled={busy}>
            {busy ? "Evaluating…" : "Start Evaluation"}
          </button>
          <button type="button" className="secondary" onClick={() => { setResult(null); setDocResults([]); setFiles([]); }} disabled={!result}>Clear</button>
        </div>
        {err && <p style={{ color: "var(--crit)" }}>{err}</p>}
      </form>

      {result && (
        <div className="card">
          <h2>Upload Valuation Documents</h2>
          <p className="muted">Upload appraisal reports, inspection reports, tax records, or purchase agreements for AI analysis (PDF or XML).</p>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? "#2e7d4a" : "#b0c4b8"}`,
              borderRadius: 8, padding: "20px 16px", textAlign: "center",
              cursor: "pointer", background: dragOver ? "#e8f5ec" : "#f4faf6",
              transition: "all 0.15s",
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 6 }}>📎</div>
            <div style={{ fontSize: 13, color: "#5b6472" }}>
              Drag & drop files here, or <span style={{ color: "#2e7d4a", fontWeight: 600 }}>click to browse</span>
            </div>
            <div className="muted" style={{ marginTop: 4 }}>PDF or XML — appraisals, inspections, tax records, purchase agreements</div>
            <input ref={fileInputRef} type="file" multiple accept=".pdf,.xml"
              style={{ display: "none" }} onChange={handleFileInput} />
          </div>

          {files.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {files.map((f, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 6, fontSize: 12,
                  background: "#e8f5ec", border: "1px solid #b0c4b8",
                  borderRadius: 6, padding: "4px 10px",
                }}>
                  📄 {f.name}
                  <button type="button" onClick={() => removeFile(i)} style={{
                    background: "none", border: "none", color: "#a5222f",
                    cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1,
                  }}>×</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
            <button type="button" onClick={analyzeDocuments} disabled={uploadBusy || files.length === 0}>
              {uploadBusy ? "Analyzing…" : `Analyze ${files.length > 0 ? files.length + " " : ""}Document${files.length !== 1 ? "s" : ""}`}
            </button>
          </div>

          {uploadBusy && (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🤖</div>
              <p className="muted">AI is analyzing your uploaded documents…</p>
            </div>
          )}
        </div>
      )}

      {docResults.length > 0 && (
        <div className="card">
          <h2>AI Document Analysis</h2>
          <p className="muted">The AI has read and analyzed each uploaded file for property-relevant information.</p>
          {docResults.map((dr, i) => {
            const a = dr.ai_analysis;
            if (dr.error) return (
              <div key={i} style={{ marginBottom: 12, padding: 12, background: "#fde7ea", borderRadius: 6 }}>
                <strong>📄 {dr.filename}</strong>
                <p className="muted" style={{ color: "var(--crit)" }}>Upload failed: {dr.error}</p>
              </div>
            );
            if (!a) return null;
            return (
              <div key={i} style={{ marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>📄</span>
                  <div>
                    <div style={{ fontWeight: 700 }}>{dr.filename}</div>
                    <span className="pill ok">{a.document_type}</span>
                    <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>
                      Extraction confidence: {((a.confidence || 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                <p style={{ fontSize: 13, marginBottom: 8 }}>{a.summary}</p>

                {a.property_address && (
                  <p className="muted" style={{ fontSize: 12 }}>📍 Address found: <strong>{a.property_address}</strong></p>
                )}

                {a.valuation_impact && (
                  <div style={{ fontSize: 12, background: "#e8f5ec", borderRadius: 6, padding: "8px 12px", marginBottom: 8 }}>
                    <strong>Valuation impact:</strong> {a.valuation_impact}
                  </div>
                )}

                {a.key_facts?.length > 0 && (
                  <>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Key Facts Extracted</div>
                    <table>
                      <thead><tr><th>Field</th><th>Value</th><th>Significance</th></tr></thead>
                      <tbody>
                        {a.key_facts.map((kf: any, j: number) => (
                          <tr key={j}>
                            <td style={{ fontWeight: 600 }}>{kf.field}</td>
                            <td>{kf.value}</td>
                            <td className="muted">{kf.significance}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                {a.flags?.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Flags & Concerns</div>
                    {a.flags.map((f: any, j: number) => (
                      <div key={j} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                        <span className={`pill ${f.severity === "high" ? "crit" : f.severity === "moderate" ? "warn" : "ok"}`}>
                          {f.severity}
                        </span>
                        <div>
                          <strong style={{ fontSize: 13 }}>{f.issue}</strong>
                          <div className="muted">{f.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
