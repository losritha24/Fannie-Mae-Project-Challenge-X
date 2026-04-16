import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { getMetrics } from "../api/metrics";

function healthColor(successRate: number) {
  if (successRate >= 98) return { color: "#2e7d4a", bg: "#e8f5e9", label: "Healthy" };
  if (successRate >= 90) return { color: "#b35d00", bg: "#fff3e0", label: "Degraded" };
  return { color: "#a5222f", bg: "#fde7ea", label: "Unhealthy" };
}

function responseColor(ms: number) {
  if (ms === 0) return "#5b6472";
  if (ms < 800) return "#2e7d4a";
  if (ms < 2000) return "#b35d00";
  return "#a5222f";
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: "20px 16px" }}>
      <div style={{ fontSize: 11, color: "#5b6472", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || "var(--text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#5b6472", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const cases = useQuery({ queryKey: ["cases"], queryFn: api.listCases, refetchInterval: 5000 });
  const sources = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  const [metrics, setMetrics] = useState(getMetrics());

  // Refresh metrics every 3s
  useEffect(() => {
    const t = setInterval(() => setMetrics(getMetrics()), 3000);
    return () => clearInterval(t);
  }, []);

  const health = healthColor(metrics.successRate);
  const totalAnomalies = cases.data?.reduce((sum: number, c: any) => sum + c.anomaly_count, 0) ?? 0;
  const avgConfidence = cases.data?.length
    ? (cases.data.reduce((sum: number, c: any) => sum + c.overall_confidence, 0) / cases.data.length * 100).toFixed(0)
    : "—";

  // Top endpoints by call count for health table
  const endpointRows = Object.entries(metrics.byEndpoint)
    .sort((a, b) => b[1].calls - a[1].calls)
    .slice(0, 8);

  return (
    <>
      <h2>Valuation Case Queue</h2>
      <div className="disclaimer">
        This application provides analyst decision support. It is not a licensed appraisal,
        lending, legal, or compliance judgment. Every material output includes source provenance,
        confidence, and a human review checkpoint.
      </div>

      {/* KPI Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
        <KpiCard
          label="Total Cases"
          value={String(cases.data?.length ?? "—")}
          sub="active in queue"
        />
        <KpiCard
          label="Avg Response Time"
          value={metrics.avgResponseMs ? `${metrics.avgResponseMs} ms` : "—"}
          sub={metrics.p95Ms ? `p95: ${metrics.p95Ms} ms` : "waiting for calls…"}
          color={responseColor(metrics.avgResponseMs)}
        />
        <KpiCard
          label="API Success Rate"
          value={metrics.total > 0 ? `${metrics.successRate.toFixed(1)}%` : "—"}
          sub={`${metrics.successes} ok · ${metrics.failures} failed`}
          color={metrics.total > 0 ? health.color : undefined}
        />
        <KpiCard
          label="Open Anomalies"
          value={String(totalAnomalies)}
          sub="across all cases"
          color={totalAnomalies > 0 ? "#b35d00" : "#2e7d4a"}
        />
        <KpiCard
          label="Avg Confidence"
          value={avgConfidence !== "—" ? `${avgConfidence}%` : "—"}
          sub="across all cases"
        />
      </div>

      {/* System Health */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>System Health</h2>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 999,
            background: health.bg, color: health.color,
          }}>
            ● {health.label}
          </span>
        </div>

        {metrics.total === 0 ? (
          <p className="muted">No API calls recorded yet — metrics populate as you use the app.</p>
        ) : (
          <>
            {/* Summary bar */}
            <div style={{ display: "flex", gap: 24, marginBottom: 14, fontSize: 13 }}>
              <span><strong>{metrics.total}</strong> <span className="muted">total calls</span></span>
              <span style={{ color: "#2e7d4a" }}><strong>{metrics.successes}</strong> <span className="muted">succeeded</span></span>
              {metrics.failures > 0 && (
                <span style={{ color: "#a5222f" }}><strong>{metrics.failures}</strong> <span className="muted">failed</span></span>
              )}
            </div>

            {/* Success rate bar */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#5b6472", marginBottom: 4 }}>
                <span>API Success Rate</span>
                <span>{metrics.successRate.toFixed(1)}%</span>
              </div>
              <div style={{ height: 8, background: "#fde7ea", borderRadius: 999, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 999,
                  width: `${metrics.successRate}%`,
                  background: health.color,
                  transition: "width 0.4s ease",
                }} />
              </div>
            </div>

            {/* Per-endpoint table */}
            {endpointRows.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Endpoint</th>
                    <th>Calls</th>
                    <th>Failures</th>
                    <th>Avg Response</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {endpointRows.map(([ep, stat]) => {
                    const epRate = ((stat.calls - stat.failures) / stat.calls) * 100;
                    const epHealth = healthColor(epRate);
                    return (
                      <tr key={ep}>
                        <td style={{ fontFamily: "monospace", fontSize: 12 }}>{ep}</td>
                        <td>{stat.calls}</td>
                        <td style={{ color: stat.failures > 0 ? "#a5222f" : "#5b6472" }}>{stat.failures}</td>
                        <td style={{ color: responseColor(stat.avgMs) }}>
                          {stat.avgMs ? `${stat.avgMs} ms` : "—"}
                        </td>
                        <td>
                          <span style={{
                            fontSize: 11, padding: "2px 8px", borderRadius: 999,
                            background: epHealth.bg, color: epHealth.color, fontWeight: 600,
                          }}>
                            {epHealth.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      {/* Cases table */}
      <div className="card">
        <h2>Open Cases</h2>
        {cases.isLoading && <p>Loading...</p>}
        {cases.data && (
          <table>
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Address</th>
                <th>Anomalies</th>
                <th>Overall Confidence</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cases.data.map((c: any) => (
                <tr key={c.case_id}>
                  <td>{c.case_id}</td>
                  <td>{c.address}</td>
                  <td>
                    <span className={`pill ${c.anomaly_count > 0 ? "warn" : "ok"}`}>
                      {c.anomaly_count}
                    </span>
                  </td>
                  <td>{(c.overall_confidence * 100).toFixed(0)}%</td>
                  <td><Link to={`/case/${c.case_id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Configured Data Sources</h2>
        <p className="muted">
          FHFA = Federal Housing Finance Agency; HUD = U.S. Department of Housing and Urban Development;
          MLS = Multiple Listing Service. Public-record sources are reference-grade; market platforms contribute signals, not source-of-truth.
        </p>
        {sources.data && (
          <table>
            <thead>
              <tr><th>Source</th><th>Type</th><th>Reliability</th></tr>
            </thead>
            <tbody>
              {sources.data.map((s: any) => (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td><span className="pill">{s.type}</span></td>
                  <td>{(s.reliability * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
