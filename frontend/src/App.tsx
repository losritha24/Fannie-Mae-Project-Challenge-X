import { NavLink, Route, Routes, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Dashboard from "./pages/Dashboard";
import Workspace from "./pages/Workspace";
import GraphView from "./pages/GraphView";
import Audit from "./pages/Audit";
import Evaluate from "./pages/Evaluate";
import ReviewQueue from "./pages/ReviewQueue";
import Compliance from "./pages/Compliance";
import Cases from "./pages/Cases";
import Landing from "./pages/Landing";
import { api } from "./api/client";

function CaseSubLinks() {
  const cases = useQuery({ queryKey: ["cases"], queryFn: api.listCases, refetchInterval: 5000 });
  const first = cases.data?.[0]?.case_id;
  if (!first) return null;
  return (
    <div style={{ marginLeft: 12, borderLeft: "1px solid #1f3a2a", paddingLeft: 10 }}>
      <NavLink to={`/case/${first}/graph`} style={{ fontSize: 13 }}>Knowledge Graph</NavLink>
      <NavLink to={`/case/${first}/audit`} style={{ fontSize: 13 }}>Audit &amp; History</NavLink>
    </div>
  );
}

function AppShell() {
  return (
    <div className="app">
      <nav className="sidebar" aria-label="Primary">
        <img src="/logo.png" alt="Property Insight AI" style={{ width: "100%", maxWidth: 200, marginBottom: 8 }} />
        <NavLink to="/dashboard" end>Dashboard</NavLink>
        <NavLink to="/evaluate">New Evaluation</NavLink>
        <NavLink to="/cases">Property Workspace</NavLink>
        <CaseSubLinks />
        <NavLink to="/review-queue">Anomaly Review Queue</NavLink>
        <NavLink to="/compliance">Security &amp; Compliance</NavLink>
        <div style={{ marginTop: 40, fontSize: 11, color: "#93a3bc" }}>
          Decision-support tool. Not a licensed appraisal.
        </div>
      </nav>
      <main className="main" role="main">
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/evaluate" element={<Evaluate />} />
          <Route path="/cases" element={<Cases />} />
          <Route path="/review-queue" element={<ReviewQueue />} />
          <Route path="/compliance" element={<Compliance />} />
          <Route path="/case/:id" element={<Workspace />} />
          <Route path="/case/:id/graph" element={<GraphView />} />
          <Route path="/case/:id/audit" element={<Audit />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
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
