/**
 * Shared statistics and data helpers used by sellerAdvancedStats, sellerEffectiveness,
 * productEffectiveness, storeEffectiveness, and orderForecastV2.
 * Extracted to eliminate duplication.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { VAPE_GROUP_UUIDS } from "../sync/cron";

// ===================== Statistics =====================

export function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function stddev(arr: number[], mean: number): number {
  if (arr.length < 2) return 0;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

export function linearRegression(
  xs: number[],
  ys: number[],
): { slope: number; intercept: number; r2: number } {
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

// ===================== Time helpers =====================

/**
 * Parse hour from a close_date string and convert to MSK (UTC+3).
 * Handles formats: "2026-07-05T14:23:45", "2026-07-05T14:23:45Z", "2026-07-05T14:23:45+00:00"
 */
export function parseHour(closeDate: string): number {
  // Extract UTC hour (works for both "T14:..." and "T14:...Z"/"+00:00")
  const utcHour = parseInt(closeDate.slice(11, 13), 10);
  if (isNaN(utcHour)) return 0;
  return (utcHour + 3) % 24;
}

export function parseDate(closeDate: string): string {
  return closeDate.slice(0, 10);
}

export function minutesBetween(a: string, b: string): number {
  const da = new Date(a + (a.includes("T") ? "" : "T00:00:00") + "+03:00");
  const db = new Date(b + (b.includes("T") ? "" : "T00:00:00") + "+03:00");
  return Math.max(0, (db.getTime() - da.getTime()) / 60000);
}

export function daysBetween(from: string, to: string): number {
  const f = new Date(from + "T00:00:00+03:00");
  const t = new Date(to + "T00:00:00+03:00");
  return Math.max(1, Math.round((t.getTime() - f.getTime()) / 86400000) + 1);
}

export function dayOfWeek(dateStr: string): number {
  return new Date(dateStr + "T12:00:00+03:00").getDay();
}

export function coefficientOfVariation(mean: number, sd: number): number {
  return mean > 0 ? (sd / mean) * 100 : 0;
}

export interface LinearRegressionResult {
  slope: number;
  intercept: number;
  r2: number;
}

export function formatDateLocal(d: Date): string {
  const offset = 3 * 60 * 60 * 1000; // MSK
  const local = new Date(d.getTime() + offset);
  return local.toISOString().slice(0, 10);
}

/**
 * The frontend's store filters are built from human-typed shop names
 * that don't necessarily match the real `shops.name` values exactly.
 * Tries, in order: already a real UUID → exact name match → case-insensitive
 * substring match. Returns undefined (no filter) if nothing matches.
 */
