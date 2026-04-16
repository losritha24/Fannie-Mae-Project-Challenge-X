import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";

type NodeMeta = { fill: string; stroke: string; emoji: string; col: number };

const NODE_META: Record<string, NodeMeta> = {
  Source:                        { fill: "#fff8e1", stroke: "#e65100", emoji: "📡", col: 0 },
  Parcel:                        { fill: "#e3f2fd", stroke: "#1565c0", emoji: "📋", col: 1 },
  Property:                      { fill: "#e8f5e9", stroke: "#2e7d4a", emoji: "🏠", col: 1 },
  Appraisal:                     { fill: "#f3e5f5", stroke: "#6a1b9a", emoji: "📄", col: 2 },
  BrokerPriceOpinion:            { fill: "#f3e5f5", stroke: "#6a1b9a", emoji: "📝", col: 2 },
  AutomatedValuationModelOutput: { fill: "#e8eaf6", stroke: "#283593", emoji: "🤖", col: 2 },
  ComparableProperty:            { fill: "#fff3e0", stroke: "#bf360c", emoji: "🏘️", col: 3 },
  Anomaly:                       { fill: "#ffebee", stroke: "#b71c1c", emoji: "⚠️",  col: 4 },
};

const COL_LABELS  = ["Data Sources", "Subject Property", "Valuations & Opinions", "Comparables", "Anomalies"];
const COL_COLORS  = ["#e65100", "#2e7d4a", "#6a1b9a", "#bf360c", "#b71c1c"];
const COL_FILLS   = ["#fff8e1", "#e8f5e9", "#f3e5f5", "#fff3e0", "#ffebee"];
const COL_X       = [90, 282, 474, 666, 858];
const NW = 142, NH = 50, ROW_GAP = 72, HEADER_H = 46, PAD_V = 28, CW = 960;

function getMeta(type: string): NodeMeta {
  return NODE_META[type] ?? { fill: "#f4f7f5", stroke: "#2e7d4a", emoji: "●", col: 1 };
}

function clip(s: string, max = 18) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function buildLayout(nodes: any[]) {
  const cols: any[][] = [[], [], [], [], []];
  for (const n of nodes) {
    const c = Math.min(4, Math.max(0, getMeta(n.type).col));
    cols[c].push(n);
  }
  const maxPerCol = Math.max(1, ...cols.map(c => c.length));
  const CH = HEADER_H + maxPerCol * ROW_GAP + PAD_V;
  const pos: Record<string, { x: number; y: number }> = {};
  for (let c = 0; c < 5; c++) {
    const grp = cols[c];
    const totalH = (grp.length - 1) * ROW_GAP;
    const startY = HEADER_H + (CH - HEADER_H - PAD_V - totalH) / 2;
    grp.forEach((n, i) => { pos[n.id] = { x: COL_X[c], y: startY + i * ROW_GAP }; });
  }
  return { pos, CH };
}

function EdgePath({ e, nodes, pos, selected, dimmed }: any) {
  const s = pos[e.source], t = pos[e.target];
  if (!s || !t) return null;
  // Connect right-edge → left-edge (or left if target is to the left)
  const sx = s.x + NW / 2, sy = s.y;
  const tx = t.x - NW / 2, ty = t.y;
  let d: string;
  if (tx > sx + 10) {
    // Normal forward bezier
    const span = tx - sx;
    const cx1 = sx + span * 0.45, cx2 = tx - span * 0.45;
    d = `M${sx},${sy} C${cx1},${sy} ${cx2},${ty} ${tx},${ty}`;
  } else {
    // Same-column or backward — loop below
    const loopY = Math.max(sy, ty) + 55;
    d = `M${sx},${sy} C${sx + 60},${loopY} ${tx - 60},${loopY} ${tx},${ty}`;
  }
  const midX = (sx + tx) / 2;
  const midY = (sy + ty) / 2 - 10;
  return (
    <g opacity={dimmed ? 0.15 : 1}>
      <path d={d} fill="none"
        stroke={selected ? "#2e7d4a" : "#c3cfd6"}
        strokeWidth={selected ? 2.5 : 1.5}
        strokeDasharray={selected ? undefined : "5 3"}
        markerEnd={selected ? "url(#arr-sel)" : "url(#arr)"} />
      <text x={midX} y={midY} textAnchor="middle" fontSize={8}
        fill={selected ? "#2e7d4a" : "#9aa4ad"} fontWeight={selected ? 700 : 400}>
        {e.relationship.replace(/_/g, " ")}
      </text>
    </g>
  );
}

