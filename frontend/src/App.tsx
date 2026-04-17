import { NavLink, Route, Routes, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Component, ReactNode } from "react";
import Dashboard from "./pages/Dashboard";
import Workspace from "./pages/Workspace";
import GraphView from "./pages/GraphView";
import Audit from "./pages/Audit";
import Evaluate from "./pages/Evaluate";
import ReviewQueue from "./pages/ReviewQueue";
import Compliance from "./pages/Compliance";
import Cases from "./pages/Cases";
import CompareView from "./pages/CompareView";
import Landing from "./pages/Landing";
import ChatbotWidget from "./components/ChatbotWidget";
import { api } from "./api/client";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 32, fontFamily: "monospace" }}>
        <h2 style={{ color: "#a5222f" }}>Something went wrong</h2>
        <pre style={{ background: "#fde7ea", padding: 16, borderRadius: 8, whiteSpace: "pre-wrap", fontSize: 13 }}>
          {this.state.error}
        </pre>
        <button onClick={() => { this.setState({ error: null }); window.location.href = "/dashboard"; }}>
          Go to Dashboard
        </button>
      </div>
    );
    return this.props.children;
  }
}

function CaseSubLinks() {
  const cases = useQuery({ queryKey: ["cases"], queryFn: api.listCases, refetchInterval: 5000 });
  const first = cases.data?.[0]?.case_id;
  const disabled = !first;
  const linkStyle = (isActive: boolean): React.CSSProperties => ({
    fontSize: 13,
    opacity: disabled ? 0.4 : 1,
    pointerEvents: disabled ? "none" : "auto",
    fontStyle: disabled ? "italic" : "normal",
    background: isActive ? "rgba(255,255,255,0.12)" : "transparent",
  });
  return (
    <div style={{ marginLeft: 12, borderLeft: "1px solid #1f3a2a", paddingLeft: 10 }}>
      {disabled ? (
        <>
          <span title="Create a case first" style={{ fontSize: 13, opacity: 0.4, display: "block", padding: "4px 0", cursor: "default" }}>Knowledge Graph</span>
          <span title="Create a case first" style={{ fontSize: 13, opacity: 0.4, display: "block", padding: "4px 0", cursor: "default" }}>Audit &amp; History</span>
        </>
      ) : (
        <>
          <NavLink to={`/case/${first}/graph`} style={({ isActive }) => linkStyle(isActive)}>Knowledge Graph</NavLink>
          <NavLink to={`/case/${first}/audit`} style={({ isActive }) => linkStyle(isActive)}>Audit &amp; History</NavLink>
        </>
      )}
    </div>
  );
}

function AppShell() {
  return (
    <div className="app">
      <nav className="sidebar" aria-label="Primary">
        <img src="/logo.png" alt="Property Insight AI" style={{ width: "100%", maxWidth: 150, marginBottom: 12 }} />
        <NavLink to="/dashboard" end>Dashboard</NavLink>
        <NavLink to="/evaluate">New Evaluation</NavLink>
        <NavLink to="/cases">Property Workspace</NavLink>
        <NavLink to="/compare">Compare Cases</NavLink>
        <CaseSubLinks />
        <NavLink to="/review-queue">Anomaly Review Queue</NavLink>
        <NavLink to="/compliance">Security &amp; Compliance</NavLink>
        <div style={{ marginTop: 40, fontSize: 11, color: "#93a3bc" }}>
          Decision-support tool. Not a licensed appraisal.
        </div>
      </nav>
      <main className="main" role="main">
        <ErrorBoundary>
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/evaluate" element={<Evaluate />} />
            <Route path="/cases" element={<Cases />} />
            <Route path="/compare" element={<CompareView />} />
            <Route path="/review-queue" element={<ReviewQueue />} />
            <Route path="/compliance" element={<Compliance />} />
            <Route path="/case/:id" element={<Workspace />} />
            <Route path="/case/:id/graph" element={<GraphView />} />
            <Route path="/case/:id/audit" element={<Audit />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <ChatbotWidget />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/*" element={<AppShell />} />
    </Routes>
  );
}
