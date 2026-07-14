/**
 * sellerAdvancedStats.ts
 *
 * Computes SellerDNAProfile[] from D1 data (index_documents).
 * Used by GET /api/sellers/advanced-stats.
 *
 * Metrics computed:
 *   - Revenue, checks, avg check, accShare, rubPerHour, avgHours
 *   - Trend (linear regression with R² + normalized %/week)
 *   - Dead time (% + slots, merged adjacent, 15-min precision)
 *   - Peak hours (top-2 by revenue, efficiency vs store avg)
 *   - Stability (revenueCV, checkCV, attendanceRate, lateOpenRate)
 *   - First-30-min effect (revenue in first 30 min / avg 30-min segment)
 *   - Discount share (% of checks using promotions)
 *   - DNA score + label + strengths/weaknesses
 */

import type { D1Database } from "@cloudflare/workers-types";
import { getSellerDailyMetrics, getShopSchedules, type ShopScheduleRow } from "../sync/db";
import {
  avg,
  stddev,
  linearRegression,
  parseHour,
  dayOfWeek,
  parseDate,
  minutesBetween,
  daysBetween,
  buildCategoryMap,
} from "./sharedStats";

// ===================== Store name → UUID resolution =====================

async function getShopNames(db: D1Database): Promise<Record<string, string>> {
  const res = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>();
  const map: Record<string, string> = {};
  for (const r of res.results ?? []) map[r.uuid] = r.name;
  return map;
}