function NodeCard({ node, pos, selected, dimmed, onClick }: any) {
  const p = pos[node.id];
  if (!p) return null;
  const meta = getMeta(node.type);
  return (
    <g transform={`translate(${p.x},${p.y})`} onClick={onClick}
      style={{ cursor: "pointer" }} opacity={dimmed ? 0.2 : 1}>
      {/* Glow when selected */}
      {selected && (
        <rect x={-NW / 2 - 3} y={-NH / 2 - 3} width={NW + 6} height={NH + 6} rx={10}
          fill={meta.stroke} opacity={0.18} />
      )}
      {/* Card background */}
      <rect x={-NW / 2} y={-NH / 2} width={NW} height={NH} rx={8}
        fill={selected ? meta.stroke : meta.fill}
        stroke={meta.stroke} strokeWidth={selected ? 2.5 : 1.5} />
      {/* Left accent bar */}
      <rect x={-NW / 2} y={-NH / 2} width={5} height={NH} rx={3}
        fill={selected ? "rgba(255,255,255,0.35)" : meta.stroke} />
      {/* Emoji */}
      <text x={-NW / 2 + 20} y={5} fontSize={15} textAnchor="middle">{meta.emoji}</text>
      {/* Label */}
      <text x={-NW / 2 + 82} y={-7} fontSize={10.5} fontWeight={700} textAnchor="middle"
        fill={selected ? "#fff" : "#1b1f27"}>
        {clip(node.label)}
      </text>
      {/* Type */}
      <text x={-NW / 2 + 82} y={9} fontSize={8.5} textAnchor="middle"
        fill={selected ? "rgba(255,255,255,0.75)" : "#8a96a3"}>
        {node.type.replace(/([A-Z])/g, " $1").trim()}
      </text>
    </g>
  );
}

