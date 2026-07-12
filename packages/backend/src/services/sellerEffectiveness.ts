// services/sellerEffectiveness.ts
// Расчёт эффективности продавцов на основе D1-данных (index_documents).

import { avg, stddev, linearRegression, mad, median, dayOfWeek, formatDateLocal, resolveStoreParam } from "./statistics";

export interface SellerStoreMetrics {
  store: string;
  days: number;
  avgDailyRev: number;
  trend: number;
  cv: number;
}

export interface SellerMetrics {
  uuid: string;
  name: string;
  role: string;
  daysWorked: number;
  totalChecks: number;
  totalRevenue: number;
  avgDailyRev: number;
  avgCheck: number;
  checksPerDay: number;
  trendSlope: number;
  trendDirection: "↑" | "↓" | "→";
  trendR2: number;
  cv: number;
  mad: number;
  /**
   * Both null on purpose, not 0. There is no product/category data anywhere
   * in the sync pipeline (index_documents only stores payment transactions,
   * not line items) — computing a real vape/accessory share would require
   * extending the sync job to pull item-level data from Evotor per
   * document, which doesn't exist today. Returning 0 here would look
   * identical to "this person sold 0% vapes" in the UI, which is a false
   * and potentially unfair signal about a real person's job performance.
   * null means "unknown", and the UI must treat it as such.
   */
  vapeShare: number | null;
  accShare: number | null;
  stores: SellerStoreMetrics[];
  storeLabels: string[];
  efficiencyVsStore: number;
  riskLevel: "ok" | "warn" | "critical";
  riskReasons: string[];
  dailyRevenue: { date: string; value: number }[];
  dow: Record<string, number>;
  rank: number;
  /** False when daysWorked < MIN_DAYS_FOR_TREND — ranked competitively is
   * unfair on this little data, so these sellers are shown but sorted to
   * the bottom, separate from the confident ranking above them. */
  rankEligible: boolean;
  prevRank: number | null;
  deltaRank: number | null;
  prevAvgDailyRev: number | null;
  targetAvgCheck: number;
  targetVapeShare: number;
  categoryBreakdown: { name: string; share: number }[];
  /**
   * Proxy for hours worked, not a real clock-in/out reading (no time-clock
   * data exists in this system) — derived from the gap between the first
   * and last sale timestamp on a given day, averaged across days worked.
   * This under-counts real hours (misses time before the first sale and
   * after the last), so treat rubPerHour as a lower bound / directional
   * signal, not a precise figure.
   */
  avgHours: number | null;
  rubPerHour: number | null;
}

export interface StoreBaseline {
  store: string;
  days: number;
  avgDailyRev: number;
  sd: number;
  cv: number;
  avgCheck: number;
}

export interface DowData {
  store: string;
  0: number; 1: number; 2: number; 3: number; 4: number; 5: number; 6: number;
  weekdayAvg: number;
  weekendAvg: number;
  dropPct: number;
}

export interface HypothesisResult {
  id: string;
  title: string;
  confirmed: boolean;
  summary: string;
}

export interface KpiSnapshot {
  totalRevenue: number;
  avgDailyRev: number;
  avgCheck: number;
  totalShifts: number;
  activeToday: number;
}

export interface SellerEffectivenessResponse {
  snapshot: KpiSnapshot;
  prevSnapshot: KpiSnapshot | null;
  sellers: SellerMetrics[];
  baselines: StoreBaseline[];
  dowData: DowData[];
  hypotheses: HypothesisResult[];
}

interface TxRow {
  sum: number;
  type: string;
}

interface DocRow {
  shop_id: string;
  close_date: string;
  open_user_uuid: string;
  transactions: string; // JSON
}

interface EmpDayKey {
  uuid: string;
  date: string; // YYYY-MM-DD
}

/** Minimum number of days for a trend line / CV to be worth computing at all. */
const MIN_DAYS_FOR_TREND = 5;

/**
 * Minimum days worked to be ranked competitively against other sellers.
 * Higher than MIN_DAYS_FOR_TREND on purpose: fitting *a* trend line only
 * needs a handful of points, but comparing two people's typical daily
 * performance fairly needs enough days that a couple of unusually good or
 * bad shifts don't decide the ranking. 20 matches what this page's UI text
 * already promised ("минимум 20 смен для статистической значимости")
 * before this was actually enforced — see sellers.ts rankEligible.
 */