function resolveStoreParam(
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

// ===================== Types (mirrors frontend) =====================

interface HourlyPoint {
  hour: number;
  revenue: number;
  checks: number;
}

interface DailyPoint {
  date: string;
  value: number;
}

interface DeadTimeSlot {
  from: string;
  to: string;
  minutes: number;
}

interface PeakHour {
  from: string;
  to: string;
  revenue: number;
  shareOfDay: number;
}

interface ServiceQuality {
  avgCheckScore: number;
  conversionScore: number;
  liquidShareScore: number;
  total: number;
}

interface StabilityMetrics {
  revenueCV: number;
  checkCV: number;
  attendanceRate: number;
  lateOpenRate: number;
}

type DNALabel = "Охотник" | "Стабильный" | "Одиночка" | "Восходящий" | "Проблемный";

interface SellerDNAProfile {
  uuid: string;
  name: string;
  daysWorked: number;
  totalRevenue: number;
  avgCheck: number;
  accShare: number;
  rubPerHour: number | null;
  avgHours: number | null;
  trend: "up" | "down" | "stable";
  trendSlope: number;
  rank: number;
  overallScore: number;
  deadTimePct: number;
  deadTimeSlots: DeadTimeSlot[];
  peakHours: PeakHour[];
  peakHourK: number;
  peakHourEfficiency: number;
  revenuPerSquareMeter: number | null;
  serviceQuality: ServiceQuality;
  stability: StabilityMetrics;
  /** Новые метрики дисциплины */
  avgLateMinutes: number;       // среднее опоздание в минутах (по shop_schedules)
  lateRate: number;             // % дней с опозданием > 0
  onTimeRate: number;           // % дней без опозданий
  firstCheckDelay: number | null; // среднее время от открытия по графику до первого чека (мин)
  totalAbsentMinutes: number;   // суммарное время absent-слотов (мин)
  absentRate: number;           // % рабочего времени в absent-слотах
  strengths: string[];
  weaknesses: string[];
  dnaLabel: DNALabel;
  dailyRevenue: DailyPoint[];
  hourlyRevenue: HourlyPoint[];
  storeAvgHourlyRevenue: HourlyPoint[];
  aiInsights: string[];
}

/** Lite profile returned by weekday-comparison endpoint */
export interface WeekdayCompareProfile {
  uuid: string;
  name: string;
  daysWorked: number;       // how many matching weekdays they worked
  totalRevenue: number;
  avgCheck: number;
  accShare: number;
  rubPerHour: number | null;
  avgHours: number | null;
  deadTimePct: number;
  hourlyRevenue: HourlyPoint[];
}

export interface WeekdayCompareResult {
  weekday: number;           // 0=Sun..6=Sat
  dates: string[];           // the actual dates queried
  sellers: WeekdayCompareProfile[];
  recommendation?: {
    message: string;
    bestWeekday?: number;
    bestWeekdayLabel?: string;
    bestCount?: number;
  };
}

/** Per-weekday aggregated stats for a single seller */
export interface WeekdayBreakdown {
  days: number;
  totalRevenue: number;
  totalChecks: number;
  avgCheck: number;
  rubPerHour: number | null;
}

export type WeekdayBreakdownMap = Record<number, WeekdayBreakdown>;

// ===================== D1 row types =====================

interface DocRow {
  shop_id: string;
  close_date: string;
  open_user_uuid: string;
  transactions: string;
}

interface SessionRow {
  shop_id: string;
  open_user_uuid: string;
  close_date: string;
}

// ===================== Display helpers =====================

function parseTime(closeDate: string): string {
  // "2026-07-05T17:23:45" → "17:23"
  return closeDate.slice(11, 16);
}

// ===================== Parse check =====================

interface CheckResult {
  revenue: number;
  vapeRevenue: number;
  accRevenue: number;
  hasDiscount: boolean;
  discountAmount: number;
}

function parseCheck(
  transactionsJson: string,
  categoryMap: Map<string, string>,
): CheckResult {
  const result: CheckResult = {
    revenue: 0,
    vapeRevenue: 0,
    accRevenue: 0,
    hasDiscount: false,
    discountAmount: 0,
  };

  let txs: any[];
  try {
    txs = JSON.parse(transactionsJson);
  } catch {
    return result;
  }
  if (!Array.isArray(txs)) return result;

  for (const tx of txs) {
    // Position registration → classify product category
    if (tx.type === "REGISTER_POSITION" && tx.commodityUuid) {
      const category = categoryMap.get(tx.commodityUuid) ?? "other";
      const amount = tx.resultSum ?? tx.sum ?? 0;
      if (category === "vape") result.vapeRevenue += amount;
      if (category === "accessory") result.accRevenue += amount;

      // Check for discount on this position
      const discount = tx.discount ?? tx.discountSum ?? 0;
      if (discount > 0) {
        result.hasDiscount = true;
        result.discountAmount += discount;
      }
    }

    // Explicit DISCOUNT transaction (Evotor)
    if (tx.type === "DISCOUNT" && (tx.sum ?? 0) > 0) {
      result.hasDiscount = true;
      result.discountAmount += tx.sum ?? 0;
    }

    // PAYMENT / REFUND → net revenue
    if (tx.type === "PAYMENT" && tx.sum > 0) {
      result.revenue += tx.sum;
    } else if (tx.type === "REFUND" && tx.sum > 0) {
      result.revenue -= tx.sum;
    }
  }

  return result;
}

// ===================== Fetchers =====================

async function fetchDocs(
  db: D1Database,
  since: string,
  until: string,
  shopId?: string,
): Promise<DocRow[]> {
  let sql = `SELECT shop_id, close_date, open_user_uuid, transactions
             FROM index_documents
             WHERE type = 'SELL'
               AND close_date >= ? AND close_date <= ?`;
  const binds: any[] = [since, until + "T23:59:59"];

  if (shopId && shopId !== "all") {
    sql += ` AND shop_id = ?`;
    binds.push(shopId);
  }

  const res = await db.prepare(sql).bind(...binds).all<DocRow>();
  return res.results ?? [];
}

async function fetchSessions(
  db: D1Database,
  since: string,
  until: string,
  shopId?: string,
): Promise<Map<string, SessionRow[]>> {
  let sql = `SELECT shop_id, open_user_uuid, close_date
             FROM index_documents
             WHERE type = 'OPEN_SESSION'
               AND close_date >= ? AND close_date <= ?`;
  const binds: any[] = [since, until + "T23:59:59"];

  if (shopId && shopId !== "all") {
    sql += ` AND shop_id = ?`;
    binds.push(shopId);
  }

  const res = await db
    .prepare(sql)
    .bind(...binds)
    .all<SessionRow>();

  const map = new Map<string, SessionRow[]>();
  for (const r of res.results ?? []) {
    const key = `${r.open_user_uuid}|${r.close_date.slice(0, 10)}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return map;
}

async function fetchEmployeeNames(
  db: D1Database,
): Promise<Record<string, string>> {
  const res = await db
    .prepare("SELECT uuid, name FROM employees")
    .all<{ uuid: string; name: string }>();
  const map: Record<string, string> = {};
  for (const r of res.results ?? []) map[r.uuid] = r.name;
  return map;
}

// ===================== Aggregation data structures =====================

interface DayAgg {
  date: string;
  revenue: number;
  checks: number;
  hours: number;
  store: string;
  /** First check timestamp (parsed close_date), earliest = start of selling */
  firstCheckTs: string | null;
  /** Count of checks with discounts */
  discountChecks: number;
  /** Total discount amount */
  discountAmount: number;
  /** Total accessory (non-vape) revenue */
  accRevenue: number;
  /** Минуты от открытия смены до первого чека (из кеша) */
  firstCheckDelay: number;
  /** 0..1 — вероятность длительного отсутствия (из кеша) */
  absentProbability: number;
}

interface HourAgg {
  revenue: number;
  checks: number;
}

interface DaySession {
  /** Earliest session open time (ISO) */
  openTime: string | null;
  /** Latest session close time (ISO) */
  closeTime: string | null;
  /** Total shift minutes from session boundaries */
  shiftMinutes: number;
}

// ===================== Dead time computation =====================

/**
 * Compute dead time from hourly activity within session boundaries.
 *
 * Algorithm:
 *   1. Determine actual shift window per day from OPEN_SESSION records
 *   2. Within that window, check 15-min slots — if no checks in that slot → dead
 *   3. Merge adjacent dead slots
 *   4. deadTimePct = dead minutes / total shift minutes
 */
function computeDeadTime(
  hrMap: Map<number, HourAgg>,
  daySessions: DaySession[],
): { deadTimePct: number; deadTimeSlots: DeadTimeSlot[] } {
  // Total working minutes across all days
  let totalShiftMinutes = 0;
  let totalDeadMinutes = 0;

  for (const ds of daySessions) {
    if (!ds.openTime || !ds.closeTime) continue;
    const dayMinutes = ds.shiftMinutes;
    totalShiftMinutes += dayMinutes;

    const openHour = parseHour(ds.openTime);
    const openMin = parseInt(ds.openTime.slice(14, 16), 10);
    const closeHour = parseHour(ds.closeTime);
    const closeMin = parseInt(ds.closeTime.slice(14, 16), 10);

    // Check 15-min slots from session open to close
    let slotStart = openHour * 60 + openMin;
    const slotEnd = closeHour * 60 + closeMin;

    while (slotStart + 15 <= slotEnd) {
      const h = Math.floor(slotStart / 60);
      const agg = hrMap.get(h);
      // A 15-min slot is "dead" if the hour has no checks at all
      if (!agg || agg.checks === 0) {
        totalDeadMinutes += 15;
      }
      slotStart += 15;
    }
  }

  const deadTimePct = totalShiftMinutes > 0
    ? Math.round((totalDeadMinutes / totalShiftMinutes) * 100)
    : 0;

  // Build dead time slots: aggregate dead 15-min blocks across all days
  const deadTimeSlots: DeadTimeSlot[] = [];
  if (daySessions.length > 0) {
    // Use earliest open and latest close across all days for the overall window
    let overallOpenMin = Infinity;
    let overallCloseMin = 0;

    for (const ds of daySessions) {
      if (!ds.openTime || !ds.closeTime) continue;
      const oh = parseHour(ds.openTime);
      const om = parseInt(ds.openTime.slice(14, 16), 10);
      const ch = parseHour(ds.closeTime);
      const cm = parseInt(ds.closeTime.slice(14, 16), 10);
      overallOpenMin = Math.min(overallOpenMin, oh * 60 + om);
      overallCloseMin = Math.max(overallCloseMin, ch * 60 + cm);
    }

    if (overallOpenMin < Infinity) {
      let slotStart = overallOpenMin;
      const slotEnd = overallCloseMin;
      let currentDeadStart = -1;
      let currentDeadMinutes = 0;

      while (slotStart + 15 <= slotEnd) {
        const h = Math.floor(slotStart / 60);
        const agg = hrMap.get(h);
        const isDead = !agg || agg.checks === 0;

        if (isDead) {
          if (currentDeadStart === -1) currentDeadStart = slotStart;
          currentDeadMinutes += 15;
        } else {
          if (currentDeadMinutes > 0 && deadTimeSlots.length < 5) {
            deadTimeSlots.push({
              from: minutesToTime(currentDeadStart),
              to: minutesToTime(slotStart),
              minutes: currentDeadMinutes,
            });
          }
          currentDeadStart = -1;
          currentDeadMinutes = 0;
        }
        slotStart += 15;
      }
      // Flush last dead block
      if (currentDeadMinutes > 0 && deadTimeSlots.length < 5) {
        deadTimeSlots.push({
          from: minutesToTime(currentDeadStart),
          to: minutesToTime(slotStart),
          minutes: currentDeadMinutes,
        });
      }
    }
  }

  return { deadTimePct: Math.min(100, deadTimePct), deadTimeSlots };
}

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// ===================== Peak hour efficiency =====================

/**
 * peakHourEfficiency = seller's revenue at peak hour / store avg revenue at that same hour.
 * Compares seller to store baseline at their best hour.
 */
function computePeakEfficiency(
  hrMap: Map<number, HourAgg>,
  storeHourAvg: Map<number, { revenue: number }>,
  totalRevenue: number,
): { peakHours: PeakHour[]; peakHourK: number; peakHourEfficiency: number } {
  const entries = [...hrMap.entries()]
    .map(([hour, agg]) => ({ hour, revenue: agg.revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  const top2 = entries.slice(0, 2);

  const peakHours: PeakHour[] = top2.map((e) => ({
    from: `${String(e.hour).padStart(2, "0")}:00`,
    to: `${String(e.hour + 1).padStart(2, "0")}:00`,
    revenue: Math.round(e.revenue),
    shareOfDay: totalRevenue > 0
      ? parseFloat((e.revenue / totalRevenue).toFixed(2))
      : 0,
  }));

  const peakHourK = top2.length >= 2
    ? parseFloat((top2[0].revenue / Math.max(top2[1].revenue, 1)).toFixed(1))
    : 1;

  // Efficiency: seller's peak revenue vs store avg at that same hour
  const storeAtPeak = top2.length > 0
    ? (storeHourAvg.get(top2[0].hour)?.revenue ?? 0)
    : 0;
  const peakHourEfficiency = storeAtPeak > 0
    ? Math.min(1, parseFloat((top2[0].revenue / storeAtPeak).toFixed(2)))
    : 0.5;

  return { peakHours, peakHourK, peakHourEfficiency };
}

// ===================== DNA score computation =====================

function computeDNA(
  m: SellerDNAProfile,
  allSellers: SellerDNAProfile[],
): void {
  const allRevs = allSellers.map((s) => s.totalRevenue);
  const maxRev = Math.max(...allRevs, 1);
  const allAcc = allSellers.map((s) => s.accShare);
  const maxAcc = Math.max(...allAcc, 1);
  const maxDaysWorked = Math.max(...allSellers.map((s) => s.daysWorked), 1);

  const revenueScore = Math.min(100, (m.totalRevenue / maxRev) * 100);
  const checkScore = m.avgCheck > 2000 ? 100 : m.avgCheck > 1500 ? 75 : m.avgCheck > 1000 ? 50 : 25;
  const accScore = Math.min(100, (m.accShare / Math.max(maxAcc, 1)) * 100);
  const deadTimeScore = Math.max(0, 100 - m.deadTimePct * 2);
  const peakScore = Math.min(100, m.peakHourEfficiency * 100);
  const trendScore = m.trend === "up" ? 85 : m.trend === "stable" ? 65 : 35;
  const stabilityScore = Math.max(0, 100 - m.stability.revenueCV);
  const relativeAttendance = maxDaysWorked > 0
    ? Math.round((m.daysWorked / maxDaysWorked) * 100)
    : 0;
  const attendanceScore = Math.min(100, relativeAttendance);
  const disciplineScore = Math.max(0, 100 - m.lateRate * 3); // штраф 3 балла за каждый % опозданий

  m.overallScore = Math.round(
    revenueScore   * 0.15 +
    checkScore     * 0.15 +
    accScore       * 0.12 +
    deadTimeScore  * 0.08 +
    peakScore      * 0.10 +
    trendScore     * 0.12 +
    stabilityScore * 0.10 +
    attendanceScore * 0.08 +
    disciplineScore * 0.10,
  );

  m.serviceQuality = {
    avgCheckScore: Math.round(checkScore),
    conversionScore: Math.round(peakScore),
    liquidShareScore: Math.round(accScore),
    total: Math.round((checkScore + peakScore + accScore) / 3),
  };

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  if (m.avgCheck > 1800) strengths.push("Высокий средний чек");
  else if (m.avgCheck < 1200) weaknesses.push("Низкий средний чек");
  if (m.accShare > 25) strengths.push("Высокая доля аксессуаров");
  else if (m.accShare < 15) weaknesses.push("Низкая доля аксессуаров");
  if (m.deadTimePct < 12) strengths.push("Мало мёртвого времени");
  else if (m.deadTimePct > 20) weaknesses.push("Много мёртвого времени");
  if (m.peakHourEfficiency > 0.7) strengths.push("Эффективная работа в пики");
  else if (m.peakHourEfficiency < 0.4) weaknesses.push("Низкая эффективность в пики");
  if (m.trend === "up" && m.trendSlope > 2)
    strengths.push("Сильный восходящий тренд");
  else if (m.trend === "down")
    weaknesses.push("Снижающийся тренд выручки");
  if (m.stability.attendanceRate > 90)
    strengths.push("Высокая посещаемость");
  else if (m.stability.attendanceRate < 80)
    weaknesses.push("Низкая посещаемость");
  if (m.stability.lateOpenRate > 10) weaknesses.push("Частые опоздания");
  if (m.avgLateMinutes > 15) weaknesses.push(`Среднее опоздание ${m.avgLateMinutes} мин`);
  if (m.onTimeRate >= 95) strengths.push("Отличная пунктуальность");
  if (m.firstCheckDelay != null && m.firstCheckDelay < 15) strengths.push("Быстрый старт смены");
  if (strengths.length === 0) strengths.push("Стабильные показатели");
  m.strengths = strengths;
  m.weaknesses = weaknesses;

  if (m.overallScore >= 80 && m.trend === "up") m.dnaLabel = "Охотник";
  else if (m.overallScore >= 60 && m.trend !== "down") m.dnaLabel = "Стабильный";
  else if (m.avgCheck > 1800 && m.accShare > 25) m.dnaLabel = "Одиночка";
  else if (m.trend === "up" && m.overallScore >= 55) m.dnaLabel = "Восходящий";
  else m.dnaLabel = "Проблемный";
}

// ===================== Main export =====================

function filterBySellerIds(
  result: { sellers: SellerDNAProfile[] },
  sellerIds: string[] | undefined,
): { sellers: SellerDNAProfile[] } {
  if (!sellerIds || sellerIds.length === 0) return result;
  const idSet = new Set(sellerIds);
  return { sellers: result.sellers.filter((s) => idSet.has(s.uuid)) };
}

export async function computeSellerAdvancedStats(
  db: D1Database,
  params: { since: string; until: string; shopId?: string; benchmarkWeekday?: number; weekday?: number; sellerIds?: string[] },
): Promise<{ sellers: SellerDNAProfile[] }> {
  const { since, until, shopId: rawShopId, benchmarkWeekday, weekday, sellerIds } = params;

  // Resolve store name → UUID (same fix as sellerEffectiveness.ts)
  const shopNames = await getShopNames(db);
  const shopId = resolveStoreParam(rawShopId, shopNames);

  // 1. Try cached daily metrics first
  let cachedDays: Awaited<ReturnType<typeof getSellerDailyMetrics>> = [];
  try {
    cachedDays = await getSellerDailyMetrics(db, since, until, shopId);
  } catch {
    console.log("[advanced-stats] Cache table missing — querying index_documents live");
  }
  const hasCache = cachedDays.length > 0;

  // Compute 4-week same-weekday benchmark if requested
  let benchmarkHourly: HourlyPoint[] | null = null;
  if (benchmarkWeekday !== undefined) {
    benchmarkHourly = await computeWeekdayBenchmark(db, since, until, shopId, benchmarkWeekday);
  }

  let result: { sellers: SellerDNAProfile[] };

  if (hasCache) {
    console.log(
      `[advanced-stats] Using cache: ${cachedDays.length} seller-day rows for ${since}–${until}`,
    );
    result = await buildFromCache(db, since, until, shopId, cachedDays, benchmarkHourly, weekday);
  } else {
    console.log("[advanced-stats] Cache miss — querying index_documents live");
    result = await buildFromLive(db, since, until, shopId, benchmarkHourly, weekday);
  }

  return filterBySellerIds(result, sellerIds);
}

// ===================== 4-week same-weekday benchmark =====================

async function computeWeekdayBenchmark(
  db: D1Database,
  since: string,
  until: string,
  shopId: string | undefined,
  weekday: number,
): Promise<HourlyPoint[]> {
  const targetDate = since;
  const dates = getPreviousSameWeekdayDates(targetDate, 4);

  if (dates.length === 0) return [];

  let sql = `SELECT close_date, transactions
             FROM index_documents
             WHERE type = 'SELL'
               AND close_date >= ? AND close_date <= ?`;
  const binds: any[] = [dates[dates.length - 1] + "T00:00:00", dates[0] + "T23:59:59"];
  if (shopId && shopId !== "all") {
    sql += ` AND shop_id = ?`;
    binds.push(shopId);
  }
  sql += ` ORDER BY close_date`;

  const res = await db.prepare(sql).bind(...binds).all<{ close_date: string; transactions: string }>();
  const docs = res.results ?? [];

  const dateHourRevenue = new Map<string, Map<number, number>>();
  for (const doc of docs) {
    const date = doc.close_date.slice(0, 10);
    if (!dates.includes(date)) continue;
    const hour = parseHour(doc.close_date);
    let revenue = 0;
    try {
      const tx = JSON.parse(doc.transactions || "[]");
      for (const t of (Array.isArray(tx) ? tx : [tx])) {
        revenue += (t.price ?? 0) * (t.quantity ?? 1) + (t.discountForDocument ?? 0);
      }
    } catch {}

    if (!dateHourRevenue.has(date)) dateHourRevenue.set(date, new Map());
    const hourMap = dateHourRevenue.get(date)!;
    hourMap.set(hour, (hourMap.get(hour) ?? 0) + revenue);
  }

  if (dateHourRevenue.size === 0) return [];

  const avgByHour = new Map<number, { total: number; count: number }>();
  for (const [, hourMap] of dateHourRevenue) {
    for (const [hour, rev] of hourMap) {
      const cur = avgByHour.get(hour) ?? { total: 0, count: 0 };
      cur.total += rev;
      cur.count += 1;
      avgByHour.set(hour, cur);
    }
  }

  const result: HourlyPoint[] = [];
  for (const [hour, agg] of avgByHour) {
    result.push({
      hour,
      revenue: Math.round(agg.total / dates.length),
      checks: 0,
    });
  }
  result.sort((a, b) => a.hour - b.hour);
  console.log(`[advanced-stats] 4-week benchmark for weekday ${weekday}: ${result.length} hourly slots`);
  return result;
}

function getPreviousSameWeekdayDates(dateStr: string, count: number): string[] {
  const ref = new Date(dateStr + "T12:00:00+03:00");
  const targetDay = ref.getDay();
  const dates: string[] = [];
  let cursor = new Date(ref.getTime() - 7 * 86400000);
  for (let i = 0; i < count * 10 && dates.length < count; i++) {
    if (cursor.getDay() === targetDay) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, "0");
      const d = String(cursor.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${d}`);
    }
    cursor = new Date(cursor.getTime() - 7 * 86400000);
  }
  return dates;
}

