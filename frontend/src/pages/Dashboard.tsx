import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";

export default function Dashboard() {
  const cases = useQuery({ queryKey: ["cases"], queryFn: api.listCases });
  const sources = useQuery({ queryKey: ["sources"], queryFn: api.sources });

  return (
    <>
      <h2>Valuation Case Queue</h2>
      <div className="disclaimer">
        This application provides analyst decision support. It is not a licensed appraisal,
        lending, legal, or compliance judgment. Every material output includes source provenance,
        confidence, and a human review checkpoint.
      </div>

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
              {cases.data.map((c) => (
                <tr key={c.case_id}>
                  <td>{c.case_id}</td>
                  <td>{c.address}</td>
                  <td>{c.anomaly_count}</td>
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
              {sources.data.map((s) => (
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