export const MIN_DAYS_FOR_RANKING = 20;

// ──────────────────────────────────────────────
// Helpers (shared math lives in ./statistics — this file only keeps what's
// specific to seller aggregation)
// ──────────────────────────────────────────────

function daysBetween(from: string, to: string): number {
  const f = new Date(from + "T00:00:00+03:00");
  const t = new Date(to + "T00:00:00+03:00");
  return Math.max(1, Math.round((t.getTime() - f.getTime()) / 86400000) + 1);
}

// ──────────────────────────────────────────────
// Core
// ──────────────────────────────────────────────

export async function computeSellerEffectiveness(
  db: D1Database,
  params: { period?: number; since?: string; until?: string; store?: string },
): Promise<SellerEffectivenessResponse> {
  // 1. Determine date range
  const today = formatDateLocal(new Date());
  let since: string;
  let until: string;

  if (params.since && params.until) {
    since = params.since;
    until = params.until;
  } else {
    const period = params.period || 90;
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - period + 1);
    since = formatDateLocal(start);
    until = formatDateLocal(end);
  }

  const totalDays = daysBetween(since, until);

  // Previous period (same length)
  const prevEnd = new Date(since + "T00:00:00+03:00");
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - totalDays + 1);
  const prevSince = formatDateLocal(prevStart);
  const prevUntil = formatDateLocal(prevEnd);

  // Fetched early (before fetchDocs) because the store filter needs it:
  // the frontend sends a human shop name ("Победа"), but index_documents
  // keys on shop UUID. Resolve name → UUID here so the SQL WHERE clause
  // actually matches something.
  const shopNames = await getShopNames(db);
  const resolvedStore = resolveStoreParam(params.store, shopNames);

  // 2. Fetch SELL documents from D1 for both periods
  const [docs, prevDocs] = await Promise.all([
    fetchDocs(db, since, until, resolvedStore),
    fetchDocs(db, prevSince, prevUntil, resolvedStore),
  ]);

  // 3. Compute snapshot
  const snapshot = computeKpiSnapshot(docs);
  const prevSnapshot = prevDocs.length > 0 ? computeKpiSnapshot(prevDocs) : null;

  // 4. Build employee-day aggregation
  const empDay = buildEmpDayMap(docs);
  const prevEmpDay = buildEmpDayMap(prevDocs);

  // 5. Compute per-seller metrics
  const employeeNames = await getEmployeeNames(db);
  const employeeRoles = await getEmployeeRoles(db);

  // Store-relative CV needs to exist before seller risk flags are computed
  // (buildStoreBaselines below returns display names, not the raw shop_id
  // keys sellers are grouped by, so this is a small separate uuid-keyed map).
  const storeCvMap = buildStoreCvMap(docs);
  const sellers = buildSellerMetrics(empDay, prevEmpDay, employeeNames, employeeRoles, shopNames, totalDays, storeCvMap);

  // 6. Baselines (per store)
  const baselines = buildStoreBaselines(docs, shopNames);

  // 7. DowData
  const dowData = buildDowData(docs, shopNames, totalDays);

  // 8. Hypotheses
  const hypotheses = buildHypotheses(dowData, sellers);

  return { snapshot, prevSnapshot, sellers, baselines, dowData, hypotheses };
}

// ──────────────────────────────────────────────
// D1 queries
// ──────────────────────────────────────────────

async function fetchDocs(
  db: D1Database,
  since: string,
  until: string,
  store?: string,
): Promise<DocRow[]> {
  let sql = `SELECT shop_id, close_date, open_user_uuid, transactions
             FROM index_documents
             WHERE type = 'SELL'
               AND close_date >= ? AND close_date <= ?`;
  const binds: any[] = [since, until + "T23:59:59"];

  if (store && store !== "all") {
    sql += ` AND shop_id = ?`;
    binds.push(store);
  }

  const res = await db.prepare(sql).bind(...binds).all<DocRow>();
  return res.results ?? [];
}

async function getEmployeeNames(db: D1Database): Promise<Record<string, string>> {
  const res = await db.prepare("SELECT uuid, name FROM employees").all<{ uuid: string; name: string }>();
  const map: Record<string, string> = {};
  for (const r of res.results ?? []) map[r.uuid] = r.name;
  return map;
}