// ===================== Multi-week weekday comparison =====================

interface WeekdayOverlap {
  weekday: number;
  weekdayLabel: string;
  commonDates: string[];
  count: number;
}

async function findSameDayDates(
  db: D1Database,
  shopId: string | undefined,
  sellerIds: string[],
  refDate: string,
  weeksBack: number,
): Promise<{ commonDates: string[] }> {
  const ref = new Date(refDate + "T12:00:00+03:00");
  const from = new Date(ref);
  from.setDate(from.getDate() - weeksBack * 7 - 1);
  const since = from.toISOString().slice(0, 10);
  const until = refDate;

  let sql = `SELECT open_user_uuid, close_date
             FROM index_documents
             WHERE type = 'SELL'
               AND close_date >= ? AND close_date <= ?
               AND open_user_uuid IN (${sellerIds.map(() => "?").join(",")})`;
  const binds: any[] = [since + "T00:00:00", until + "T23:59:59", ...sellerIds];
  if (shopId && shopId !== "all") {
    sql += ` AND shop_id = ?`;
    binds.push(shopId);
  }

  const res = await db.prepare(sql).bind(...binds).all<{ open_user_uuid: string; close_date: string }>();
  const rows = res.results ?? [];

  const sellerDates = new Map<string, Set<string>>();
  for (const row of rows) {
    const date = row.close_date.slice(0, 10);
    if (!sellerDates.has(row.open_user_uuid)) {
      sellerDates.set(row.open_user_uuid, new Set());
    }
    sellerDates.get(row.open_user_uuid)!.add(date);
  }

  const dateCounts = new Map<string, number>();
  for (const dates of sellerDates.values()) {
    for (const d of dates) {
      dateCounts.set(d, (dateCounts.get(d) ?? 0) + 1);
    }
  }
  const commonDates = [...dateCounts.entries()]
    .filter(([, c]) => c === sellerIds.length)
    .map(([d]) => d)
    .sort();

  return { commonDates };
}

