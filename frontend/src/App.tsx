import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Dashboard from "./pages/Dashboard";
import Workspace from "./pages/Workspace";
import GraphView from "./pages/GraphView";
import Audit from "./pages/Audit";
import Evaluate from "./pages/Evaluate";
import ReviewQueue from "./pages/ReviewQueue";
import Compliance from "./pages/Compliance";
import { api } from "./api/client";

function CaseLinks() {
  const cases = useQuery({ queryKey: ["cases"], queryFn: api.listCases, refetchInterval: 5000 });
  const first = cases.data?.[0]?.case_id;
  if (!first) {
    return (
      <div style={{ fontSize: 12, color: "#93a3bc", margin: "6px 10px" }}>
        No active case. Use <strong>New Evaluation</strong> to create one.
      </div>
    );
  }
  return (
    <>
      <NavLink to={`/case/${first}`}>Property Workspace</NavLink>
      <NavLink to={`/case/${first}/graph`}>Knowledge Graph</NavLink>
      <NavLink to={`/case/${first}/audit`}>Audit &amp; History</NavLink>
    </>
  );
}

export default function App() {
  return (
    <div className="app">
      <nav className="sidebar" aria-label="Primary">
        <h1>Property Valuation &amp; Designation Assistant</h1>
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/evaluate">New Evaluation</NavLink>
        <NavLink to="/review-queue">Anomaly Review Queue</NavLink>
        <CaseLinks />
        <NavLink to="/compliance">Security &amp; Compliance</NavLink>
        <div style={{ marginTop: 40, fontSize: 11, color: "#93a3bc" }}>
          Decision-support tool. Not a licensed appraisal.
        </div>
      </nav>
      <main className="main" role="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/evaluate" element={<Evaluate />} />
          <Route path="/review-queue" element={<ReviewQueue />} />
          <Route path="/compliance" element={<Compliance />} />
          <Route path="/case/:id" element={<Workspace />} />
          <Route path="/case/:id/graph" element={<GraphView />} />
          <Route path="/case/:id/audit" element={<Audit />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