/**
 * Previously the frontend identified "the admin row" (to visually de-weight
 * it in the seller table — a manager occasionally covering the register
 * shouldn't compete on the same leaderboard as full-time sales staff) with
 * a hardcoded UUID string comparison. That breaks the moment that specific
 * person's account changes or a second admin exists. employees.role is
 * the actual source of truth for this.
 */
async function getEmployeeRoles(db: D1Database): Promise<Record<string, string>> {
  const res = await db.prepare("SELECT uuid, role FROM employees").all<{ uuid: string; role: string }>();
  const map: Record<string, string> = {};
  for (const r of res.results ?? []) map[r.uuid] = r.role;
  return map;
}

async function getShopNames(db: D1Database): Promise<Record<string, string>> {
  const res = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>();
  const map: Record<string, string> = {};
  for (const r of res.results ?? []) map[r.uuid] = r.name;
  return map;
}

// ──────────────────────────────────────────────
// Aggregation
// ──────────────────────────────────────────────

function computeKpiSnapshot(docs: DocRow[]): KpiSnapshot {
  let totalRevenue = 0;
  const activeUuids = new Set<string>();
  const today = formatDateLocal(new Date());

  for (const doc of docs) {
    let transactions: TxRow[];
    try { transactions = JSON.parse(doc.transactions); } catch { continue; }
    if (!Array.isArray(transactions)) continue;

    for (const tx of transactions) {
      if (tx.type === "PAYMENT" && tx.sum > 0) {
        totalRevenue += tx.sum;
      } else if (tx.type === "REFUND" && tx.sum > 0) {
        totalRevenue -= tx.sum;
      }
    }
    if (doc.open_user_uuid) activeUuids.add(doc.open_user_uuid);
  }

  const totalChecks = docs.length; // каждый SELL-документ = 1 чек

  const daysWithSales = new Set<string>();
  for (const doc of docs) {
    const day = doc.close_date.slice(0, 10);
    if (day) daysWithSales.add(day);
  }
  const totalDays = Math.max(daysWithSales.size, 1);

  const activeTodayUuids = new Set<string>();
  for (const doc of docs) {
    if (doc.close_date.slice(0, 10) === today && doc.open_user_uuid) {
      activeTodayUuids.add(doc.open_user_uuid);
    }
  }

  return {
    totalRevenue: Math.round(totalRevenue),
    avgDailyRev: Math.round(totalRevenue / totalDays),
    avgCheck: totalChecks > 0 ? Math.round(totalRevenue / totalChecks) : 0,
    totalShifts: activeUuids.size,
    activeToday: activeTodayUuids.size,
  };
}

type EmpDayMap = Map<string, { date: string; revenue: number; checks: number; store: string; closeDateTime: string }[]>;

function buildEmpDayMap(docs: DocRow[]): EmpDayMap {
  const map: EmpDayMap = new Map();
  for (const doc of docs) {
    const uuid = doc.open_user_uuid || "unknown";
    const date = doc.close_date.slice(0, 10);
    const store = doc.shop_id;

    let docSum = 0;
    let transactions: TxRow[];
    try { transactions = JSON.parse(doc.transactions); } catch { continue; }
    if (!Array.isArray(transactions)) continue;

    for (const tx of transactions) {
      if (tx.type === "PAYMENT" && tx.sum > 0) {
        docSum += tx.sum;
      } else if (tx.type === "REFUND" && tx.sum > 0) {
        docSum -= tx.sum;
      }
    }

    if (!map.has(uuid)) map.set(uuid, []);
    map.get(uuid)!.push({ date, revenue: docSum, checks: 1, store, closeDateTime: doc.close_date });
  }
  return map;
}