async function findBestWeekdayOverlaps(
  db: D1Database,
  shopId: string | undefined,
  sellerIds: string[],
  refDate: string,
  weeksBack: number,
): Promise<WeekdayOverlap[]> {
  const ref = new Date(refDate + "T12:00:00+03:00");
  const from = new Date(ref);
  from.setDate(from.getDate() - weeksBack * 7 - 1);
  const since = from.toISOString().slice(0, 10);
  const until = refDate;

  let sql = `SELECT open_user_uuid, close_date
             FROM index_documents
             WHERE type = 'SELL'
               AND close_date >= ? AND close_date <= ?
               AND open_user_uuid IN (${sellerIds.map(() => "?").join(",")})`;
  const binds: any[] = [since + "T00:00:00", until + "T23:59:59", ...sellerIds];
  if (shopId && shopId !== "all") {
    sql += ` AND shop_id = ?`;
    binds.push(shopId);
  }

  const res = await db.prepare(sql).bind(...binds).all<{ open_user_uuid: string; close_date: string }>();
  const rows = res.results ?? [];

  const sellerWeekdays = new Map<string, Map<number, Set<string>>>();
  for (const row of rows) {
    const date = row.close_date.slice(0, 10);
    const wd = new Date(date + "T12:00:00+03:00").getDay();
    if (!sellerWeekdays.has(row.open_user_uuid)) {
      sellerWeekdays.set(row.open_user_uuid, new Map());
    }
    const wdMap = sellerWeekdays.get(row.open_user_uuid)!;
    if (!wdMap.has(wd)) wdMap.set(wd, new Set());
    wdMap.get(wd)!.add(date);
  }

  const WD_LABELS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const overlaps: WeekdayOverlap[] = [];

  for (let wd = 0; wd <= 6; wd++) {
    let commonDates: Set<string> | null = null;
    for (const wdMap of sellerWeekdays.values()) {
      const sellerDates = wdMap.get(wd);
      if (!sellerDates || sellerDates.size === 0) {
        commonDates = null;
        break;
      }
      if (commonDates === null) {
        commonDates = new Set(sellerDates);
      } else {
        const arr: string[] = [...commonDates].filter((d: string) => sellerDates.has(d));
        commonDates = new Set(arr);
        if (commonDates.size === 0) break;
      }
    }
    if (commonDates && commonDates.size > 0) {
      overlaps.push({
        weekday: wd,
        weekdayLabel: WD_LABELS[wd],
        commonDates: [...commonDates].sort(),
        count: commonDates.size,
      });
    }
  }

  overlaps.sort((a, b) => b.count - a.count);
  return overlaps;
}

