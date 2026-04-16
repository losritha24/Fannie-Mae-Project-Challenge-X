/** Lightweight client-side API metrics store. */

export interface CallRecord {
  endpoint: string;
  duration: number; // ms
  success: boolean;
  timestamp: number;
}

const MAX_RECORDS = 200;
const records: CallRecord[] = [];

export function record(endpoint: string, duration: number, success: boolean) {
  records.push({ endpoint, duration, success, timestamp: Date.now() });
  if (records.length > MAX_RECORDS) records.shift();
}

export function getMetrics() {
  const total = records.length;
  const successes = records.filter(r => r.success).length;
  const failures = total - successes;
  const successRate = total > 0 ? (successes / total) * 100 : 100;

  const durations = records.filter(r => r.success).map(r => r.duration);
  const avgResponseMs = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;
  const p95Ms = durations.length > 0
    ? Math.round([...durations].sort((a, b) => a - b)[Math.floor(durations.length * 0.95)] ?? 0)
    : 0;

  // Per-endpoint breakdown
  const byEndpoint: Record<string, { calls: number; failures: number; avgMs: number }> = {};
  for (const r of records) {
    if (!byEndpoint[r.endpoint]) byEndpoint[r.endpoint] = { calls: 0, failures: 0, avgMs: 0 };
    byEndpoint[r.endpoint].calls++;
    if (!r.success) byEndpoint[r.endpoint].failures++;
  }
  // Compute avg per endpoint from successful calls
  for (const ep of Object.keys(byEndpoint)) {
    const epDurations = records.filter(r => r.endpoint === ep && r.success).map(r => r.duration);
    byEndpoint[ep].avgMs = epDurations.length > 0
      ? Math.round(epDurations.reduce((a, b) => a + b, 0) / epDurations.length)
      : 0;
  }

  return { total, successes, failures, successRate, avgResponseMs, p95Ms, byEndpoint };
}
