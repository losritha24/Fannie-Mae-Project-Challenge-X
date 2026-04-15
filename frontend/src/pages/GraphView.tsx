import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";

export default function GraphView() {
  const { id = "CASE-1001" } = useParams();
  const g = useQuery({ queryKey: ["graph", id], queryFn: () => api.graph(id) });
  const [sel, setSel] = useState<string | null>(null);
  if (!g.data) return <p>Loading…</p>;
  const selNode = g.data.nodes.find((n: any) => n.id === sel);
  const selEdges = g.data.edges.filter((e: any) => e.source === sel || e.target === sel);

  const w = 900, h = 520;
  const cx = w/2, cy = h/2;
  const n = g.data.nodes.length;
  const pos: Record<string, { x: number; y: number }> = {};
  g.data.nodes.forEach((node: any, i: number) => {
    const angle = (i / n) * Math.PI * 2;
    pos[node.id] = { x: cx + Math.cos(angle) * 210, y: cy + Math.sin(angle) * 200 };
  });

  return (
    <>
      <h2>Knowledge Graph</h2>
      <p className="muted">
        Legend: Property, Parcel, Source, Appraisal, Broker Price Opinion (BPO),
        Automated Valuation Model (AVM) Output, Comparable Property, Anomaly.
        Click a node to see relationships and plain-language explanations.
      </p>
      <div className="grid-2">
        <div className="card">
          <svg width={w} height={h} role="img" aria-label="Property knowledge graph">
            {g.data.edges.map((e: any, i: number) => {
              const s = pos[e.source], t = pos[e.target];
              if (!s || !t) return null;
              return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="#c3cbd6" />;
            })}
            {g.data.nodes.map((node: any) => (
              <g key={node.id} onClick={() => setSel(node.id)} style={{ cursor: "pointer" }}>
                <circle cx={pos[node.id].x} cy={pos[node.id].y} r={22}
                        fill={sel === node.id ? "#1f4e8a" : "#eef2f7"}
                        stroke="#1f4e8a" />
                <text x={pos[node.id].x} y={pos[node.id].y + 36}
                      textAnchor="middle" fontSize={10} fill="#1b1f27">
                  {node.label.length > 22 ? node.label.slice(0, 20) + "…" : node.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
        <div className="card">
          <h2>Selected</h2>
          {selNode ? (
            <>
              <div><strong>{selNode.label}</strong></div>
              <div className="muted">Type: {selNode.type}</div>
              <h3 style={{ fontSize: 13 }}>Relationships</h3>
              <ul>
                {selEdges.map((e: any, i: number) => (
                  <li key={i}>
                    <code>{e.relationship}</code>
                    {e.source === sel ? ` → ${e.target}` : ` ← ${e.source}`}
                    <div className="muted">{e.explanation}</div>
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="muted">Select a node to see its relationships.</p>}
        </div>
      </div>
    </>
  );
}