export async function computeWeekdayComparison(
  db: D1Database,
  params: { targetDate: string; shopId?: string; weeksBack?: number; compareMode?: "same-day" | "same-weekday"; sellerIds?: string[] },
): Promise<WeekdayCompareResult> {
  const { targetDate, shopId: rawShopId, weeksBack = 4, compareMode = "same-weekday", sellerIds } = params;
  
  // Resolve store name → UUID (same fix as sellerEffectiveness.ts)
  const shopNames = await getShopNames(db);
  const shopId = resolveStoreParam(rawShopId, shopNames);
  
  const refDate = new Date(targetDate + "T12:00:00+03:00");
  const targetWeekday = refDate.getDay(); // 0=Sun..6=Sat

  let recommendation: { message: string; bestWeekday?: number; bestWeekdayLabel?: string; bestCount?: number } | undefined;

  let dates: string[];

  if (compareMode === "same-day" && sellerIds && sellerIds.length >= 2) {
    const { commonDates } = await findSameDayDates(db, shopId, sellerIds, targetDate, weeksBack);

    if (commonDates.length >= 2) {
      dates = commonDates;
    } else {
      const overlaps = await findBestWeekdayOverlaps(db, shopId, sellerIds, targetDate, weeksBack);
      if (overlaps.length > 0) {
        const best = overlaps[0];
        recommendation = {
          message: `Лучше сравнивать по ${best.weekdayLabel.toLowerCase()} (продавцы работали вместе ${best.count} раз)`,
          bestWeekday: best.weekday,
          bestWeekdayLabel: best.weekdayLabel,
          bestCount: best.count,
        };
        dates = best.commonDates;
      } else {
        return computeWeekdayComparison(db, { targetDate, shopId, weeksBack, compareMode: "same-weekday" });
      }
    }
  } else {
    dates = [];
    let cursor = new Date(refDate);
    for (let i = 0; i < weeksBack; i++) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, "0");
      const d = String(cursor.getDate()).padStart(2, "0");
      dates.unshift(`${y}-${m}-${d}`);
      cursor = new Date(cursor.getTime() - 7 * 86400000);
    }
  }

  const since = dates[0];
  const until = dates[dates.length - 1];
  console.log(`[weekday-compare] compareMode=${compareMode}, dates=${dates.length}, since=${since}, until=${until}`);

  // Query docs and sessions for the full range, then filter to dates
  const [docs, sessions, employeeNames] = await Promise.all([
    fetchDocs(db, since, until, shopId),
    fetchSessions(db, since, until, shopId),
    fetchEmployeeNames(db),
  ]);

  const dateSet = new Set(dates);
  const sellerSet = sellerIds && sellerIds.length > 0 ? new Set(sellerIds) : null;

  // Build per-seller day aggregations, filtering to matching dates
  const sellerDays = new Map<string, DayAgg[]>();
  const sellerHours = new Map<string, Map<number, HourAgg>>();

  for (const doc of docs) {
    const docDate = doc.close_date.slice(0, 10);
    if (!dateSet.has(docDate)) continue;

    const uuid = doc.open_user_uuid || "unknown";
    if (sellerSet && !sellerSet.has(uuid)) continue;

    const date = parseDate(doc.close_date);
    const hour = parseHour(doc.close_date);

    let revenue = 0;
    let discountAmount = 0;
    let hasDiscount = false;
    let accRevenue = 0;
    try {
      const tx = JSON.parse(doc.transactions || "[]");
      for (const t of (Array.isArray(tx) ? tx : [tx])) {
        const lineRev = (t.price ?? 0) * (t.quantity ?? 1);
        revenue += lineRev;
        if (t.discountForDocument && t.discountForDocument > 0) {
          hasDiscount = true;
          discountAmount += t.discountForDocument;
        }
      }
    } catch {}

    if (!sellerDays.has(uuid)) sellerDays.set(uuid, []);
    const daysList = sellerDays.get(uuid)!;
    let dayEntry = daysList.find((d) => d.date === date);
    if (!dayEntry) {
      dayEntry = {
        date,
        revenue: 0,
        checks: 0,
        hours: 0,
        store: doc.shop_id,
        firstCheckTs: null,
        discountChecks: 0,
        discountAmount: 0,
        accRevenue: 0,
        firstCheckDelay: 0,
        absentProbability: 0,
      };
      daysList.push(dayEntry);
    }
    dayEntry.revenue += revenue;
    dayEntry.checks += 1;
    dayEntry.accRevenue += accRevenue;
    if (hasDiscount) {
      dayEntry.discountChecks += 1;
      dayEntry.discountAmount += discountAmount;
    }

    // Hourly
    if (!sellerHours.has(uuid)) sellerHours.set(uuid, new Map());
    const hourMap = sellerHours.get(uuid)!;
    const ha = hourMap.get(hour);
    if (ha) {
      ha.revenue += revenue;
      ha.checks += 1;
    } else {
      hourMap.set(hour, { revenue, checks: 1 });
    }
  }

  // Build day-session info (for shift minutes)
  const sellerDaySessions = new Map<string, Map<string, DaySession>>();
  for (const [key, sessionList] of sessions) {
    const [uuid, date] = key.split("|");
    if (!dateSet.has(date)) continue;

    if (!sellerDaySessions.has(uuid)) sellerDaySessions.set(uuid, new Map());
    const dayMap = sellerDaySessions.get(uuid)!;
    const timestamps = sessionList.map((s) => s.close_date).sort();
    const openTime = timestamps[0];
    const closeTime = timestamps[timestamps.length - 1];
    const shiftMinutes = timestamps.length >= 2
      ? minutesBetween(openTime, closeTime)
      : 480;
    dayMap.set(date, { openTime, closeTime, shiftMinutes });
  }

  // Build comparison profiles
  const profiles: WeekdayCompareProfile[] = [];
  for (const [uuid, days] of sellerDays) {
    const name = employeeNames[uuid] || uuid.slice(0, 8);
    const daySessions = sellerDaySessions.get(uuid);

    const daysWorked = days.length;
    const totalRevenue = days.reduce((s, d) => s + d.revenue, 0);
    const totalChecks = days.reduce((s, d) => s + d.checks, 0);
    const avgCheck = totalChecks > 0 ? Math.round(totalRevenue / totalChecks) : 0;

    // Rub per hour
    let totalShiftMinutes = 0;
    let rubPerHour: number | null = null;
    if (daySessions) {
      for (const d of days) {
        const ds = daySessions.get(d.date);
        if (ds) totalShiftMinutes += ds.shiftMinutes;
      }
      if (totalShiftMinutes > 0) {
        rubPerHour = Math.round((totalRevenue / totalShiftMinutes) * 60);
      }
    }

    const avgHours = totalShiftMinutes > 0
      ? Math.round((totalShiftMinutes / 60 / daysWorked) * 10) / 10
      : null;

    // Dead time %
    const hourMap = sellerHours.get(uuid);
    const hourEntries = [...(hourMap?.entries() ?? [])].sort((a, b) => a[0] - b[0]);
    let deadMinutes = 0;
    const THRESHOLD = 800; // minimum revenue for "alive" hour
    for (const [, agg] of hourEntries) {
      if (agg.checks <= 1 && agg.revenue < THRESHOLD) {
        deadMinutes += 60;
      }
    }
    const totalActiveMinutes = hourEntries.length * 60;
    const deadTimePct = totalActiveMinutes > 0
      ? Math.round((deadMinutes / totalActiveMinutes) * 100)
      : 0;

    // AccShare: accessories share of revenue (simplified: use discount as proxy, skip)
    const accShare = 0;

    // Hourly revenue points
    const hourlyRevenue: HourlyPoint[] = [];
    if (hourMap) {
      for (const [h, agg] of hourMap) {
        hourlyRevenue.push({
          hour: h,
          revenue: Math.round(agg.revenue / daysWorked),
          checks: Math.round(agg.checks / daysWorked),
        });
      }
    }
    hourlyRevenue.sort((a, b) => a.hour - b.hour);

    profiles.push({
      uuid,
      name,
      daysWorked,
      totalRevenue,
      avgCheck,
      accShare,
      rubPerHour,
      avgHours,
      deadTimePct,
      hourlyRevenue,
    });
  }

  // Sort by rubPerHour descending
  profiles.sort((a, b) => (b.rubPerHour ?? 0) - (a.rubPerHour ?? 0));

  console.log(`[weekday-compare] compareMode=${compareMode}, found ${profiles.length} sellers, dates=${dates.length}`);

  return {
    weekday: targetWeekday,
    dates,
    sellers: profiles,
    recommendation,
  };
}

// ===================== Seller weekday breakdown =====================

