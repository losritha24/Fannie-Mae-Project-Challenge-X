import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export default function Audit() {
  const { id = "CASE-1001" } = useParams();
  const h = useQuery({ queryKey: ["hist", id], queryFn: () => api.history(id) });
  return (
    <>
      <h2>Audit &amp; History Timeline</h2>
      <div className="card">
        {h.data && h.data.length === 0 && <p className="muted">No events yet for this case.</p>}
        {h.data?.map((e: any) => (
          <div key={e.event_id} style={{ borderLeft: "2px solid #1f4e8a", padding: "6px 10px", marginBottom: 8 }}>
            <div style={{ fontSize: 13 }}>
              <strong>{e.action}</strong> · {e.actor}
            </div>
            <div className="muted">{new Date(e.timestamp).toLocaleString()} · {e.entity}/{e.entity_id}</div>
            {Object.keys(e.details || {}).length > 0 && (
              <pre style={{ fontSize: 11, background: "#f7f8fa", padding: 6, borderRadius: 4 }}>
                {JSON.stringify(e.details, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