export function resolveStoreParam(
  store: string | undefined,
  shopNames: Record<string, string>,
): string | undefined {
  if (!store || store === "all") return undefined;
  if (shopNames[store] != null) return store;
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
 * magnitude AND r² shows the line actually fits the data.
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

// ===================== Category map =====================

/**
 * Builds a map: shopProduct.uuid → "vape" | "accessory"
 * Used by both sellerAdvancedStats and sellerEffectiveness to classify
 * transaction line items.
 *
 * Vape: parentUuid IN VAPE_GROUP_UUIDS
 * Accessory: parentUuid IN accessories table UUIDs
 */
export async function buildCategoryMap(
  db: D1Database,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  const vapePlaceholders = VAPE_GROUP_UUIDS.map(() => "?").join(",");
  const vapeRows = await db
    .prepare(
      `SELECT uuid FROM shopProduct WHERE parentUuid IN (${vapePlaceholders})`,
    )
    .bind(...VAPE_GROUP_UUIDS)
    .all<{ uuid: string }>();
  for (const r of vapeRows.results ?? []) map.set(r.uuid, "vape");

  try {
    const accParents = await db
      .prepare("SELECT uuid FROM accessories")
      .all<{ uuid: string }>();
    const parentUuids = (accParents.results ?? []).map((r) => r.uuid);
    if (parentUuids.length > 0) {
      const accPlaceholders = parentUuids.map(() => "?").join(",");
      const accRows = await db
        .prepare(
          `SELECT uuid FROM shopProduct WHERE parentUuid IN (${accPlaceholders})`,
        )
        .bind(...parentUuids)
        .all<{ uuid: string }>();
      for (const r of accRows.results ?? []) {
        if (!map.has(r.uuid)) map.set(r.uuid, "accessory");
      }
    }
  } catch {
    // accessories table may not exist
  }

  return map;
}

// ===================== ABC / XYZ classification =====================

/**
 * ABC-классификация по Парето: A = 0–70% кумулятивной выручки,
 * B = 70–90%, C = 90–100%.
 *
 * Переиспользуется в:
 * - orderForecastV2 (прогноз закупок)
 * - productEffectiveness (глубокий анализ товара)
 *
 * Один и тот же метод классификации гарантирует, что товар класса A
 * в прогнозе закупок — тот же A в аналитике товара.
 */
export function classifyABC(
  items: { key: string; value: number }[],
): Map<string, "A" | "B" | "C"> {
  const map = new Map<string, "A" | "B" | "C">();

  const sorted = [...items]
    .filter((it) => it.value > 0)
    .sort((a, b) => b.value - a.value);

  const totalValue = sorted.reduce((s, it) => s + it.value, 0);
  if (totalValue === 0) {
    for (const it of items) map.set(it.key, "C");
    return map;
  }

  let cumulative = 0;
  for (const it of sorted) {
    cumulative += it.value;
    const pct = cumulative / totalValue;
    map.set(it.key, pct <= 0.7 ? "A" : pct <= 0.9 ? "B" : "C");
  }

  // Всё, что не попало в sorted (value = 0), — класс C
  for (const it of items) {
    if (!map.has(it.key)) map.set(it.key, "C");
  }

  return map;
}

/**
 * XYZ-классификация по коэффициенту вариации (CV) дневного спроса.
 * X = CV ≤ 0.5 (стабильный), Y = 0.5 < CV ≤ 1.0 (умеренно-волатильный),
 * Z = CV > 1.0 (нестабильный).
 *
 * Переиспользуется в:
 * - orderForecastV2 (прогноз закупок)
 * - productEffectiveness (глубокий анализ товара)
 */
export function classifyXYZ(
  items: { key: string; cv: number }[],
): Map<string, "X" | "Y" | "Z"> {
  const map = new Map<string, "X" | "Y" | "Z">();
  for (const it of items) {
    map.set(it.key, it.cv <= 0.5 ? "X" : it.cv <= 1.0 ? "Y" : "Z");
  }
  return map;
}

// ===================== Advanced statistics =====================

/**
 * Перцентиль-ранг значения в массиве (0–100).
 * Используется в productEffectiveness и storeEffectiveness для позиционирования
 * метрики относительно всех объектов: «верхние 15% по марже, нижние 30% по CV».
 */
export function percentileRank(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 50;
  const sorted = [...allValues].sort((a, b) => a - b);
  // Сколько значений строго меньше данного
  let below = 0;
  for (const v of sorted) {
    if (v < value) below++;
  }
  return Math.round((below / sorted.length) * 100);
}

/**
 * Interquartile range (IQR) для детекции аномалий.
 * Возвращает { q25, q75, iqr, lowFence, highFence }.
 */
export function iqrStats(values: number[]): {
  q25: number; q75: number; iqr: number; lowFence: number; highFence: number;
} {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return { q25: 0, q75: 0, iqr: 0, lowFence: 0, highFence: 0 };

  const q25 = sorted[Math.floor(n * 0.25)];
  const q75 = sorted[Math.floor(n * 0.75)];
  const iqr = q75 - q25;
  return {
    q25, q75, iqr,
    lowFence: q25 - 1.5 * iqr,
    highFence: q75 + 1.5 * iqr,
  };
}

/**
 * Определяет, является ли значение аномальным по методу IQR.
 */
export function isAnomaly(value: number, stats: ReturnType<typeof iqrStats>): boolean {
  return value < stats.lowFence || value > stats.highFence;
}

/**
 * Доверительный интервал наклона линейной регрессии (95%).
 * Использует t-распределение для малых выборок.
 */
export function trendConfidenceInterval(
  xs: number[],
  ys: number[],
  slope: number,
): { low: number; high: number; significant: boolean } {
  const n = xs.length;
  if (n < 3) return { low: slope, high: slope, significant: false };

  const mx = avg(xs);
  const my = avg(ys);
  const intercept = my - slope * mx;

  // Standard error of slope
  const residuals = ys.map((y, i) => y - (slope * xs[i] + intercept));
  const ssRes = residuals.reduce((s, r) => s + r * r, 0);
  const ssX = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const se = ssX > 0 ? Math.sqrt(ssRes / (n - 2)) / Math.sqrt(ssX) : 0;

  // t-critical values for 95% CI (two-tailed)
  const tTable: Record<number, number> = {
    3: 12.71, 4: 3.18, 5: 2.78, 6: 2.57, 7: 2.45, 8: 2.36, 9: 2.31, 10: 2.26,
  };
  let tCrit = 1.96; // normal approximation for n > 30
  if (n <= 10) tCrit = tTable[n] || 2.26;
  else if (n <= 20) tCrit = 2.09;
  else if (n <= 30) tCrit = 2.05;

  const margin = tCrit * se;
  return {
    low: slope - margin,
    high: slope + margin,
    significant: (slope > 0 && slope - margin > 0) || (slope < 0 && slope + margin < 0),
  };
}

/**
 * Простой k-means (2 кластера) для группировки магазинов по размеру.
 * Используется в storeEffectiveness для сравнения «похожих» точек.
 */
export function kMeans2(
  points: { key: string; features: number[] }[],
): Map<string, 0 | 1> {
  if (points.length < 2) {
    const m = new Map<string, 0 | 1>();
    for (const p of points) m.set(p.key, 0);
    return m;
  }

  // Нормализация признаков
  const dims = points[0].features.length;
  const mins: number[] = [];
  const maxs: number[] = [];
  for (let d = 0; d < dims; d++) {
    const vals = points.map(p => p.features[d]);
    mins.push(Math.min(...vals));
    maxs.push(Math.max(...vals));
  }

  const normalized = points.map(p => ({
    key: p.key,
    features: p.features.map((v, d) =>
      maxs[d] - mins[d] > 0 ? (v - mins[d]) / (maxs[d] - mins[d]) : 0,
    ),
  }));

  // Инициализация центроидов: min и max по первой компоненте
  const sorted = [...normalized].sort((a, b) => a.features[0] - b.features[0]);
  let c0 = sorted[0].features;
  let c1 = sorted[sorted.length - 1].features;

  // 10 итераций (достаточно для 2 кластеров)
  for (let iter = 0; iter < 10; iter++) {
    const cluster0: number[][] = [];
    const cluster1: number[][] = [];

    for (const p of normalized) {
      let d0 = 0, d1 = 0;
      for (let d = 0; d < dims; d++) {
        d0 += (p.features[d] - c0[d]) ** 2;
        d1 += (p.features[d] - c1[d]) ** 2;
      }
      if (d0 <= d1) cluster0.push(p.features);
      else cluster1.push(p.features);
    }

    if (cluster0.length > 0) {
      c0 = cluster0[0].map((_, d) => cluster0.reduce((s, f) => s + f[d], 0) / cluster0.length);
    }
    if (cluster1.length > 0) {
      c1 = cluster1[0].map((_, d) => cluster1.reduce((s, f) => s + f[d], 0) / cluster1.length);
    }
  }

  // Финальное присвоение + сортировка: кластер 0 = меньший
  const raw = new Map<string, 0 | 1>();
  const c0sum = c0.reduce((a, b) => a + b, 0);
  const c1sum = c1.reduce((a, b) => a + b, 0);
  const smallerIs0 = c0sum <= c1sum;

  for (const p of normalized) {
    let d0 = 0, d1 = 0;
    for (let d = 0; d < dims; d++) {
      d0 += (p.features[d] - c0[d]) ** 2;
      d1 += (p.features[d] - c1[d]) ** 2;
    }
    raw.set(p.key, d0 <= d1 ? (smallerIs0 ? 0 : 1) : (smallerIs0 ? 1 : 0));
  }

  return raw;
}
