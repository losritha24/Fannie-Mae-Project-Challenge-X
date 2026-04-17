import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

const EVENT_ICON: Record<string, string> = {
  sale: "🏠",
  listing: "📋",
  delisted: "❌",
  price_reduction: "📉",
};

const EVENT_COLOR: Record<string, string> = {
  sale: "#2e7d4a",
  listing: "#1565c0",
  delisted: "#a5222f",
  price_reduction: "#b35d00",
};

function PriceHistory({ history }: { history: any[] }) {
  if (!history?.length) return null;

  const lastSale = history.find((ev: any) => ev.event_type === "sale");

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2>Property Price History</h2>
      <p className="muted">Past sale transactions and listing events for this property, sourced from public deed records and MLS history.</p>

      {lastSale && (
        <div style={{ display: "flex", gap: 24, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={{ background: "#e8f5ec", border: "1px solid #b0d4bb", borderRadius: 8, padding: "12px 18px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#2e7d4a", textTransform: "uppercase", marginBottom: 4 }}>Last Purchased</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1b1f27" }}>
              {lastSale.date_iso ? new Date(lastSale.date_iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "Unknown"}
            </div>
            {lastSale.price && (
              <div style={{ fontSize: 14, color: "#2e7d4a", fontWeight: 600, marginTop: 2 }}>
                ${Number(lastSale.price).toLocaleString()}
              </div>
            )}
            {lastSale.source && (
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Source: {lastSale.source}</div>
            )}
          </div>
        </div>
      )}
      <div style={{ position: "relative", paddingLeft: 28 }}>
        {/* Vertical line */}
        <div style={{
          position: "absolute", left: 9, top: 6, bottom: 6,
          width: 2, background: "#d0e8d8", borderRadius: 2,
        }} />
        {history.map((ev: any, i: number) => {
          const color = EVENT_COLOR[ev.event_type] ?? "#5b6472";
          const icon = EVENT_ICON[ev.event_type] ?? "📌";
          const date = ev.date_iso ? new Date(ev.date_iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "Unknown date";
          return (
            <div key={i} style={{ display: "flex", gap: 14, marginBottom: 18, position: "relative" }}>
              {/* Dot */}
              <div style={{
                position: "absolute", left: -28, top: 2,
                width: 20, height: 20, borderRadius: "50%",
                background: color, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 11, flexShrink: 0,
                zIndex: 1,
              }}>
                <span>{icon}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                    background: `${color}18`, color,
                    textTransform: "capitalize",
                  }}>
                    {ev.event_type.replace(/_/g, " ")}
                  </span>
                  {ev.price && (
                    <span style={{ fontWeight: 700, fontSize: 15, color: "#1b1f27" }}>
                      ${Number(ev.price).toLocaleString()}
                    </span>
                  )}
                  <span className="muted" style={{ fontSize: 12 }}>{date}</span>
                  <span className="badge-src" style={{ fontSize: 11 }}>{ev.source}</span>
                </div>
                {ev.notes && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{ev.notes}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Audit() {
  const { id = "CASE-1001" } = useParams();
  const h = useQuery({ queryKey: ["hist", id], queryFn: () => api.history(id), refetchInterval: 5000 });
  const c = useQuery({ queryKey: ["case", id], queryFn: () => api.getCase(id) });
  const lastUpdated = h.dataUpdatedAt ? new Date(h.dataUpdatedAt).toLocaleTimeString() : null;

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Audit &amp; History</h2>
        {lastUpdated && <span className="muted" style={{ fontSize: 11 }}>Last updated {lastUpdated}</span>}
        {h.isFetching && <span className="muted" style={{ fontSize: 11 }}>Refreshing…</span>}
      </div>

      {/* Price History */}
      {c.data?.price_history?.length > 0 && (
        <PriceHistory history={c.data.price_history} />
      )}
      {c.isLoading && <div className="card"><p className="muted">Loading price history…</p></div>}

      {/* Audit Event Log */}
      <div className="card">
        <h2>System Audit Log</h2>
        <p className="muted">All actions taken on this case — evaluations, views, document uploads, chat queries, and reviewer decisions.</p>
        {h.isLoading && <p className="muted">Loading…</p>}
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
