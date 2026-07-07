// services/sellerEffectiveness.ts
// Расчёт эффективности продавцов на основе D1-данных (index_documents).

import {
  avg,
  stddev,
  linearRegression,
  median,
  mad,
  parseDate,
  dayOfWeek,
  daysBetween,
  buildCategoryMap,
} from "./sharedStats";

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
  vapeShare: number;
  accShare: number;
  stores: SellerStoreMetrics[];
  storeLabels: string[];
  efficiencyVsStore: number;
  riskLevel: "ok" | "warn" | "critical";
  riskReasons: string[];
  segment: "star" | "stable" | "declining" | "critical" | "cashier_robot" | "newcomer" | "attention";
  dailyRevenue: { date: string; value: number }[];
  dow: Record<string, number>;
  rank: number;
  prevRank: number | null;
  deltaRank: number | null;
  prevAvgDailyRev: number | null;
  planCompletion: number | null;
  planDiagnostics: { avgCheckDelta: number; receiptsDelta: number } | null;
  liquidShare: number;
  unknownItemsPct: number;
  categoryBreakdown: { name: string; share: number }[];
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

export interface Recommendation {
  priority: "high" | "medium" | "low";
  sellerUuid: string;
  sellerName: string;
  store: string;
  rule: string;
  action: string;
}