export async function computeWeekdayBreakdown(
  db: D1Database,
  params: { sellerId: string; since: string; until: string; shopId?: string },
): Promise<WeekdayBreakdownMap> {
  const { sellerId, since, until, shopId: rawShopId } = params;

  // Resolve store name → UUID
  const shopNames = await getShopNames(db);
  const shopId = resolveStoreParam(rawShopId, shopNames);

  // Query all docs for this seller
  let sql = `SELECT close_date, transactions
             FROM index_documents
             WHERE type = 'SELL'
               AND open_user_uuid = ?
               AND close_date >= ? AND close_date <= ?`;
  const binds: any[] = [sellerId, since + "T00:00:00", until + "T23:59:59"];
  if (shopId && shopId !== "all") {
    sql += ` AND shop_id = ?`;
    binds.push(shopId);
  }
  sql += ` ORDER BY close_date`;

  const res = await db.prepare(sql).bind(...binds).all<{ close_date: string; transactions: string }>();
  const docs = res.results ?? [];

  // Also get sessions for shift minutes
  const sessSql = `SELECT open_user_uuid, close_date
                    FROM index_documents
                    WHERE type = 'SESSION'
                      AND open_user_uuid = ?
                      AND close_date >= ? AND close_date <= ?`;
  const sessBinds: any[] = [sellerId, since + "T00:00:00", until + "T23:59:59"];
  const sessRes = await db.prepare(sessSql).bind(...sessBinds).all<{ close_date: string }>();
  const sessionRows = sessRes.results ?? [];

  // Build per-day session info
  const dayShiftMinutes = new Map<string, number>();
  const sessByDate = new Map<string, string[]>();
  for (const sr of sessionRows) {
    const date = sr.close_date.slice(0, 10);
    if (!sessByDate.has(date)) sessByDate.set(date, []);
    sessByDate.get(date)!.push(sr.close_date);
  }
  for (const [date, timestamps] of sessByDate) {
    const sorted = timestamps.sort();
    const openTime = sorted[0];
    const closeTime = sorted[sorted.length - 1];
    const mins = sorted.length >= 2 ? minutesBetween(openTime, closeTime) : 480;
    dayShiftMinutes.set(date, mins);
  }

  // Aggregate by weekday
  const agg = new Map<number, { days: Set<string>; totalRevenue: number; totalChecks: number; totalShiftMin: number }>();
  for (const doc of docs) {
    const date = doc.close_date.slice(0, 10);
    const wd = dayOfWeek(date);

    let revenue = 0;
    try {
      const tx = JSON.parse(doc.transactions || "[]");
      for (const t of (Array.isArray(tx) ? tx : [tx])) {
        revenue += (t.price ?? 0) * (t.quantity ?? 1);
      }
    } catch {}

    const cur = agg.get(wd) ?? { days: new Set(), totalRevenue: 0, totalChecks: 0, totalShiftMin: 0 };
    cur.days.add(date);
    cur.totalRevenue += revenue;
    cur.totalChecks += 1;
    agg.set(wd, cur);
  }

  // Add shift minutes
  for (const [wd, data] of agg) {
    for (const d of data.days) {
      data.totalShiftMin += dayShiftMinutes.get(d) ?? 0;
    }
  }

  // Convert to result
  const result: WeekdayBreakdownMap = {};
  for (let wd = 0; wd < 7; wd++) {
    const data = agg.get(wd);
    if (data && data.days.size > 0) {
      result[wd] = {
        days: data.days.size,
        totalRevenue: data.totalRevenue,
        totalChecks: data.totalChecks,
        avgCheck: data.totalChecks > 0 ? Math.round(data.totalRevenue / data.totalChecks) : 0,
        rubPerHour: data.totalShiftMin > 0 ? Math.round((data.totalRevenue / data.totalShiftMin) * 60) : null,
      };
    }
  }

  return result;
}

// ===================== Cache path =====================

async function buildFromCache(
  db: D1Database,
  since: string,
  until: string,
  shopId: string | undefined,
  cachedDays: Awaited<ReturnType<typeof getSellerDailyMetrics>>,
  benchmarkHourly: HourlyPoint[] | null,
  weekday: number | undefined,
): Promise<{ sellers: SellerDNAProfile[] }> {
  // Reconstruct daily aggregations from cached data
  const sellerDays = new Map<string, DayAgg[]>();
  const sellerDayFirstCheck = new Map<string, Map<string, string>>();

  for (const row of cachedDays) {
    const uuid = row.seller_uuid;
    const date = row.date;

    if (!sellerDays.has(uuid)) sellerDays.set(uuid, []);
    const daysList = sellerDays.get(uuid)!;
    let dayEntry = daysList.find((d) => d.date === date);
    if (!dayEntry) {
      dayEntry = {
        date,
        revenue: 0,
        checks: 0,
        hours: 0,
        store: row.shop_id,
        firstCheckTs: null,
        discountChecks: 0,
        discountAmount: 0,
        accRevenue: 0,
        firstCheckDelay: 0,
        absentProbability: 0,
      };
      daysList.push(dayEntry);
    }
    dayEntry.revenue += row.revenue;
    dayEntry.checks += row.checks;
    dayEntry.hours += row.shift_hours;
    dayEntry.discountChecks += row.discount_checks;
    dayEntry.discountAmount += row.discount_amount;
    dayEntry.accRevenue += row.acc_revenue;
    dayEntry.firstCheckDelay = Math.max(dayEntry.firstCheckDelay, row.first_check_delay ?? 0);
    dayEntry.absentProbability = Math.max(dayEntry.absentProbability, row.absent_probability ?? 0);

    if (!sellerDayFirstCheck.has(uuid)) {
      sellerDayFirstCheck.set(uuid, new Map());
    }
    const dayFirstMap = sellerDayFirstCheck.get(uuid)!;
    if (row.first_check_ts && (!dayFirstMap.has(date) || row.first_check_ts < dayFirstMap.get(date)!)) {
      dayFirstMap.set(date, row.first_check_ts);
    }
  }

  // Lightweight hourly query (close_date only, no transactions JSON)
  let hourSql = `SELECT close_date, open_user_uuid
                 FROM index_documents
                 WHERE type = 'SELL'
                   AND close_date >= ? AND close_date <= ?`;
  const hourBinds: any[] = [since, until + "T23:59:59"];
  if (shopId && shopId !== "all") {
    hourSql += ` AND shop_id = ?`;
    hourBinds.push(shopId);
  }

  const hourRows = await db
    .prepare(hourSql)
    .bind(...hourBinds)
    .all<{ close_date: string; open_user_uuid: string }>();

  const sellerHours = new Map<string, Map<number, HourAgg>>();
  const storeHourTotals = new Map<number, { revenue: number; checks: number }>();

  // Build per-day check counts for revenue estimation
  const dayCheckCounts = new Map<string, number>();
  for (const row of cachedDays) {
    const key = `${row.seller_uuid}|${row.date}`;
    dayCheckCounts.set(key, row.checks);
  }

  for (const r of hourRows.results ?? []) {
    const uuid = r.open_user_uuid || "unknown";
    const date = r.close_date.slice(0, 10);
    const hour = parseHour(r.close_date);

    // Estimate hourly revenue: proportional to check share of day
    const key = `${uuid}|${date}`;
    const dayTotalChecks = dayCheckCounts.get(key) || 1;
    let dayTotalRevenue = 0;
    // Find the corresponding cached day
    const daysForSeller = sellerDays.get(uuid);
    if (daysForSeller) {
      const dayObj = daysForSeller.find((d) => d.date === date);
      if (dayObj) dayTotalRevenue = dayObj.revenue;
    }
    const estimatedRevenue = dayTotalChecks > 0
      ? dayTotalRevenue / dayTotalChecks
      : 0;

    if (!sellerHours.has(uuid)) sellerHours.set(uuid, new Map());
    const hMap = sellerHours.get(uuid)!;
    const hEntry = hMap.get(hour) ?? { revenue: 0, checks: 0 };
    hEntry.revenue += Math.round(estimatedRevenue);
    hEntry.checks += 1;
    hMap.set(hour, hEntry);

    const storeCur = storeHourTotals.get(hour) ?? { revenue: 0, checks: 0 };
    storeCur.revenue += Math.round(estimatedRevenue);
    storeCur.checks += 1;
    storeHourTotals.set(hour, storeCur);
  }

  // Fetch session data for shift boundaries
  let sessSql = `SELECT shop_id, open_user_uuid, close_date
                 FROM index_documents
                 WHERE type = 'OPEN_SESSION'
                   AND close_date >= ? AND close_date <= ?`;
  const sessBinds: any[] = [since, until + "T23:59:59"];
  if (shopId && shopId !== "all") {
    sessSql += ` AND shop_id = ?`;
    sessBinds.push(shopId);
  }

  const sessRows = await db
    .prepare(sessSql)
    .bind(...sessBinds)
    .all<SessionRow>();
  const sessions = new Map<string, SessionRow[]>();
  for (const r of sessRows.results ?? []) {
    const key = `${r.open_user_uuid}|${r.close_date.slice(0, 10)}`;
    if (!sessions.has(key)) sessions.set(key, []);
    sessions.get(key)!.push(r);
  }

  // Fetch employee names
  const employeeNames = await fetchEmployeeNames(db);

  // Finish building profiles
  return finishBuilding(
    since,
    until,
    sellerDays,
    sellerHours,
    storeHourTotals,
    sessions,
    employeeNames,
    benchmarkHourly, weekday,
  );
}

