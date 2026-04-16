import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";

const NODE_COLORS: Record<string, { fill: string; stroke: string; emoji: string }> = {
  Property:                    { fill: "#e8f5e9", stroke: "#2e7d4a", emoji: "🏠" },
  Parcel:                      { fill: "#e3f2fd", stroke: "#1565c0", emoji: "📋" },
  Source:                      { fill: "#fff8e1", stroke: "#f57f17", emoji: "📡" },
  Appraisal:                   { fill: "#f3e5f5", stroke: "#6a1b9a", emoji: "📄" },
  BrokerPriceOpinion:          { fill: "#f3e5f5", stroke: "#6a1b9a", emoji: "📄" },
  AutomatedValuationModelOutput:{ fill: "#e8eaf6", stroke: "#283593", emoji: "🤖" },
  ComparableProperty:          { fill: "#fff3e0", stroke: "#e65100", emoji: "🏘️" },
  Anomaly:                     { fill: "#ffebee", stroke: "#b71c1c", emoji: "⚠️" },
};

function nodeStyle(type: string) {
  return NODE_COLORS[type] ?? { fill: "#f4f7f5", stroke: "#2e7d4a", emoji: "●" };
}

function shortLabel(label: string, max = 16) {
  return label.length > max ? label.slice(0, max - 1) + "…" : label;
}

export default function GraphView() {
  const { id = "CASE-1001" } = useParams();
  const g = useQuery({ queryKey: ["graph", id], queryFn: () => api.graph(id), refetchInterval: 10000 });
  const [sel, setSel] = useState<string | null>(null);

  if (!g.data) return <p>Loading…</p>;

  const lastUpdated = g.dataUpdatedAt ? new Date(g.dataUpdatedAt).toLocaleTimeString() : null;
  const nodes: any[] = g.data.nodes;
  const edges: any[] = g.data.edges;

  // Layout: property node in center, everything else in a circle around it
  const W = 820, H = 520, CX = W / 2, CY = H / 2;
  const pos: Record<string, { x: number; y: number }> = {};
  const center = nodes.find((n: any) => n.type === "Property");
  const rest = nodes.filter((n: any) => n.type !== "Property");
  if (center) pos[center.id] = { x: CX, y: CY };
  rest.forEach((node: any, i: number) => {
    const angle = (i / rest.length) * Math.PI * 2 - Math.PI / 2;
    pos[node.id] = { x: CX + Math.cos(angle) * 210, y: CY + Math.sin(angle) * 195 };
  });

  const selNode = nodes.find((n: any) => n.id === sel);
  const selEdges = edges.filter((e: any) => e.source === sel || e.target === sel);

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>Knowledge Graph</h2>
        {lastUpdated && <span className="muted" style={{ fontSize: 11 }}>Last updated {lastUpdated}</span>}
        {g.isFetching && <span className="muted" style={{ fontSize: 11 }}>Refreshing…</span>}
      </div>

      <p className="muted" style={{ marginBottom: 12 }}>
        This graph shows how the subject property connects to its data sources, comparable sales,
        valuation documents, and detected anomalies. Click any node to see its relationships
        and plain-language explanation.
      </p>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        {Object.entries(NODE_COLORS).map(([type, style]) => (
          <span key={type} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 11, padding: "3px 10px", borderRadius: 999,
            background: style.fill, border: `1px solid ${style.stroke}`, color: "#1b1f27",
          }}>
            {style.emoji} {type.replace(/([A-Z])/g, " $1").trim()}
          </span>
        ))}
      </div>

      <div className="grid-2">
        {/* Graph */}
        <div className="card" style={{ padding: 8, overflow: "hidden" }}>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Property knowledge graph">
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill="#aab4be" />
              </marker>
            </defs>

            {/* Edges */}
            {edges.map((e: any, i: number) => {
              const s = pos[e.source], t = pos[e.target];
              if (!s || !t) return null;
              const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2;
              return (
                <g key={i}>
                  <line x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                    stroke="#c3cbd6" strokeWidth={1.5} markerEnd="url(#arrow)" />
                  <text x={mx} y={my - 4} textAnchor="middle" fontSize={8} fill="#8a96a3">
                    {e.relationship.replace(/_/g, " ")}
                  </text>
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map((node: any) => {
              const { x, y } = pos[node.id] || { x: 0, y: 0 };
              const style = nodeStyle(node.type);
              const isSelected = sel === node.id;
              return (
                <g key={node.id} onClick={() => setSel(node.id === sel ? null : node.id)}
                  style={{ cursor: "pointer" }}>
                  <circle cx={x} cy={y} r={26}
                    fill={isSelected ? style.stroke : style.fill}
                    stroke={style.stroke} strokeWidth={isSelected ? 3 : 1.5} />
                  <text x={x} y={y + 5} textAnchor="middle" fontSize={14}>{style.emoji}</text>
                  <text x={x} y={y + 40} textAnchor="middle" fontSize={9}
                    fill={isSelected ? style.stroke : "#1b1f27"} fontWeight={isSelected ? 700 : 400}>
                    {shortLabel(node.label)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Detail panel */}
        <div className="card">
          {selNode ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 24 }}>{nodeStyle(selNode.type).emoji}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{selNode.label}</div>
                  <span style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 999,
                    background: nodeStyle(selNode.type).fill,
                    border: `1px solid ${nodeStyle(selNode.type).stroke}`,
                  }}>
                    {selNode.type.replace(/([A-Z])/g, " $1").trim()}
                  </span>
                </div>
              </div>

              <h3 style={{ fontSize: 13, marginBottom: 6 }}>Relationships</h3>
              {selEdges.length === 0 && <p className="muted">No relationships for this node.</p>}
              {selEdges.map((e: any, i: number) => {
                const isSource = e.source === sel;
                const other = nodes.find((n: any) => n.id === (isSource ? e.target : e.source));
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "flex-start", gap: 8,
                    padding: "8px 10px", marginBottom: 6,
                    background: "#f4f7f5", borderRadius: 6,
                    borderLeft: `3px solid ${nodeStyle(other?.type).stroke}`,
                  }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{isSource ? "→" : "←"}</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>
                        {e.relationship.replace(/_/g, " ")}
                        {" "}<span style={{ fontWeight: 400, color: "#5b6472" }}>{other?.label}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#5b6472", marginTop: 2 }}>{e.explanation}</div>
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 200, gap: 8 }}>
              <span style={{ fontSize: 32 }}>👆</span>
              <p className="muted" style={{ textAlign: "center", margin: 0 }}>
                Click any node in the graph to see its type, connections, and plain-language
                explanation of each relationship.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Relationships table */}
      <div className="card" style={{ marginTop: 0 }}>
        <h2>All Relationships</h2>
        <table>
          <thead>
            <tr><th>From</th><th>Relationship</th><th>To</th><th>Explanation</th></tr>
          </thead>
          <tbody>
            {edges.map((e: any, i: number) => {
              const src = nodes.find((n: any) => n.id === e.source);
              const tgt = nodes.find((n: any) => n.id === e.target);
              return (
                <tr key={i}>
                  <td>{nodeStyle(src?.type).emoji} {src?.label ?? e.source}</td>
                  <td><span className="pill">{e.relationship.replace(/_/g, " ")}</span></td>
                  <td>{nodeStyle(tgt?.type).emoji} {tgt?.label ?? e.target}</td>
                  <td className="muted">{e.explanation}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