export interface SellerEffectivenessResponse {
  snapshot: KpiSnapshot;
  prevSnapshot: KpiSnapshot | null;
  sellers: SellerMetrics[];
  baselines: StoreBaseline[];
  dowData: DowData[];
  hypotheses: HypothesisResult[];
  recommendations: Recommendation[];
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

/** Нормализация: минимальное число дней для статистической значимости */
const MIN_DAYS_FOR_TREND = 5;

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// Local helpers (only used in this file)
// ──────────────────────────────────────────────

function formatDateLocal(d: Date): string {
  const offset = 3 * 60 * 60 * 1000; // MSK
  const local = new Date(d.getTime() + offset);
  return local.toISOString().slice(0, 10);
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

  // 2. Fetch SELL documents from D1 for both periods
  const [docs, prevDocs] = await Promise.all([
    fetchDocs(db, since, until, params.store),
    fetchDocs(db, prevSince, prevUntil, params.store),
  ]);

  // 3. Compute snapshot
  const snapshot = computeKpiSnapshot(docs);
  const prevSnapshot = prevDocs.length > 0 ? computeKpiSnapshot(prevDocs) : null;

  // 4. Build category map from shopProduct + accessories
  const categoryMap = await buildCategoryMap(db);

  // 5. Build employee-day aggregation
  const empDay = buildEmpDayMap(docs, categoryMap);
  const prevEmpDay = buildEmpDayMap(prevDocs, undefined);

  // 6. Fetch plan + session data
  const planMap = await fetchPlanMap(db, since, until);
  const openSessions = await fetchOpenSessions(db, since, until);

  // 7. Compute per-seller metrics
  const employeeNames = await getEmployeeNames(db);
  const shopNames = await getShopNames(db);

  const sellers = buildSellerMetrics(empDay, prevEmpDay, employeeNames, shopNames, totalDays, planMap, openSessions, docs);

  // 7. Baselines (per store)
  const baselines = buildStoreBaselines(docs, shopNames);

  // 7. DowData
  const dowData = buildDowData(docs, shopNames, totalDays);

  // 8. Hypotheses
  const { hypotheses, recommendations } = buildRecommendations(sellers, dowData, shopNames);

  return { snapshot, prevSnapshot, sellers, baselines, dowData, hypotheses, recommendations };
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

async function getShopNames(db: D1Database): Promise<Record<string, string>> {
  const res = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>();
  const map: Record<string, string> = {};
  for (const r of res.results ?? []) map[r.uuid] = r.name;
  return map;
}

/**
 * Fetch OPEN_SESSION documents with close_date for shift duration calculation.
 * Returns Map<"shopId|userUuid|date", closeDateString>.
 */
async function fetchOpenSessions(
  db: D1Database,
  since: string,
  until: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const res = await db
    .prepare(
      `SELECT shop_id, open_user_uuid, close_date FROM index_documents
       WHERE type = 'OPEN_SESSION' AND close_date >= ? AND close_date <= ?`,
    )
    .bind(since, until + "T23:59:59")
    .all<{ shop_id: string; open_user_uuid: string; close_date: string }>();
  for (const r of res.results ?? []) {
    const date = r.close_date.slice(0, 10);
    map.set(`${r.shop_id}|${r.open_user_uuid}|${date}`, r.close_date);
  }
  return map;
}
/**
 * Returns Map<"shopId|date", planSum>.
 */
async function fetchPlanMap(
  db: D1Database,
  since: string,
  until: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const res = await db
    .prepare(`SELECT shopUuid, date, sum FROM plan WHERE date >= ? AND date <= ?`)
    .bind(since, until)
    .all<{ shopUuid: string; date: string; sum: number }>();
  for (const r of res.results ?? []) {
    map.set(`${r.shopUuid}|${r.date}`, r.sum);
  }
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

interface EmpDayEntry {
  date: string;
  revenue: number;
  checks: number;
  store: string;
  categoryAmounts: Record<string, number>; // category → revenue for this check
  categoryItemCounts: Record<string, number>; // category → item count
  unknownAmount: number; // revenue from unknown categories
}

type EmpDayMap = Map<string, EmpDayEntry[]>;

// ──────────────────────────────────────────────
// parseCheck — unified parsing of one SELL document
// ──────────────────────────────────────────────

interface ParsedCheck {
  revenue: number;
  categoryAmounts: Record<string, number>;
  categoryItemCounts: Record<string, number>;
  unknownAmount: number;
}

function parseCheck(transactionsJson: string, categoryMap?: Map<string, string>): ParsedCheck {
  const result: ParsedCheck = { revenue: 0, categoryAmounts: {}, categoryItemCounts: {}, unknownAmount: 0 };

  let txs: any[];
  try { txs = JSON.parse(transactionsJson); } catch { return result; }
  if (!Array.isArray(txs)) return result;

  // Track position UUID → commodityUuid from REGISTER_POSITION
  // (needed because REFUND may reference position UUID, not commodity)
  const posCommodityMap = new Map<string, string>();

  for (const tx of txs) {
    if (tx.type === "REGISTER_POSITION" && tx.commodityUuid) {
      posCommodityMap.set(tx.uuid, tx.commodityUuid);

      const category = categoryMap?.get(tx.commodityUuid) ?? "unknown";
      const amount = (tx.resultSum ?? tx.sum ?? 0);
      const qty = (tx.quantity ?? 0);

      result.categoryAmounts[category] = (result.categoryAmounts[category] ?? 0) + amount;
      result.categoryItemCounts[category] = (result.categoryItemCounts[category] ?? 0) + qty;
      if (category === "unknown") result.unknownAmount += amount;
    }

    if (tx.type === "PAYMENT" && tx.sum > 0) {
      result.revenue += tx.sum;
    } else if (tx.type === "REFUND" && tx.sum > 0) {
      result.revenue -= tx.sum;
      // Try to find which commodity was refunded
      const refCommodity = posCommodityMap.get(tx.uuid) ?? categoryMap?.get(tx.commodityUuid);
      const refCategory = refCommodity ? (categoryMap?.get(refCommodity) ?? "unknown") : "unknown";
      result.categoryAmounts[refCategory] = (result.categoryAmounts[refCategory] ?? 0) - tx.sum;
    }
  }

  return result;
}

function buildEmpDayMap(docs: DocRow[], categoryMap?: Map<string, string>): EmpDayMap {
  const map: EmpDayMap = new Map();
  for (const doc of docs) {
    const uuid = doc.open_user_uuid || "unknown";
    const date = doc.close_date.slice(0, 10);
    const store = doc.shop_id;

    const parsed = parseCheck(doc.transactions, categoryMap);

    if (!map.has(uuid)) map.set(uuid, []);
    map.get(uuid)!.push({
      date,
      revenue: parsed.revenue,
      checks: 1,
      store,
      categoryAmounts: parsed.categoryAmounts,
      categoryItemCounts: parsed.categoryItemCounts,
      unknownAmount: parsed.unknownAmount,
    });
  }
  return map;
}

function buildSellerMetrics(
  empDay: EmpDayMap,
  prevEmpDay: EmpDayMap,
  employeeNames: Record<string, string>,
  shopNames: Record<string, string>,
  totalDays: number,
  planMap: Map<string, number>,
  openSessions: Map<string, string>,
  docs: DocRow[],
): SellerMetrics[] {
  const sellers: SellerMetrics[] = [];

  // Precompute seller count per (shop, date) for plan distribution
  const sellersPerShopDate = new Map<string, Set<string>>();
  for (const [uuid, entries] of empDay) {
    for (const e of entries) {
      const key = `${e.store}|${e.date}`;
      if (!sellersPerShopDate.has(key)) sellersPerShopDate.set(key, new Set());
      sellersPerShopDate.get(key)!.add(uuid);
    }
  }

  for (const [uuid, entries] of empDay.entries()) {
    const name = employeeNames[uuid] || uuid.slice(0, 8);
    if (entries.length === 0) continue;

    // Aggregate by date
    const byDate = new Map<string, { revenue: number; checks: number; stores: Set<string> }>();
    for (const e of entries) {
      if (!byDate.has(e.date)) byDate.set(e.date, { revenue: 0, checks: 0, stores: new Set() });
      const agg = byDate.get(e.date)!;
      agg.revenue += e.revenue;
      agg.checks += e.checks;
      agg.stores.add(e.store);
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
    }

    // ── Plan completion ──
    let totalPlanRevenue = 0;
    for (const [date, agg] of byDate) {
      for (const store of agg.stores) {
        const planVal = planMap.get(`${store}|${date}`);
        if (planVal !== undefined) {
          const sellerCount = sellersPerShopDate.get(`${store}|${date}`)?.size ?? 1;
          totalPlanRevenue += planVal / Math.max(1, sellerCount);
        }
      }
    }
    const planCompletion =
      totalPlanRevenue > 0 ? Math.round((totalRevenue / totalPlanRevenue) * 100) : null;

    const avgCheck = totalChecks > 0 ? totalRevenue / totalChecks : 0;
    const planDiagnostics =
      totalPlanRevenue > 0 && avgCheck > 0
        ? {
            avgCheckDelta: Math.round(avgCheck - (totalPlanRevenue / totalChecks)),
            receiptsDelta: totalChecks - Math.round(totalPlanRevenue / (avgCheck || 1)),
          }
        : null;
    const revs = [...byDate.values()].map(v => v.revenue);
    const avgDailyRev = avg(revs);
    const std = stddev(revs, avgDailyRev);
    const cv = avgDailyRev > 0 ? (std / avgDailyRev) * 100 : 0;
    const med = median(revs);
    const madVal = mad(revs, med);

    // Trend
    const xs = Array.from({ length: revs.length }, (_, i) => i);
    const reg = linearRegression(xs, revs);
    const relSlopeForDisplay = avgDailyRev > 0 ? reg.slope / avgDailyRev : 0;
    const trendDirection: "↑" | "↓" | "→" =
      relSlopeForDisplay > 0.02 ? "↑" : relSlopeForDisplay < -0.02 ? "↓" : "→";

    // Dow
    const dow: Record<string, number> = {};
    const dowLabels = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    for (let i = 0; i < 7; i++) {
      dow[dowLabels[i]] = dowValues[i].length > 0 ? Math.round(avg(dowValues[i])) : 0;
    }

    // Store labels
    const storeLabels = [...allStores].map(s => shopNames[s] || s).filter(Boolean);

    // Efficiency vs store
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

    // Store metrics
    const stores: SellerStoreMetrics[] = [...byStore.entries()].map(([storeId, storeRevs]) => ({
      store: shopNames[storeId] || storeId,
      days: storeRevs.length,
      avgDailyRev: Math.round(avg(storeRevs)),
      trend: 0,
      cv: avg(storeRevs) > 0 ? Math.round((stddev(storeRevs, avg(storeRevs)) / avg(storeRevs)) * 100) : 0,
    }));

    // ── Category shares ──
    const catAmounts: Record<string, number> = {};
    const catItems: Record<string, number> = {};
    let totalCatAmount = 0;
    let unknownCatAmount = 0;
    for (const e of entries) {
      for (const [cat, amt] of Object.entries(e.categoryAmounts)) {
        catAmounts[cat] = (catAmounts[cat] ?? 0) + amt;
        totalCatAmount += amt;
      }
      for (const [cat, cnt] of Object.entries(e.categoryItemCounts)) {
        catItems[cat] = (catItems[cat] ?? 0) + cnt;
      }
      unknownCatAmount += e.unknownAmount;
    }

    const vapeRevenue = catAmounts["vape"] ?? 0;
    const accRevenue = catAmounts["accessory"] ?? 0;
    const vapeShare = totalCatAmount > 0 ? Math.round((vapeRevenue / totalCatAmount) * 100) : 0;
    const accShare = totalCatAmount > 0 ? Math.round((accRevenue / totalCatAmount) * 100) : 0;
    const unknownPct = totalCatAmount > 0 ? Math.round((unknownCatAmount / totalCatAmount) * 1000) / 10 : 0;

    const categoryBreakdown: { name: string; share: number }[] = Object.entries(catAmounts)
      .filter(([, amt]) => amt > 0)
      .map(([cat, amt]) => ({ name: cat, share: Math.round((amt / totalCatAmount) * 100) }))
      .sort((a, b) => b.share - a.share);

    if (unknownPct > 5) {
      console.warn(`[sellerEffectiveness] unknown category share ${unknownPct}% for ${name}`);
    }

    // ── Segmentation (ordered, after all computations) ──
    const relativeSlope = avgDailyRev > 0 ? reg.slope / avgDailyRev : 0;
    const trendIsSignificant = revs.length >= 7;

    // Consecutive days below 60% plan
    let consecutiveLowPlanDays = 0;
    let maxConsecutiveLowPlanDays = 0;
    for (const d of sortedDates) {
      const agg = byDate.get(d)!;
      let dayPlan = 0;
      for (const s of agg.stores) {
        const pv = planMap.get(`${s}|${d}`);
        if (pv !== undefined) {
          const sc = sellersPerShopDate.get(`${s}|${d}`)?.size ?? 1;
          dayPlan += pv / Math.max(1, sc);
        }
      }
      if (dayPlan > 0 && agg.revenue / dayPlan < 0.6) {
        consecutiveLowPlanDays++;
        maxConsecutiveLowPlanDays = Math.max(maxConsecutiveLowPlanDays, consecutiveLowPlanDays);
      } else {
        consecutiveLowPlanDays = 0;
      }
    }

    let segment: SellerMetrics["segment"] = "attention";
    const riskReasons: string[] = [];
    let riskLevel: "ok" | "warn" | "critical" = "ok";

    const checksPerDay = daysWorked > 0 ? Math.round(totalChecks / daysWorked) : 0;

    if (daysWorked < 10) {
      segment = "newcomer";
      riskReasons.push("Новый продавец (<10 смен)");
    } else if (
      checksPerDay > totalChecks / daysWorked * 1.5 &&
      avgCheck < totalRevenue / totalChecks &&
      vapeShare + accShare < 50
    ) {
      segment = "cashier_robot";
      riskReasons.push("Много чеков, низкий чек и доли категорий");
      riskLevel = "warn";
    } else if (maxConsecutiveLowPlanDays >= 3) {
      segment = "critical";
      riskReasons.push(`План <60% ${maxConsecutiveLowPlanDays} дня подряд`);
      riskLevel = "critical";
    } else if (relativeSlope < -0.02 && trendIsSignificant) {
      segment = "declining";
      riskReasons.push(`Падение ${Math.round(Math.abs(relativeSlope) * 100)}%/день`);
      riskLevel = "warn";
    } else if (planCompletion !== null && planCompletion >= 100) {
      segment = "star";
      riskReasons.push("План выполнен");
    } else if (planCompletion !== null && planCompletion >= 80) {
      segment = "stable";
      riskReasons.push("План выполняется");
    } else {
      riskReasons.push("Требует внимания");
    }

    // ── avgHours / rubPerHour ──
    const SHIFT_BUFFER_MIN = 45;
    let avgHours: number | null = null;
    let rubPerHour: number | null = null;

    // Build check timestamps per (seller, date) for fallback
    const checkTimes = new Map<string, { min: string; max: string }>();
    for (const doc of docs) {
      if (doc.open_user_uuid !== uuid) continue;
      const d = doc.close_date.slice(0, 10);
      const key = `${d}`;
      const existing = checkTimes.get(key);
      if (!existing || doc.close_date < existing.min) {
        checkTimes.set(key, {
          min: existing ? existing.min : doc.close_date,
          max: existing ? existing.max : doc.close_date,
        });
      }
      if (existing && doc.close_date > existing.max) {
        existing.max = doc.close_date;
      }
    }

    const dailyHours: number[] = [];
    for (const d of sortedDates) {
      // Try OPEN_SESSION first
      let sessionHours: number | null = null;
      for (const store of allStores) {
        const sessClose = openSessions.get(`${store}|${uuid}|${d}`);
        if (sessClose) {
          // Session close_date is the end; shift start is typically at store opening
          // We approximate: store opens at 9:00 local, sessClose = end
          try {
            const end = new Date(sessClose);
            const start = new Date(d + "T09:00:00+03:00");
            const diff = (end.getTime() - start.getTime()) / 3600000;
            if (diff > 0 && diff < 16) sessionHours = diff;
          } catch { /* ignore */ }
        }
      }

      // Fallback: MIN/MAX check timestamps
      if (sessionHours === null) {
        const ct = checkTimes.get(d);
        if (ct) {
          try {
            const start = new Date(ct.min);
            const end = new Date(ct.max);
            const diff = (end.getTime() - start.getTime()) / 3600000 + SHIFT_BUFFER_MIN / 60;
            if (diff > 0.5 && diff < 16) sessionHours = diff;
          } catch { /* ignore */ }
        }
      }

      if (sessionHours !== null) dailyHours.push(sessionHours);
    }

    if (dailyHours.length > 0) {
      avgHours = Math.round((dailyHours.reduce((s, h) => s + h, 0) / dailyHours.length) * 10) / 10;
      rubPerHour = avgHours > 0 ? Math.round(avgDailyRev / avgHours) : null;
    }

    sellers.push({
      uuid,
      name,
      daysWorked,
      totalChecks,
      totalRevenue: Math.round(totalRevenue),
      avgDailyRev: Math.round(avgDailyRev),
      avgCheck: Math.round(avgCheck),
      checksPerDay,
      trendSlope: Math.round(reg.slope),
      trendDirection,
      trendR2: Math.round(reg.r2 * 100) / 100,
      cv: Math.round(cv * 10) / 10,
      mad: Math.round(madVal),
      vapeShare,
      accShare,
      liquidShare: 0,
      unknownItemsPct: unknownPct,
      stores,
      storeLabels,
      efficiencyVsStore: Math.round(efficiencyVsStore),
      riskLevel,
      riskReasons,
      segment,
      dailyRevenue,
      dow,
      rank: 0,
      prevRank: null,
      deltaRank: null,
      prevAvgDailyRev: null,
      planCompletion,
      planDiagnostics,
      categoryBreakdown,
      avgHours,
      rubPerHour,
    });
  }

  // Sort by avgDailyRev descending, assign ranks
  sellers.sort((a, b) => b.avgDailyRev - a.avgDailyRev);
  sellers.forEach((s, i) => { s.rank = i + 1; });

  // Prev period ranks
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

function buildRecommendations(sellers: SellerMetrics[], dowData: DowData[], shopNames: Record<string, string>): { hypotheses: HypothesisResult[]; recommendations: Recommendation[] } {
  const hypotheses: HypothesisResult[] = [];
  const recommendations: Recommendation[] = [];
  const threshold = 0.02; // 2% relative slope for trend

  // H1: Weekend drop
  const storesWithDrop = dowData.filter(d => d.weekdayAvg > 0 && d.dropPct > 30);
  if (storesWithDrop.length > 0) {
    hypotheses.push({
      id: "h1-weekend-drop",
      title: "Спад в выходные",
      confirmed: true,
      summary: `${storesWithDrop.map(d => d.store).join(", ")} теряют ~${Math.round(avg(storesWithDrop.map(d => d.dropPct)))}% выручки в Сб-Вс.`,
    });
  }

  // Rules-based recommendations
  for (const s of sellers) {
    if (s.segment === "newcomer") continue;

    const primaryStore = s.stores[0]?.store || "";

    // Compute store-level average of vapeShare+accShare for relative comparison
    const storeComboAvg = new Map<string, { sum: number; count: number }>();
    for (const s of sellers) {
      if (s.daysWorked < 7) continue;
      for (const st of s.stores) {
        const key = st.store;
        if (!storeComboAvg.has(key)) storeComboAvg.set(key, { sum: 0, count: 0 });
        const entry = storeComboAvg.get(key)!;
        entry.sum += s.vapeShare + s.accShare;
        entry.count++;
      }
    }

    // Rule 1: vapeShare+accShare below store average by 20 p.p. & plan met
    if (s.daysWorked >= 7 && s.planCompletion !== null && s.planCompletion >= 80) {
      const storeAvg = storeComboAvg.get(primaryStore);
      const avgCombo = storeAvg && storeAvg.count > 0 ? storeAvg.sum / storeAvg.count : null;
      const sellerCombo = s.vapeShare + s.accShare;
      if (avgCombo !== null && sellerCombo < avgCombo - 20) {
        recommendations.push({
          priority: "medium",
          sellerUuid: s.uuid,
          sellerName: s.name,
          store: primaryStore,
          rule: "low-category-shares",
          action: `Доли вейпов+аксессуаров (${sellerCombo}%) ниже среднего по точке (${Math.round(avgCombo)}%). Рекомендуется тренинг по допродажам.`,
        });
      }
    }

    // Rule 2: Critical deviation — already in segment, add recommendation
    if (s.segment === "critical") {
      recommendations.push({
        priority: "high",
        sellerUuid: s.uuid,
        sellerName: s.name,
        store: primaryStore,
        rule: "critical-plan-deviation",
        action: `План выполняется менее чем на 60% несколько дней подряд. Требуется срочный разговор и пересмотр графика.`,
      });
    }

    // Rule 3: Large rubPerHour difference between stores
    if (s.stores.length >= 2 && s.rubPerHour !== null) {
      const storeRevs = new Map<string, number[]>();
      for (const st of s.stores) {
        // rubPerHour is already aggregated; this is a simplified check
      }
      // Simplified: compare first two stores
      if (s.stores.length >= 2) {
        const rev0 = s.stores[0].avgDailyRev;
        const rev1 = s.stores[1].avgDailyRev;
        if (rev0 > 0 && rev1 > 0) {
          const ratio = rev0 > rev1 ? rev0 / rev1 : rev1 / rev0;
          if (ratio > 1.5) {
            recommendations.push({
              priority: "low",
              sellerUuid: s.uuid,
              sellerName: s.name,
              store: primaryStore,
              rule: "store-disparity",
              action: `Сильный разброс выручки между точками (${rev0 > rev1 ? s.stores[0].store : s.stores[1].store} в ${Math.round(ratio)}x выше). Проверить распределение смен.`,
            });
          }
        }
      }
    }

    // Rule 4: cashier_robot → training
    if (s.segment === "cashier_robot") {
      recommendations.push({
        priority: "medium",
        sellerUuid: s.uuid,
        sellerName: s.name,
        store: primaryStore,
        rule: "cashier-robot",
        action: `Много чеков, но низкий средний чек и доли категорий. Рекомендуется тренинг по консультационным продажам.`,
      });
    }
  }

  return { hypotheses, recommendations };
}