// ===================== Live (fallback) path =====================

async function buildFromLive(
  db: D1Database,
  since: string,
  until: string,
  shopId: string | undefined,
  benchmarkHourly: HourlyPoint[] | null,
  weekday: number | undefined,
): Promise<{ sellers: SellerDNAProfile[] }> {
  const [docs, sessions, employeeNames, categoryMap] = await Promise.all([
    fetchDocs(db, since, until, shopId),
    fetchSessions(db, since, until, shopId),
    fetchEmployeeNames(db),
    buildCategoryMap(db),
  ]);

  if (docs.length === 0) {
    return { sellers: [] };
  }

  const sellerDays = new Map<string, DayAgg[]>();
  const sellerHours = new Map<string, Map<number, HourAgg>>();
  const sellerDayFirstCheck = new Map<string, Map<string, string>>();

  for (const doc of docs) {
    const uuid = doc.open_user_uuid || "unknown";
    const date = parseDate(doc.close_date);
    const hour = parseHour(doc.close_date);
    const check = parseCheck(doc.transactions, categoryMap);

    if (!sellerDays.has(uuid)) sellerDays.set(uuid, []);
    const daysList = sellerDays.get(uuid)!;
    let dayEntry = daysList.find((d) => d.date === date);
    if (!dayEntry) {
      dayEntry = {
        date,
        revenue: 0,
        checks: 0,
        hours: 0,
        store: doc.shop_id,
        firstCheckTs: null,
        discountChecks: 0,
        discountAmount: 0,
        accRevenue: 0,
        firstCheckDelay: 0,
        absentProbability: 0,
      };
      daysList.push(dayEntry);
    }
    dayEntry.revenue += check.revenue;
    dayEntry.checks += 1;
    dayEntry.accRevenue += check.accRevenue;
    if (check.hasDiscount) {
      dayEntry.discountChecks += 1;
      dayEntry.discountAmount += check.discountAmount;
    }

    if (!sellerDayFirstCheck.has(uuid)) {
      sellerDayFirstCheck.set(uuid, new Map());
    }
    const dayFirstMap = sellerDayFirstCheck.get(uuid)!;
    const currentFirst = dayFirstMap.get(date);
    if (!currentFirst || doc.close_date < currentFirst) {
      dayFirstMap.set(date, doc.close_date);
    }

    if (!sellerHours.has(uuid)) sellerHours.set(uuid, new Map());
    const hourMap = sellerHours.get(uuid)!;
    const hEntry = hourMap.get(hour) ?? { revenue: 0, checks: 0 };
    hEntry.revenue += check.revenue;
    hEntry.checks += 1;
    hourMap.set(hour, hEntry);
  }

  // Compute store hour totals
  const storeHourTotals = new Map<number, { revenue: number; checks: number }>();
  for (const doc of docs) {
    const hour = parseHour(doc.close_date);
    const check = parseCheck(doc.transactions, categoryMap);
    const cur = storeHourTotals.get(hour) ?? { revenue: 0, checks: 0 };
    cur.revenue += check.revenue;
    cur.checks += 1;
    storeHourTotals.set(hour, cur);
  }

  return finishBuilding(
    since,
    until,
    sellerDays,
    sellerHours,
    storeHourTotals,
    sessions,
    employeeNames,
    benchmarkHourly, weekday,
  );
}

// ===================== Shared profile builder =====================