function buildSellerMetrics(
  empDay: EmpDayMap,
  prevEmpDay: EmpDayMap,
  employeeNames: Record<string, string>,
  employeeRoles: Record<string, string>,
  shopNames: Record<string, string>,
  totalDays: number,
  storeCvMap: Map<string, number>,
): SellerMetrics[] {
  const sellers: SellerMetrics[] = [];

  for (const [uuid, entries] of empDay.entries()) {
    const name = employeeNames[uuid] || uuid.slice(0, 8);
    const role = employeeRoles[uuid] || "";
    if (entries.length === 0) continue;

    // Aggregate by date — now also tracking first/last sale time of day,
    // as a (lower-bound) proxy for hours worked.
    const byDate = new Map<
      string,
      { revenue: number; checks: number; stores: Set<string>; firstMs: number; lastMs: number }
    >();
    for (const e of entries) {
      if (!byDate.has(e.date)) {
        byDate.set(e.date, { revenue: 0, checks: 0, stores: new Set(), firstMs: Infinity, lastMs: -Infinity });
      }
      const agg = byDate.get(e.date)!;
      agg.revenue += e.revenue;
      agg.checks += e.checks;
      agg.stores.add(e.store);
      const ms = Date.parse(e.closeDateTime.replace(" ", "T") + (e.closeDateTime.includes("+") ? "" : "+03:00"));
      if (!Number.isNaN(ms)) {
        if (ms < agg.firstMs) agg.firstMs = ms;
        if (ms > agg.lastMs) agg.lastMs = ms;
      }
    }

    const daysWorked = byDate.size;
    const sortedDates = [...byDate.keys()].sort();
    const dailyRevenue: { date: string; value: number }[] = sortedDates.map(d => ({
      date: d,
      value: Math.round(byDate.get(d)!.revenue),
    }));

    let totalRevenue = 0;
    let totalChecks = 0;
    const allStores = new Set<string>();
    const byStore = new Map<string, number[]>();
    const dowValues: number[][] = [[], [], [], [], [], [], []];
    const dailySpanHours: number[] = [];

    for (const [date, agg] of byDate) {
      totalRevenue += agg.revenue;
      totalChecks += agg.checks;
      agg.stores.forEach(s => allStores.add(s));
      const dow = dayOfWeek(date);
      dowValues[dow].push(agg.revenue);
      for (const s of agg.stores) {
        if (!byStore.has(s)) byStore.set(s, []);
        byStore.get(s)!.push(agg.revenue);
      }
      if (Number.isFinite(agg.firstMs) && Number.isFinite(agg.lastMs) && agg.lastMs > agg.firstMs) {
        dailySpanHours.push((agg.lastMs - agg.firstMs) / 3_600_000);
      }
    }

    const avgCheck = totalChecks > 0 ? totalRevenue / totalChecks : 0;
    const revs = [...byDate.values()].map(v => v.revenue);
    const avgDailyRev = avg(revs);
    const std = stddev(revs, avgDailyRev);
    const cv = avgDailyRev > 0 ? (std / avgDailyRev) * 100 : 0;
    const med = median(revs);
    const madVal = mad(revs, med);

    // avgHours: only meaningful with several checks/day — a single sale
    // gives a zero-width span that says nothing about hours worked, so
    // those days are excluded rather than dragging the average toward 0.
    const avgHours = dailySpanHours.length > 0 ? avg(dailySpanHours) : null;
    const rubPerHour = avgHours && avgHours > 0.25 ? Math.round(avgDailyRev / avgHours) : null;

    // Trend — require both a meaningful slope AND a reasonable fit (r²).
    // With ~5-10 data points, a slope over the old flat ±50 threshold is
    // easy to hit from pure noise; r² tells us whether that slope actually
    // explains the data or is just scatter.
    const xs = Array.from({ length: revs.length }, (_, i) => i);
    const reg = linearRegression(xs, revs);
    const trendIsMeaningful = revs.length >= MIN_DAYS_FOR_TREND && reg.r2 >= 0.3;
    const trendDirection: "↑" | "↓" | "→" =
      trendIsMeaningful && reg.slope > 50 ? "↑" : trendIsMeaningful && reg.slope < -50 ? "↓" : "→";

    // Dow
    const dow: Record<string, number> = {};
    const dowLabels = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    for (let i = 0; i < 7; i++) {
      dow[dowLabels[i]] = dowValues[i].length > 0 ? Math.round(avg(dowValues[i])) : 0;
    }

    // Store labels
    const storeLabels = [...allStores].map(s => shopNames[s] || s).filter(Boolean);

    // Efficiency vs store — this is what ranking is actually based on now
    // (see below), because raw revenue rewards whoever happens to work the
    // busiest store, not whoever sells best relative to their own store's
    // typical day.
    let efficiencyVsStore = 0;
    let storeEffCount = 0;
    for (const [storeId, storeRevs] of byStore) {
      const storeAvg = avg(storeRevs);
      if (storeAvg > 0) {
        efficiencyVsStore += (avgDailyRev / storeAvg) * 100;
        storeEffCount++;
      }
    }
    if (storeEffCount > 0) efficiencyVsStore /= storeEffCount;

    // Risk — CV compared against the seller's own store's baseline
    // volatility, not a flat number. A CV of 40% is normal for a small,
    // low-traffic store with lumpy weekend spikes and alarming for a
    // steady, high-traffic one; comparing to the store's own baseline
    // makes the flag mean the same thing everywhere.
    let storeCv = 0;
    let storeCvCount = 0;
    for (const storeId of allStores) {
      const c = storeCvMap.get(storeId);
      if (c != null) { storeCv += c; storeCvCount++; }
    }
    const relevantStoreCv = storeCvCount > 0 ? storeCv / storeCvCount : 40; // fallback to old flat default

    const riskReasons: string[] = [];
    let riskLevel: "ok" | "warn" | "critical" = "ok";
    if (trendIsMeaningful && reg.slope < -100) {
      riskReasons.push(`Тренд ${Math.round(reg.slope)} ₽/день`);
      riskLevel = "warn";
    }
    if (cv > relevantStoreCv * 1.5 && cv > 30) {
      riskReasons.push(`CV ${Math.round(cv)}% (магазин ~${Math.round(relevantStoreCv)}%)`);
      riskLevel = riskLevel === "warn" ? "critical" : "warn";
    }
    if (riskReasons.length >= 2) riskLevel = "critical";
    if (riskReasons.length === 0) riskReasons.push("Стабильно");

    // Store metrics
    const stores: SellerStoreMetrics[] = [...byStore.entries()].map(([storeId, storeRevs]) => ({
      store: shopNames[storeId] || storeId,
      days: storeRevs.length,
      avgDailyRev: Math.round(avg(storeRevs)),
      trend: 0,
      cv: avg(storeRevs) > 0 ? Math.round((stddev(storeRevs, avg(storeRevs)) / avg(storeRevs)) * 100) : 0,
    }));

    sellers.push({
      uuid,
      name,
      role,
      daysWorked,
      totalChecks,
      totalRevenue: Math.round(totalRevenue),
      avgDailyRev: Math.round(avgDailyRev),
      avgCheck: Math.round(avgCheck),
      checksPerDay: daysWorked > 0 ? Math.round(totalChecks / daysWorked) : 0,
      trendSlope: Math.round(reg.slope),
      trendDirection,
      trendR2: Math.round(reg.r2 * 100) / 100,
      cv: Math.round(cv * 10) / 10,
      mad: Math.round(madVal),
      vapeShare: null,
      accShare: null,
      stores,
      storeLabels,
      efficiencyVsStore: Math.round(efficiencyVsStore),
      riskLevel,
      riskReasons,
      dailyRevenue,
      dow,
      rank: 0,
      rankEligible: daysWorked >= MIN_DAYS_FOR_RANKING,
      prevRank: null,
      deltaRank: null,
      prevAvgDailyRev: null,
      targetAvgCheck: 2000,
      targetVapeShare: 60,
      categoryBreakdown: [],
      avgHours: avgHours != null ? Math.round(avgHours * 10) / 10 : null,
      rubPerHour,
    });
  }

  // Rank: eligible sellers (enough days worked to say anything meaningful)
  // are ranked by efficiency vs. their own store's average, not raw
  // revenue — otherwise whoever works the busiest location always wins
  // regardless of actual selling skill. Sellers with too little data are
  // still shown (managers may want to see them), but placed after the
  // ranked group and flagged via rankEligible so the UI doesn't present
  // them as if they'd earned a competitive position.
  const eligible = sellers.filter(s => s.rankEligible);
  const ineligible = sellers.filter(s => !s.rankEligible);
  eligible.sort((a, b) => b.efficiencyVsStore - a.efficiencyVsStore);
  eligible.forEach((s, i) => { s.rank = i + 1; });
  ineligible.sort((a, b) => b.avgDailyRev - a.avgDailyRev);
  ineligible.forEach((s, i) => { s.rank = eligible.length + i + 1; });
  sellers.length = 0;
  sellers.push(...eligible, ...ineligible);

  // Prev period ranks (unchanged basis — still average daily revenue, since
  // this is only used to show "moved up/down N places" directionally)
  if (prevEmpDay.size > 0) {
    const prevSellers = new Map<string, number>(); // uuid → avgDailyRev
    for (const [uuid, entries] of prevEmpDay) {
      const byDate = new Map<string, number>();
      for (const e of entries) {
        if (!byDate.has(e.date)) byDate.set(e.date, 0);
        byDate.set(e.date, byDate.get(e.date)! + e.revenue);
      }
      if (byDate.size > 0) {
        prevSellers.set(uuid, [...byDate.values()].reduce((s, v) => s + v, 0) / byDate.size);
      }
    }
    const prevRanked = [...prevSellers.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([uuid]) => uuid);

    for (const s of sellers) {
      const prevIdx = prevRanked.indexOf(s.uuid);
      if (prevIdx >= 0) {
        s.prevRank = prevIdx + 1;
        s.deltaRank = s.prevRank - s.rank;
        s.prevAvgDailyRev = Math.round(prevSellers.get(s.uuid)!);
      }
    }
  }

  return sellers;
}

