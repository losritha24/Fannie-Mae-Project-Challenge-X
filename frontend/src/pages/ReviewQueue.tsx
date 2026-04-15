import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";

export default function ReviewQueue() {
  const q = useQuery({ queryKey: ["reviewQueue"], queryFn: api.reviewQueue });
  return (
    <>
      <h2>Anomaly Review Queue</h2>
      <p className="muted">
        Open anomalies of <strong>moderate</strong> or <strong>critical</strong> severity across all
        cases. These require a human reviewer (Quality Control or Compliance role) before the case
        can be finalized.
      </p>
      <div className="card">
        {q.isLoading && <p>Loading…</p>}
        {q.data && q.data.length === 0 && <p className="muted">Nothing in the queue. 🎉</p>}
        {q.data && q.data.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Severity</th><th>Category</th><th>Case</th><th>Address</th>
                <th>Description</th><th>Evidence</th><th></th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((a: any, i: number) => (
                <tr key={i}>
                  <td>
                    <span className={`pill ${a.severity === "critical" ? "crit" : "warn"}`}>
                      {a.severity}
                    </span>
                  </td>
                  <td>{a.category}</td>
                  <td>{a.case_id}</td>
                  <td>{a.address}</td>
                  <td>{a.description}</td>
                  <td className="muted">{(a.evidence || []).join(" · ")}</td>
                  <td><Link to={`/case/${a.case_id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