export default function GraphView() {
  const { id = "CASE-1001" } = useParams();
  const navigate = useNavigate();
  const cases = useQuery({ queryKey: ["cases"], queryFn: api.listCases });
  const g = useQuery({ queryKey: ["graph", id], queryFn: () => api.graph(id), refetchInterval: 10000 });
  const [sel, setSel] = useState<string | null>(null);

  if (!g.data) return <p className="muted" style={{ padding: 24 }}>Loading knowledge graph…</p>;

  const nodes: any[] = g.data.nodes;
  const edges: any[] = g.data.edges;
  const { pos, CH } = buildLayout(nodes);

  // Which edges are connected to the selected node?
  const selEdgeIdxs = new Set(
    edges.map((e, i) => ({ e, i }))
      .filter(({ e }) => e.source === sel || e.target === sel)
      .map(({ i }) => i)
  );
  const connectedIds = new Set<string>();
  edges.forEach((e, i) => {
    if (selEdgeIdxs.has(i)) { connectedIds.add(e.source); connectedIds.add(e.target); }
  });

  const selNode = nodes.find(n => n.id === sel);
  const selEdges = edges.filter(e => e.source === sel || e.target === sel);

  return (
    <>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Knowledge Graph</h2>
        {cases.data && cases.data.length > 1 && (
          <select value={id} onChange={e => { setSel(null); navigate(`/case/${e.target.value}/graph`); }}
            style={{ fontSize: 13, padding: "5px 10px", borderRadius: 6, border: "1px solid #dde6e0", background: "#fff", cursor: "pointer", maxWidth: 300 }}>
            {cases.data.map((c: any) => (
              <option key={c.case_id} value={c.case_id}>{c.address}</option>
            ))}
          </select>
        )}
        {g.isFetching && <span className="muted" style={{ fontSize: 11 }}>Refreshing…</span>}
        {sel && (
          <button className="secondary" style={{ fontSize: 12, padding: "4px 12px" }}
            onClick={() => setSel(null)}>Clear selection</button>
        )}
      </div>
      <p className="muted" style={{ marginBottom: 14 }}>
        Visual audit trail — read left to right: data sources feed the subject property,
        which is assessed by valuations and comparables. Anomalies flag conflicts and data gaps.
        Click any node to trace its connections.
      </p>

      {/* Graph + detail panel */}
      <div className="grid-2" style={{ alignItems: "start", gap: 14 }}>
        {/* SVG Graph */}
        <div className="card" style={{ padding: 10, overflowX: "auto" }}>
          <svg width="100%" viewBox={`0 0 ${CW} ${CH}`}
            style={{ display: "block", minWidth: 520 }}
            aria-label="Property knowledge graph — hierarchical audit trail">
            <defs>
              <marker id="arr" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
                <path d="M0,0 L7,3.5 L0,7 z" fill="#c3cfd6" />
              </marker>
              <marker id="arr-sel" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
                <path d="M0,0 L7,3.5 L0,7 z" fill="#2e7d4a" />
              </marker>
            </defs>

            {/* Column header badges */}
            {COL_LABELS.map((label, ci) => (
              <g key={ci}>
                <rect x={COL_X[ci] - NW / 2 - 3} y={5} width={NW + 6} height={32}
                  rx={6} fill={COL_FILLS[ci]} stroke={COL_COLORS[ci]} strokeWidth={1} opacity={0.8} />
                <text x={COL_X[ci]} y={26} textAnchor="middle" fontSize={9.5} fontWeight={700}
                  fill={COL_COLORS[ci]}>
                  {label}
                </text>
              </g>
            ))}

            {/* Edges (draw behind nodes) */}
            {edges.map((e: any, i: number) => (
              <EdgePath key={i} e={e} nodes={nodes} pos={pos}
                selected={selEdgeIdxs.has(i)}
                dimmed={sel !== null && !selEdgeIdxs.has(i)} />
            ))}

            {/* Nodes */}
            {nodes.map((node: any) => (
              <NodeCard key={node.id} node={node} pos={pos}
                selected={sel === node.id}
                dimmed={sel !== null && !connectedIds.has(node.id) && sel !== node.id}
                onClick={() => setSel(node.id === sel ? null : node.id)} />
            ))}
          </svg>
        </div>

        {/* Detail panel */}
        <div className="card" style={{ minHeight: 260 }}>
          {selNode ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 28 }}>{getMeta(selNode.type).emoji}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>{selNode.label}</div>
                  <span style={{
                    fontSize: 11, padding: "2px 9px", borderRadius: 999, marginTop: 4,
                    display: "inline-block", fontWeight: 600,
                    background: getMeta(selNode.type).fill,
                    border: `1px solid ${getMeta(selNode.type).stroke}`,
                    color: getMeta(selNode.type).stroke,
                  }}>
                    {selNode.type.replace(/([A-Z])/g, " $1").trim()}
                  </span>
                </div>
              </div>

              {selNode.properties && Object.keys(selNode.properties).length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#8a96a3", marginBottom: 6 }}>
                    PROPERTIES
                  </div>
                  {Object.entries(selNode.properties).map(([k, v]: any) => (
                    <div key={k} style={{
                      display: "flex", justifyContent: "space-between",
                      fontSize: 12, padding: "4px 0", borderBottom: "1px solid #f0f3f1",
                    }}>
                      <span style={{ color: "#5b6472" }}>{k.replace(/_/g, " ")}</span>
                      <span style={{ fontWeight: 600 }}>{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#8a96a3", marginBottom: 8 }}>
                CONNECTIONS ({selEdges.length})
              </div>
              {selEdges.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No connections for this node.</p>}
              {selEdges.map((e: any, i: number) => {
                const isOut = e.source === sel;
                const otherId = isOut ? e.target : e.source;
                const other = nodes.find(n => n.id === otherId);
                const om = getMeta(other?.type);
                return (
                  <div key={i} onClick={() => setSel(otherId)} style={{
                    display: "flex", alignItems: "flex-start", gap: 8,
                    padding: "8px 10px", marginBottom: 6, borderRadius: 7,
                    background: "#f7faf8", borderLeft: `3px solid ${om.stroke}`,
                    cursor: "pointer",
                  }}>
                    <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1, color: isOut ? "#2e7d4a" : "#1565c0" }}>
                      {isOut ? "→" : "←"}
                    </span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
                        {om.emoji} {other?.label}
                        <span style={{
                          marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 4,
                          background: "#e8f5ec", color: "#2e7d4a",
                        }}>
                          {e.relationship.replace(/_/g, " ")}
                        </span>
                      </div>
                      {e.explanation && (
                        <div style={{ fontSize: 11, color: "#5b6472" }}>{e.explanation}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", height: "100%", minHeight: 240, gap: 12,
            }}>
              <span style={{ fontSize: 40 }}>🔍</span>
              <p className="muted" style={{ textAlign: "center", margin: 0, maxWidth: 220, fontSize: 13 }}>
                Click any node to trace its connections and inspect its place in the audit trail.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Audit trail provenance table */}
      <div className="card">
        <h2>Audit Trail — Data Provenance</h2>
        <p className="muted">
          Every relationship in the assessment, read left to right as data flows from sources to conclusions.
          Click a row to highlight that connection in the graph.
        </p>
        <table>
          <thead>
            <tr>
              <th>From</th>
              <th style={{ width: 24, textAlign: "center" }}></th>
              <th>Relationship</th>
              <th style={{ width: 24, textAlign: "center" }}></th>
              <th>To</th>
              <th>Explanation</th>
            </tr>
          </thead>
          <tbody>
            {edges.map((e: any, i: number) => {
              const src = nodes.find(n => n.id === e.source);
              const tgt = nodes.find(n => n.id === e.target);
              const sm = getMeta(src?.type), tm = getMeta(tgt?.type);
              const highlighted = selEdgeIdxs.has(i);
              return (
                <tr key={i}
                  style={{ background: highlighted ? "#e8f5ec" : undefined, cursor: "pointer" }}
                  onClick={() => setSel(prev => {
                    if (prev === e.source) return e.target;
                    if (prev === e.target) return e.source;
                    return e.source;
                  })}>
                  <td>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12,
                      padding: "2px 8px", borderRadius: 4,
                      background: sm.fill, border: `1px solid ${sm.stroke}`, color: "#1b1f27",
                    }}>
                      {sm.emoji} {src?.label ?? e.source}
                    </span>
                  </td>
                  <td style={{ textAlign: "center", color: "#aab4be", fontSize: 13 }}>→</td>
                  <td>
                    <span className="pill" style={{ fontSize: 11 }}>
                      {e.relationship.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td style={{ textAlign: "center", color: "#aab4be", fontSize: 13 }}>→</td>
                  <td>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12,
                      padding: "2px 8px", borderRadius: 4,
                      background: tm.fill, border: `1px solid ${tm.stroke}`, color: "#1b1f27",
                    }}>
                      {tm.emoji} {tgt?.label ?? e.target}
                    </span>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{e.explanation}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
