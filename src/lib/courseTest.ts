/** Le format des messages envoyés par un test intégré (voir docs/integrer-un-test.md). */
export type TestResult = { label: string; summary: string; score?: number | string | null; details?: Record<string, string | number | boolean> };

const short = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** Lit un message reçu d'un test. Tout ce qui ne suit pas le format est ignoré. */
export function readTestResult(data: unknown): TestResult | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { type?: unknown; result?: unknown };
  if (d.type !== "presence:test-result" || !d.result || typeof d.result !== "object") return null;
  const r = d.result as Record<string, unknown>;
  const label = short(r.label, 200);
  const summary = short(r.summary, 4000);
  if (!label && !summary) return null;
  const score = typeof r.score === "number" && Number.isFinite(r.score) ? r.score : typeof r.score === "string" ? short(r.score, 40) : null;
  const details: Record<string, string | number | boolean> = {};
  if (r.details && typeof r.details === "object") {
    for (const [k, v] of Object.entries(r.details).slice(0, 40)) {
      if (typeof v === "number" || typeof v === "boolean") details[k.slice(0, 80)] = v;
      else if (typeof v === "string") details[k.slice(0, 80)] = v.slice(0, 1000);
    }
  }
  return { label, summary, score, details };
}

export function readTestHeight(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { type?: unknown; height?: unknown };
  if (d.type !== "presence:test-height" || typeof d.height !== "number" || !Number.isFinite(d.height)) return null;
  return Math.min(3000, Math.max(240, Math.round(d.height)));
}
