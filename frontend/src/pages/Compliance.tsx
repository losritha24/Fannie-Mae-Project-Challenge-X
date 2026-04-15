import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export default function Compliance() {
  const p = useQuery({ queryKey: ["retention"], queryFn: api.retention });
  if (!p.data) return <p>Loading…</p>;
  return (
    <>
      <h2>Security, Compliance &amp; AI Governance</h2>
      <p className="muted">
        Policy v{p.data.policy_version} · effective {p.data.effective_date}. This is the runtime
        source of truth for data retention, lawful basis, and model-ecosystem eligibility.
      </p>

      <div className="card">
        <h2>Data Retention &amp; Usage</h2>
        <table>
          <thead>
            <tr>
              <th>Data class</th><th>Examples</th><th>Retention</th>
              <th>Lawful basis</th><th>Model eligible</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {p.data.classes.map((c: any) => (
              <tr key={c.class}>
                <td><strong>{c.class}</strong></td>
                <td className="muted">{c.examples.join(", ")}</td>
                <td>{Math.round(c.retention_days / 365)} yr ({c.retention_days}d)</td>
                <td>{c.lawful_basis}</td>
                <td>
                  <span className={`pill ${c.model_eligible ? "ok" : "crit"}`}>
                    {c.model_eligible ? "yes" : "no"}
                  </span>
                </td>
                <td className="muted">{c.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Deletion &amp; Legal Hold</h2>
          <ul>
            <li><strong>User-initiated:</strong> {p.data.deletion.user_initiated}</li>
            <li><strong>Legal hold:</strong> {p.data.deletion.legal_hold}</li>
            <li><strong>Crypto-shred:</strong> {p.data.deletion.crypto_shred}</li>
          </ul>
        </div>
        <div className="card">
          <h2>Responsible AI — Model Ecosystem Usage</h2>
          <ul>
            {p.data.ai_governance.model_ecosystem_usage.map((s: string) => <li key={s}>{s}</li>)}
          </ul>
        </div>
      </div>

      <div className="card">
        <h2>Runtime Security Controls</h2>
        <ul>
          <li>JWT authentication with role-based access control (analyst · reviewer · compliance · auditor · admin)</li>
          <li>Per-IP, per-endpoint-group rate limiting (token bucket)</li>
          <li>PII &amp; secret redaction filter on all log streams (SSN, email, card, bearer tokens, OpenAI keys)</li>
          <li>Security response headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)</li>
          <li>Correlation IDs on every request for end-to-end tracing</li>
          <li>Append-only audit event log (case state, reviewer decisions, AI calls)</li>
          <li>Typed request validation via Pydantic · structured error responses</li>
          <li>CORS allow-list · least-privilege endpoint roles · signed URLs for documents/images</li>
        </ul>
      </div>
    </>
  );
}