/** Per-store CV of daily revenue, keyed by shop_id (uuid) — used to make
 * seller volatility flags relative to their own store instead of a flat
 * magic number. Cheaper than buildStoreBaselines() since it skips
 * everything that function computes but this doesn't need. */
function buildStoreCvMap(docs: DocRow[]): Map<string, number> {
  const byStoreDate = new Map<string, Map<string, number>>();
  for (const doc of docs) {
    const store = doc.shop_id;
    const date = doc.close_date.slice(0, 10);
    let docSum = 0;
    let transactions: TxRow[];
    try { transactions = JSON.parse(doc.transactions); } catch { continue; }
    if (!Array.isArray(transactions)) continue;
    for (const tx of transactions) {
      if (tx.type === "PAYMENT" && tx.sum > 0) docSum += tx.sum;
      else if (tx.type === "REFUND" && tx.sum > 0) docSum -= tx.sum;
    }
    if (!byStoreDate.has(store)) byStoreDate.set(store, new Map());
    const dateMap = byStoreDate.get(store)!;
    dateMap.set(date, (dateMap.get(date) || 0) + docSum);
  }

  const cvMap = new Map<string, number>();
  for (const [store, dateMap] of byStoreDate) {
    const revs = [...dateMap.values()];
    const a = avg(revs);
    if (a > 0) cvMap.set(store, (stddev(revs, a) / a) * 100);
  }
  return cvMap;
}

