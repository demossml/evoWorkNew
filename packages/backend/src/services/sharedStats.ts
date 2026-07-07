/**
 * Shared statistics and data helpers used by both sellerAdvancedStats and sellerEffectiveness.
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
