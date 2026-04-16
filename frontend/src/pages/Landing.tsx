import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];

export default function Landing() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ address_line: "", city: "", state: "TX", zip_code: "" });
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const STEPS = [
    "Retrieving property facts…",
    "Analyzing comparable sales…",
    "Computing valuation range…",
    "Detecting anomalies…",
    "Finalizing report…",
  ];

  const upd = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  const handleEvaluate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    setStep(0);

    // Cycle through progress steps while the API call runs
    let s = 0;
    const ticker = setInterval(() => {
      s = Math.min(s + 1, STEPS.length - 1);
      setStep(s);
    }, 3500);

    try {
      const result = await api.evaluate({ ...form, parcel_id: "", notes: "" });
      clearInterval(ticker);
      navigate(`/case/${result.case_id}`, { state: { evalResult: result } });
    } catch (ex: any) {
      clearInterval(ticker);
      setErr(ex.message || "Evaluation failed. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      display: "flex",
      flexDirection: "column",
    }}>

      {/* Navbar */}
      <nav style={{
        position: "absolute",
        top: 0, left: 0, right: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        padding: "12px 48px",
      }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <img src="/logo.png" alt="Property Insight AI" style={{ height: 220, width: "auto" }} />
        </div>
        <div style={{ display: "flex", gap: 32 }}>
          {[
            { label: "Dashboard", path: "/dashboard" },
            { label: "New Evaluation", path: "/evaluate" },
          ].map(({ label, path }) => (
            <button key={label} onClick={() => navigate(path)} style={{
              background: "none", border: "none", color: "#fff",
              fontSize: 14, fontWeight: 500, cursor: "pointer", opacity: 0.9,
              padding: 0,
            }}>
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* Hero */}
      <div style={{
        flex: 1,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        overflow: "hidden",
      }}>
        {/* Background image */}
        <img
          src="https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1920&auto=format&fit=crop"
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%",
            objectFit: "cover", objectPosition: "center",
          }}
        />

        {/* Dark overlay */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(160deg, rgba(15,40,80,0.82) 0%, rgba(20,60,40,0.72) 100%)",
        }} />

        {/* Content */}
        <div style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          padding: "100px 24px 40px",
          maxWidth: 680,
          width: "100%",
        }}>

          <h1 style={{
            fontSize: "clamp(32px, 5vw, 52px)",
            fontWeight: 800,
            color: "#fff",
            margin: "0 0 16px",
            lineHeight: 1.15,
            letterSpacing: "-0.5px",
          }}>
            Discover Your Property's True Value
          </h1>

          <p style={{
            fontSize: 16,
            color: "rgba(255,255,255,0.8)",
            maxWidth: 500,
            lineHeight: 1.7,
            margin: "0 0 36px",
          }}>
            Get an instant AI-powered valuation with anomaly detection, AVM comparison,
            and comparable sales — backed by trusted public data sources.
          </p>

          {/* Evaluation form */}
          <form onSubmit={handleEvaluate} style={{ width: "100%", maxWidth: 580 }}>
            {/* Street address */}
            <div style={{
              background: "#fff",
              borderRadius: 10,
              padding: "6px 16px",
              marginBottom: 10,
              boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}>
              <span style={{ fontSize: 16, opacity: 0.4, flexShrink: 0 }}>📍</span>
              <input
                required
                value={form.address_line}
                onChange={upd("address_line")}
                placeholder="Street address"
                style={{
                  flex: 1, border: "none", outline: "none",
                  fontSize: 15, padding: "10px 0",
                  fontFamily: "inherit", color: "#1b1f27", background: "transparent",
                }}
              />
            </div>

            {/* City / State / ZIP row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, marginBottom: 14 }}>
              <div style={{
                background: "#fff", borderRadius: 10, padding: "6px 16px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
              }}>
                <input
                  required
                  value={form.city}
                  onChange={upd("city")}
                  placeholder="City"
                  style={{
                    width: "100%", border: "none", outline: "none",
                    fontSize: 15, padding: "10px 0",
                    fontFamily: "inherit", color: "#1b1f27", background: "transparent",
                  }}
                />
              </div>

              <div style={{
                background: "#fff", borderRadius: 10, padding: "6px 12px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
                display: "flex", alignItems: "center",
              }}>
                <select
                  required
                  value={form.state}
                  onChange={upd("state")}
                  style={{
                    border: "none", outline: "none",
                    fontSize: 15, padding: "10px 0",
                    fontFamily: "inherit", color: "#1b1f27",
                    background: "transparent", cursor: "pointer",
                    appearance: "none", width: 52,
                  }}
                >
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div style={{
                background: "#fff", borderRadius: 10, padding: "6px 16px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
              }}>
                <input
                  required
                  value={form.zip_code}
                  onChange={upd("zip_code")}
                  placeholder="ZIP code"
                  pattern="\d{5}(-\d{4})?"
                  style={{
                    width: "100%", border: "none", outline: "none",
                    fontSize: 15, padding: "10px 0",
                    fontFamily: "inherit", color: "#1b1f27", background: "transparent",
                  }}
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={busy}
              style={{
                width: "100%",
                background: busy ? "#5a9e74" : "#2e7d4a",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "16px",
                fontSize: 16,
                fontWeight: 700,
                cursor: busy ? "not-allowed" : "pointer",
                boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
                transition: "background 0.15s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
              onMouseEnter={e => { if (!busy) (e.currentTarget as HTMLButtonElement).style.background = "#256640"; }}
              onMouseLeave={e => { if (!busy) (e.currentTarget as HTMLButtonElement).style.background = "#2e7d4a"; }}
            >
              {busy ? STEPS[step] : <>Get Property Value 🔍</>}
            </button>

            {err && (
              <div style={{
                marginTop: 12,
                background: "rgba(165,34,47,0.85)",
                color: "#fff",
                borderRadius: 8,
                padding: "10px 16px",
                fontSize: 13,
              }}>
                {err}
              </div>
            )}
          </form>

          <p style={{
            marginTop: 16,
            fontSize: 11,
            color: "rgba(255,255,255,0.4)",
          }}>
            Decision-support tool only. Not a licensed appraisal or lending decision.
          </p>
        </div>
      </div>
    </div>
  );
}
