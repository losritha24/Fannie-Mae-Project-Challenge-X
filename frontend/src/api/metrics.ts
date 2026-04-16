/** Lightweight client-side API metrics store with time-series history for sparklines. */

export interface CallRecord {
  endpoint: string;
  duration: number; // ms
  success: boolean;
  timestamp: number;
}

export interface TimePoint {
  t: number;        // unix ms
  avgMs: number;    // rolling avg response time at that moment
  successRate: number; // 0-100
}

const MAX_RECORDS = 500;
const MAX_HISTORY = 60; // sparkline data points
const records: CallRecord[] = [];
const history: TimePoint[] = [];

let _lastSnapshotTime = 0;
const SNAPSHOT_INTERVAL = 10_000; // every 10s

function takeSnapshot() {
  const now = Date.now();
  if (now - _lastSnapshotTime < SNAPSHOT_INTERVAL) return;
  _lastSnapshotTime = now;
  const window = records.filter(r => now - r.timestamp < 5 * 60_000); // last 5 min
  if (window.length === 0) return;
  const ok = window.filter(r => r.success);
  const avgMs = ok.length > 0 ? Math.round(ok.reduce((a, b) => a + b.duration, 0) / ok.length) : 0;
  const successRate = (ok.length / window.length) * 100;
  history.push({ t: now, avgMs, successRate });
  if (history.length > MAX_HISTORY) history.shift();
}

export function record(endpoint: string, duration: number, success: boolean) {
  records.push({ endpoint, duration, success, timestamp: Date.now() });
  if (records.length > MAX_RECORDS) records.shift();
  takeSnapshot();
}

export function getHistory(): TimePoint[] {
  return [...history];
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
  for (const ep of Object.keys(byEndpoint)) {
    const epDurations = records.filter(r => r.endpoint === ep && r.success).map(r => r.duration);
    byEndpoint[ep].avgMs = epDurations.length > 0
      ? Math.round(epDurations.reduce((a, b) => a + b, 0) / epDurations.length)
      : 0;
  }

  return { total, successes, failures, successRate, avgResponseMs, p95Ms, byEndpoint };
}