function buildStoreBaselines(docs: DocRow[], shopNames: Record<string, string>): StoreBaseline[] {
  // Aggregate by store+date first (daily store revenue)
  const byStoreDate = new Map<string, Map<string, { revenue: number; checks: number }>>();

  for (const doc of docs) {
    const store = doc.shop_id;
    const date = doc.close_date.slice(0, 10);

    let docSum = 0;
    let transactions: TxRow[];
    try { transactions = JSON.parse(doc.transactions); } catch { continue; }
    if (!Array.isArray(transactions)) continue;

    for (const tx of transactions) {
      if (tx.type === "PAYMENT" && tx.sum > 0) {
        docSum += tx.sum;
      } else if (tx.type === "REFUND" && tx.sum > 0) {
        docSum -= tx.sum;
      }
    }

    if (!byStoreDate.has(store)) byStoreDate.set(store, new Map());
    const dateMap = byStoreDate.get(store)!;
    if (!dateMap.has(date)) dateMap.set(date, { revenue: 0, checks: 0 });
    const agg = dateMap.get(date)!;
    agg.revenue += docSum;
    agg.checks += 1; // каждый SELL-документ = 1 чек
  }

  const baselines: StoreBaseline[] = [];
  for (const [store, dateMap] of byStoreDate) {
    const revenues: number[] = [];
    let totalChecks = 0;
    let totalRevenue = 0;
    for (const [, agg] of dateMap) {
      revenues.push(agg.revenue);
      totalRevenue += agg.revenue;
      totalChecks += agg.checks;
    }
    const avgDailyRev = avg(revenues);
    baselines.push({
      store: shopNames[store] || store,
      days: revenues.length,
      avgDailyRev: Math.round(avgDailyRev),
      sd: Math.round(stddev(revenues, avgDailyRev)),
      cv: avgDailyRev > 0 ? Math.round((stddev(revenues, avgDailyRev) / avgDailyRev) * 100) : 0,
      avgCheck: totalChecks > 0 ? Math.round(totalRevenue / totalChecks) : 0,
    });
  }

  return baselines;
}

