/**
 * Shared statistics helpers for the "deep analysis" family of reports
 * (sellers, products, stores). All three read the same underlying
 * index_documents data, just grouped by a different key — this is the math
 * they all need, kept in one place so a fix (e.g. the r² trend-gating logic)
 * only has to happen once.
 */

export function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function stddev(arr: number[], mean: number): number {
  if (arr.length < 2) return 0;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

export function coefficientOfVariation(mean: number, sd: number): number {
  return mean > 0 ? (sd / mean) * 100 : 0;
}

export interface LinearRegressionResult {
  slope: number;
  intercept: number;
  r2: number;
}

export function linearRegression(xs: number[], ys: number[]): LinearRegressionResult {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: avg(ys), r2: 0 };
  const mx = avg(xs);
  const my = avg(ys);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * xs[i] + intercept;
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

export function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function mad(values: number[], med: number): number {
  const absDeviations = values.map(v => Math.abs(v - med));
  absDeviations.sort((a, b) => a - b);
  const mid = Math.floor(absDeviations.length / 2);
  return absDeviations.length % 2 === 0
    ? (absDeviations[mid - 1] + absDeviations[mid]) / 2
    : absDeviations[mid];
}

export function dayOfWeek(dateStr: string): number {
  // "YYYY-MM-DD" → 0=Sun..6=Sat (JS getDay)
  return new Date(dateStr + "T12:00:00+03:00").getDay();
}

export function formatDateLocal(d: Date): string {
  const offset = 3 * 60 * 60 * 1000; // MSK
  const local = new Date(d.getTime() + offset);
  return local.toISOString().slice(0, 10);
}

/**
 * The frontend's store filters are built from human-typed shop names
 * ("Победа", "Твардоского", "45") that don't necessarily match the real
 * `shops.name` values exactly, and definitely aren't a UUID — but
 * index_documents.shop_id IS a UUID. Without this resolution step, every
 * store-filtered query silently returns zero rows. Shared by sellers,
 * products, and stores — all three take the same store param shape.
 *
 * Tries, in order: already a real UUID → exact name match → case-insensitive
 * substring match (covers "Победа" matching a full name like "Магазин
 * Победа"). Returns undefined (no filter) if nothing matches, rather than
 * silently filtering to nothing.
 */
export function resolveStoreParam(
  store: string | undefined,
  shopNames: Record<string, string>,
): string | undefined {
  if (!store || store === "all") return undefined;

  if (shopNames[store] != null) return store; // already a uuid

  const entries = Object.entries(shopNames);
  const exact = entries.find(([, name]) => name === store);
  if (exact) return exact[0];

  const needle = store.trim().toLowerCase();
  const partial = entries.find(([, name]) => name.toLowerCase().includes(needle));
  if (partial) return partial[0];

  return undefined;
}

/**
 * A trend is only reported as up/down if BOTH the slope clears a meaningful
 * magnitude AND r² shows the line actually fits the data — otherwise a
 * handful of noisy points can produce a confident-looking arrow that's
 * really just scatter. Used identically by sellers/products/stores so a
 * "declining trend" means the same level of statistical confidence
 * everywhere in the app.
 */
export function trendDirection(
  reg: LinearRegressionResult,
  pointCount: number,
  minPoints: number,
  slopeThreshold: number,
  minR2 = 0.3,
): "↑" | "↓" | "→" {
  const meaningful = pointCount >= minPoints && reg.r2 >= minR2;
  if (!meaningful) return "→";
  if (reg.slope > slopeThreshold) return "↑";
  if (reg.slope < -slopeThreshold) return "↓";
  return "→";
}