async function finishBuilding(
  since: string,
  until: string,
  sellerDays: Map<string, DayAgg[]>,
  sellerHours: Map<string, Map<number, HourAgg>>,
  storeHourTotals: Map<number, { revenue: number; checks: number }>,
  sessions: Map<string, SessionRow[]>,
  employeeNames: Record<string, string>,
  benchmarkHourly: HourlyPoint[] | null,
  weekday: number | undefined,
): Promise<{ sellers: SellerDNAProfile[] }> {
  const totalCalendarDays = [...new Set([...sellerDays.values()].flatMap((d) => d.map((x) => x.date)))].length || 1;

  // Build day-session info
  const sellerDaySessions = new Map<string, Map<string, DaySession>>();
  const sellerDayShop = new Map<string, Map<string, string>>(); // uuid → date → shop_id
  for (const [key, sessionList] of sessions) {
    const [uuid, date] = key.split("|");
    // Filter by weekday if specified
    if (weekday !== undefined) {
      const dw = dayOfWeek(date);
      if (dw !== weekday) continue;
    }
    if (!sellerDaySessions.has(uuid)) sellerDaySessions.set(uuid, new Map());
    const dayMap = sellerDaySessions.get(uuid)!;
    const timestamps = sessionList.map((s) => s.close_date).sort();
    const openTime = timestamps[0];
    const closeTime = timestamps[timestamps.length - 1];
    const shiftMinutes = timestamps.length >= 2
      ? minutesBetween(openTime, closeTime)
      : 480;
    dayMap.set(date, { openTime, closeTime, shiftMinutes });

    // Запоминаем shop_id для этого seller-day (берём из первой сессии)
    if (sessionList.length > 0 && sessionList[0].shop_id) {
      if (!sellerDayShop.has(uuid)) sellerDayShop.set(uuid, new Map());
      sellerDayShop.get(uuid)!.set(date, sessionList[0].shop_id);
    }
  }

  // Build storeAvgHourly: prefer 4-week benchmark over calendar-day average
  const storeAvgHourly: HourlyPoint[] = [];
  if (benchmarkHourly && benchmarkHourly.length > 0) {
    storeAvgHourly.push(...benchmarkHourly);
  } else {
    for (const [hour, agg] of storeHourTotals) {
      storeAvgHourly.push({
        hour,
        revenue: Math.round(agg.revenue / totalCalendarDays),
        checks: Math.round(agg.checks / totalCalendarDays),
      });
    }
  }
  storeAvgHourly.sort((a, b) => a.hour - b.hour);

  const storeHourAvg = new Map<number, { revenue: number }>();
  for (const p of storeAvgHourly) {
    storeHourAvg.set(p.hour, { revenue: p.revenue });
  }

  // ===================== Shop schedules (for late_minutes) =====================
  const scheduleRows = await getShopSchedules(db);
  // shopId → weekday → expected open minute-of-day
  const shopOpenByWeekday = new Map<string, Map<number, number>>();
  for (const r of scheduleRows) {
    if (!r.is_working_day) continue;
    if (!shopOpenByWeekday.has(r.shop_id)) shopOpenByWeekday.set(r.shop_id, new Map());
    const [oh, om] = r.open_time.split(":").map(Number);
    shopOpenByWeekday.get(r.shop_id)!.set(r.weekday, oh * 60 + om);
  }

  /** Convert ISO timestamp to minute-of-day */
  const timeToMinutes = (iso: string): number => {
    const h = parseHour(iso);
    const m = parseInt(iso.slice(14, 16), 10) || 0;
    return h * 60 + m;
  };

  const STORE_OPENING_HOUR = 10;
  const profiles: SellerDNAProfile[] = [];

  for (const [uuid, days] of sellerDays) {
    const name = employeeNames[uuid] || uuid.slice(0, 8);
    const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));
    const daysWorked = sortedDays.length;

    let totalRevenue = 0;
    let totalChecks = 0;
    let totalDiscountChecks = 0;
    let totalDiscountAmount = 0;
    let totalAccRevenue = 0;
    let totalHours = 0;
    const daySessionMap = sellerDaySessions.get(uuid) ?? new Map();
    const dayShopMap = sellerDayShop.get(uuid) ?? new Map();
    const dayFirstMap = new Map<string, string>(); // populated below if needed

    const daySessionsList: DaySession[] = [];
    let lateOpenCount = 0;
    let totalLateMinutes = 0;
    let totalFirstCheckDelay = 0;
    let firstCheckDelayDays = 0;

    for (const day of sortedDays) {
      totalRevenue += day.revenue;
      totalChecks += day.checks;
      totalDiscountChecks += day.discountChecks;
      totalDiscountAmount += day.discountAmount;
      totalAccRevenue += day.accRevenue;

      const ds = daySessionMap.get(day.date);
      if (ds) {
        const h = ds.shiftMinutes / 60;
        totalHours += h;
        daySessionsList.push(ds);

        // --- Расчёт опоздания по shop_schedules ---
        const shopId = dayShopMap.get(day.date) || day.store; // fallback: из daily-метрик
        const dateWeekday = dayOfWeek(day.date); // 0=Sun..6=Sat → в БД: 0=Вс..6=Сб
        const expectedOpen = shopId
          ? shopOpenByWeekday.get(shopId)?.get(dateWeekday)
          : undefined;

        if (ds.openTime && expectedOpen != null) {
          const actualMin = timeToMinutes(ds.openTime);
          const lateMin = actualMin - expectedOpen;
          if (lateMin > 0) {
            lateOpenCount++;
            totalLateMinutes += lateMin;
          }

          // firstCheckDelay: приоритет — из кеша, fallback — расчёт из сессий
          if (day.firstCheckDelay > 0) {
            totalFirstCheckDelay += day.firstCheckDelay;
            firstCheckDelayDays++;
          } else {
            const firstCheckTs = dayFirstMap.get(day.date);
            if (firstCheckTs) {
              const firstCheckMin = timeToMinutes(firstCheckTs);
              const delay = firstCheckMin - expectedOpen;
              if (delay > 0) {
                totalFirstCheckDelay += delay;
                firstCheckDelayDays++;
              }
            }
          }
        } else if (ds.openTime) {
          // Fallback: сравниваем с жёстким порогом STORE_OPENING_HOUR
          const actualMin = timeToMinutes(ds.openTime);
          if (actualMin > STORE_OPENING_HOUR * 60 + 15) {
            lateOpenCount++;
          }
        }
      } else {
        totalHours += 8;
      }
    }

    const avgCheck = totalChecks > 0 ? Math.round(totalRevenue / totalChecks) : 0;
    const accShare = totalRevenue > 0 ? Math.round((totalAccRevenue / totalRevenue) * 100) : 0;

    const avgHours = daysWorked > 0
      ? parseFloat((totalHours / daysWorked).toFixed(1))
      : null;
    const rubPerHour = totalHours > 0
      ? Math.round(totalRevenue / totalHours)
      : null;
    const discountShare = totalChecks > 0
      ? Math.round((totalDiscountChecks / totalChecks) * 100)
      : 0;

    // Trend
    const dailyRevenues: DailyPoint[] = sortedDays.map((d) => ({
      date: d.date,
      value: Math.round(d.revenue),
    }));
    const xs = sortedDays.map((_, i) => i);
    const ys = sortedDays.map((d) => d.revenue);
    const { slope, r2 } = linearRegression(xs, ys);
    const meanRevenue = avg(ys);
    const trendSlope = meanRevenue > 0
      ? parseFloat(((slope * 7) / meanRevenue * 100).toFixed(1))
      : 0;
    let trend: "up" | "down" | "stable" = "stable";
    if (trendSlope > 5 && r2 > 0.3) trend = "up";
    else if (trendSlope < -5 && r2 > 0.3) trend = "down";

    // Dead time
    const hrMap = sellerHours.get(uuid) ?? new Map();
    const { deadTimePct, deadTimeSlots } = computeDeadTime(hrMap, daySessionsList);

    // Peaks
    const { peakHours, peakHourK, peakHourEfficiency } = computePeakEfficiency(
      hrMap,
      storeHourAvg,
      totalRevenue,
    );

    // Stability
    const dailyValues = sortedDays.map((d) => d.revenue);
    const dailyChecks = sortedDays.map((d) => d.checks);
    const meanRev = avg(dailyValues);
    const meanChk = avg(dailyChecks);
    const revenueCV = meanRev > 0
      ? Math.round((stddev(dailyValues, meanRev) / meanRev) * 100)
      : 0;
    const checkCV = meanChk > 0
      ? Math.round((stddev(dailyChecks, meanChk) / meanChk) * 100)
      : 0;
    const calendarDays = daysBetween(since, until);
    const attendanceRate = calendarDays > 0
      ? Math.round((daysWorked / calendarDays) * 100)
      : 0;
    const lateOpenRate = daysWorked > 0
      ? Math.round((lateOpenCount / daysWorked) * 100)
      : 0;
    const avgLateMinutes = lateOpenCount > 0
      ? Math.round(totalLateMinutes / lateOpenCount)
      : 0;
    const onTimeRate = 100 - lateOpenRate;
    const firstCheckDelay: number | null = firstCheckDelayDays > 0
      ? Math.round(totalFirstCheckDelay / firstCheckDelayDays)
      : null;

    const profile: SellerDNAProfile = {
      uuid,
      name,
      daysWorked,
      totalRevenue: Math.round(totalRevenue),
      avgCheck,
      accShare,
      rubPerHour,
      avgHours,
      trend,
      trendSlope,
      rank: 0,
      overallScore: 0,
      deadTimePct,
      deadTimeSlots,
      peakHours,
      peakHourK,
      peakHourEfficiency,
      revenuPerSquareMeter: null,
      serviceQuality: { avgCheckScore: 0, conversionScore: 0, liquidShareScore: 0, total: 0 },
      stability: { revenueCV, checkCV, attendanceRate, lateOpenRate },
      avgLateMinutes,
      lateRate: lateOpenRate,
      onTimeRate,
      firstCheckDelay,
      totalAbsentMinutes: 0,
      absentRate: 0,
      strengths: [],
      weaknesses: [],
      dnaLabel: "Стабильный",
      dailyRevenue: dailyRevenues,
      hourlyRevenue: [...hrMap.entries()]
        .map(([hour, agg]) => ({
          hour,
          revenue: daysWorked > 0 ? Math.round(agg.revenue / daysWorked) : 0,
          checks: daysWorked > 0 ? Math.round(agg.checks / daysWorked) : 0,
        }))
        .sort((a, b) => a.hour - b.hour),
      storeAvgHourlyRevenue: storeAvgHourly,
      aiInsights: [],
    };

    profiles.push(profile);
  }

  // Compute DNA and rank
  for (const p of profiles) computeDNA(p, profiles);
  profiles.sort((a, b) => b.overallScore - a.overallScore);
  profiles.forEach((p, i) => { p.rank = i + 1; });

  return { sellers: profiles };
}
