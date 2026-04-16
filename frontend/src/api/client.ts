const BASE = "/api/v1";

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

export const api = {
  listCases: () => req<any[]>("/cases"),
  getCase: (id: string) => req<any>(`/cases/${id}`),
  createCase: (body: any) => req<any>("/cases", { method: "POST", body: JSON.stringify(body) }),
  evaluate: (body: any) => req<any>("/evaluate", { method: "POST", body: JSON.stringify(body) }),
  valuation: (id: string) => req<any>(`/valuations/${id}`),
  comparables: (id: string) => req<any[]>(`/comparables/${id}`),
  anomalies: (id: string) => req<any[]>(`/anomalies/${id}`),
  vision: (id: string) => req<any[]>(`/images/${id}/findings`),
  graph: (id: string) => req<any>(`/graph/${id}`),
  chat: (case_id: string, question: string) =>
    req<any>("/chat", { method: "POST", body: JSON.stringify({ case_id, question }) }),
  agentChat: (case_id: string, question: string) =>
    req<any>("/agent/chat", { method: "POST", body: JSON.stringify({ case_id, question }) }),
  history: (id: string) => req<any[]>(`/history/${id}`),
  sources: () => req<any[]>("/sources/available"),
  report: (id: string) => req<any>(`/reports/${id}/summary`),
  avm: (id: string) => req<any>(`/avm/${id}`),
  alignment: (id: string) => req<any>(`/alignment/${id}`),
  flagAnomaly: (case_id: string, anomaly_id: string) =>
    req<any>(`/anomalies/${case_id}/${anomaly_id}/flag`, { method: "POST" }),
  reviewQueue: () => req<any[]>("/anomalies/review-queue"),
  retention: () => req<any>("/compliance/retention-policy"),
  propertyImage: (id: string) => req<any>(`/cases/${id}/property-image`),
  uploadImage: async (case_id: string, file: File): Promise<any> => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`${BASE}/images/upload?case_id=${encodeURIComponent(case_id)}`, {
      method: "POST",
      body: fd,
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return r.json();
  },
  uploadDocument: async (case_id: string, file: File): Promise<any> => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`${BASE}/documents/upload?case_id=${encodeURIComponent(case_id)}`, {
      method: "POST",
      body: fd,
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return r.json();
  },
};