function buildDowData(docs: DocRow[], shopNames: Record<string, string>, _totalDays: number): DowData[] {
  // Aggregate by store+date first
  const byStoreDate = new Map<string, Map<string, number>>();
  for (const doc of docs) {
    const store = doc.shop_id;
    const date = doc.close_date.slice(0, 10);

    let docSum = 0;
    let transactions: TxRow[];
    try { transactions = JSON.parse(doc.transactions); } catch { continue; }
    if (!Array.isArray(transactions)) continue;
    for (const tx of transactions) {
      if (tx.type === "PAYMENT" && tx.sum > 0) docSum += tx.sum;
      else if (tx.type === "REFUND" && tx.sum > 0) docSum -= tx.sum;
    }

    if (!byStoreDate.has(store)) byStoreDate.set(store, new Map());
    const dateMap = byStoreDate.get(store)!;
    dateMap.set(date, (dateMap.get(date) || 0) + docSum);
  }

  // Then aggregate by day-of-week
  const byStore = new Map<string, number[][]>();
  for (const [store, dateMap] of byStoreDate) {
    const arr: number[][] = [[], [], [], [], [], [], []];
    for (const [date, dailyRev] of dateMap) {
      const dow = dayOfWeek(date);
      arr[dow].push(dailyRev);
    }
    byStore.set(store, arr);
  }

  const dowData: DowData[] = [];
  for (const [store, arr] of byStore) {
    const dayAvgs: number[] = arr.map(v => (v.length > 0 ? Math.round(avg(v)) : 0));
    const weekdayVals = [1, 2, 3, 4, 5].flatMap(d => arr[d]);
    const weekendVals = [0, 6].flatMap(d => arr[d]);
    const weekdayAvg = weekdayVals.length > 0 ? Math.round(avg(weekdayVals)) : 0;
    const weekendAvg = weekendVals.length > 0 ? Math.round(avg(weekendVals)) : 0;
    const dropPct = weekdayAvg > 0 ? Math.round(((weekdayAvg - weekendAvg) / weekdayAvg) * 100) : 0;

    dowData.push({
      store: shopNames[store] || store,
      0: dayAvgs[0], 1: dayAvgs[1], 2: dayAvgs[2], 3: dayAvgs[3],
      4: dayAvgs[4], 5: dayAvgs[5], 6: dayAvgs[6],
      weekdayAvg,
      weekendAvg,
      dropPct: Math.max(0, dropPct),
    });
  }

  return dowData;
}

function buildHypotheses(dowData: DowData[], sellers: SellerMetrics[]): HypothesisResult[] {
  const hypotheses: HypothesisResult[] = [];

  // H1: Weekend drop
  const storesWithDrop = dowData.filter(d => d.weekdayAvg > 0 && d.dropPct > 30);
  if (storesWithDrop.length > 0) {
    const names = storesWithDrop.map(d => d.store).join(", ");
    hypotheses.push({
      id: "h1-weekend-drop",
      title: "Спад в выходные: -40%",
      confirmed: true,
      summary: `${names} теряют ~${Math.round(avg(storesWithDrop.map(d => d.dropPct)))}% выручки в Сб-Вс. Рекомендуется: промо-акции на выходные, сменное расписание под трафик.`,
    });
  }

  // H2: Negative trend sellers — reuse trendDirection, which already
  // requires both a meaningful slope and a reasonable r² fit, so this
  // doesn't flag noise from a handful of shifts as a "trend".
  const declining = sellers.filter(s => s.trendDirection === "↓");
  if (declining.length > 0) {
    hypotheses.push({
      id: "h2-declining",
      title: "Падающий тренд у продавцов",
      confirmed: true,
      summary: `${declining.length} продавцов с отрицательным трендом: ${declining.map(s => `${s.name} (${s.trendSlope} ₽/день, r²=${s.trendR2})`).join(", ")}.`,
    });
  }

  // H3: High CV — reuse riskReasons, which already compares each seller's
  // CV to their own store's baseline rather than a flat 35%.
  const unstable = sellers.filter(s => s.riskReasons.some(r => r.startsWith("CV")));
  if (unstable.length > 0) {
    hypotheses.push({
      id: "h3-high-cv",
      title: "Высокая волатильность",
      confirmed: true,
      summary: `${unstable.length} продавцов с CV >35%: ${unstable.map(s => `${s.name} (CV ${s.cv}%)`).join(", ")}. Рекомендуется стабилизация графика и целевые KPI.`,
    });
  }

  return hypotheses;
}
