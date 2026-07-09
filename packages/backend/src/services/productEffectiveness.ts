// services/productEffectiveness.ts
// Глубокий анализ товара на основе D1-данных (index_documents).
// Строится по тому же статистическому каркасу, что и sellerEffectiveness.ts.

import type { D1Database } from "@cloudflare/workers-types";
import {
  avg,
  stddev,
  linearRegression,
  median,
  mad,
  parseDate,
  dayOfWeek,
  daysBetween,
  classifyABC,
  classifyXYZ,
  percentileRank,
  iqrStats,
  isAnomaly,
  trendConfidenceInterval,
} from "./sharedStats";

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface ProductStoreBreakdown {
  store: string;
  revenue: number;
  share: number; // 0–100
}

export interface ProductCrossSell {
  productName: string;
  affinity: number; // % совместной встречаемости
}

export interface ProductHypothesis {
  id: string;
  title: string;
  confirmed: boolean;
  summary: string;
}

export interface ProductMetrics {
  productUuid: string;
  productName: string;
  categoryUuid: string | null;
  categoryName: string | null;

  // База
  netRevenue: number;
  netQuantity: number;
  grossProfit: number;
  marginPct: number;

  // Тренд
  trendSlope: number;
  trendDirection: "↑" | "↓" | "→";
  trendR2: number;
  dailyRevenue: { date: string; value: number }[];

  // CV
  cv: number;
  categoryCv: number;
  cvVsCategory: number | null;

  // Возвраты
  refundRate: number;
  refundRateTrend: number;
  weeklyRefundRates: { week: string; rate: number }[];

  // Концентрация по магазинам
  storeHHI: number;
  storeBreakdown: ProductStoreBreakdown[];

  // Cross-sell
  crossSell: ProductCrossSell[];

  // Возраст в ассортименте
  firstSaleDate: string | null;
  daysInAssortment: number;

  // ABC/XYZ
  abcClass: "A" | "B" | "C";
  xyzClass: "X" | "Y" | "Z";

  // Сегмент
  segment: "star" | "cash_cow" | "problem" | "declining" | "new" | "local_hit";
  rank: number;
  rankEligible: boolean;

  // Гипотезы (только подтверждённые для этого товара)
  hypotheses: ProductHypothesis[];

  // ── Новые поля: расширенная аналитика ──

  /** Композитный индекс здоровья 0–100 */
  healthScore: number;

  /** Перцентиль-ранги относительно всех товаров (0–100) */
  marginPercentile: number;
  cvPercentile: number;
  refundPercentile: number;

  /** Аномальные дни (выбросы по IQR) */
  anomalyDays: { date: string; value: number; direction: "up" | "down" }[];

  /** Доверительный интервал наклона тренда (95%) */
  trendCI: { low: number; high: number; significant: boolean };

  /** Waterfall-декомпозиция изменения выручки vs предыдущий период */
  waterfall: {
    prevRevenue: number;
    currRevenue: number;
    delta: number;
    avgCheckDelta: number;
    checksDelta: number;
    refundDelta: number;
  } | null;

  /** % чеков, в которых встречается товар (basket penetration) */
  basketPenetration: number;

  /** Изменения относительно предыдущего периода */
  prevNetRevenue: number | null;
  prevMarginPct: number | null;
  revenueChangePct: number | null;
  marginChangePts: number | null;
}

export interface ProductKpiSnapshot {
  totalSku: number;
  totalRevenue: number;
  totalGrossProfit: number;
  avgMarginPct: number;
  activeProducts: number;
}

export interface ProductEffectivenessResponse {
  snapshot: ProductKpiSnapshot;
  prevSnapshot: ProductKpiSnapshot | null;
  products: ProductMetrics[];
  hypotheses: { id: string; title: string; confirmed: boolean; summary: string }[];
}

// ═══════════════════════════════════════════════════════════════════
// Internal types
// ═══════════════════════════════════════════════════════════════════

interface DocRow {
  shop_id: string;
  close_date: string;
  transactions: string; // JSON
  type: string; // SELL | PAYBACK
}

interface ProductPosition {
  commodityUuid: string;
  commodityName: string;
  quantity: number;
  price: number;
  costPrice: number;
  resultSum: number;
  isRefund: boolean;
}

interface ProductDayEntry {
  date: string;
  store: string;
  revenue: number;
  quantity: number;
  grossProfit: number;
}

/** Нормализация */
const MIN_DAYS_FOR_PRODUCT_TREND = 5;
const MIN_DAYS_FOR_PRODUCT_RANKING = 10;

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function formatDateLocal(d: Date): string {
  const offset = 3 * 60 * 60 * 1000; // MSK
  const local = new Date(d.getTime() + offset);
  return local.toISOString().slice(0, 10);
}

function getWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00+03:00");
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return monday.toISOString().slice(0, 10);
}

// ═══════════════════════════════════════════════════════════════════
// Core
// ═══════════════════════════════════════════════════════════════════

export async function computeProductEffectiveness(
  db: D1Database,
  params: { period?: number; since?: string; until?: string; store?: string },
): Promise<ProductEffectivenessResponse> {
  // 1. Date range
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

  // Previous period
  const prevEnd = new Date(since + "T00:00:00+03:00");
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - totalDays + 1);
  const prevSince = formatDateLocal(prevStart);
  const prevUntil = formatDateLocal(prevEnd);

  // Resolve store filter
  const shopNames = await getShopNames(db);
  const resolvedStore = resolveStoreParam(params.store, shopNames);

  // 2. Fetch documents (SELL + PAYBACK)
  const [docs, prevDocs] = await Promise.all([
    fetchProductDocs(db, since, until, resolvedStore),
    fetchProductDocs(db, prevSince, prevUntil, resolvedStore),
  ]);

  // 3. Build product→day map
  const productDay = buildProductDayMap(docs);
  const prevProductDay = buildProductDayMap(prevDocs);

  // 4. Category map (uuid → parentUuid, name)
  const catInfo = await buildProductCategoryInfo(db);

  // 5. Category CV
  const categoryCvMap = buildCategoryCvMap(productDay, catInfo.parentMap);

  // 6. Cross-sell
  const crossSellMap = computeCrossSell(docs, 5);

  // 7. ABC/XYZ
  const abcXyzMap = await computeAbcXyz(productDay, catInfo);

  // 8. Build product metrics
  const products = buildProductMetrics(
    productDay, prevProductDay, catInfo, categoryCvMap,
    crossSellMap, abcXyzMap, shopNames, totalDays,
  );

  // 9. Snapshots
  const snapshot = computeProductKpi(products);
  const prevSnapshot = prevDocs.length > 0
    ? computeProductKpi(buildProductMetrics(
        prevProductDay, new Map(), catInfo, categoryCvMap,
        new Map(), new Map(), shopNames, totalDays,
      ))
    : null;

  // 10. Hypotheses
  const hypotheses = buildProductHypotheses(products, categoryCvMap, catInfo);

  return { snapshot, prevSnapshot, products, hypotheses };
}

// ═══════════════════════════════════════════════════════════════════
// D1 queries
// ═══════════════════════════════════════════════════════════════════

function resolveStoreParam(
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

async function fetchProductDocs(
  db: D1Database,
  since: string,
  until: string,
  store?: string,
): Promise<DocRow[]> {
  let sql = `SELECT shop_id, close_date, transactions, type
             FROM index_documents
             WHERE type IN ('SELL', 'PAYBACK')
               AND close_date >= ? AND close_date <= ?`;
  const binds: any[] = [since, until + "T23:59:59"];

  if (store) {
    sql += ` AND shop_id = ?`;
    binds.push(store);
  }

  const res = await db.prepare(sql).bind(...binds).all<DocRow>();
  return res.results ?? [];
}

async function getShopNames(db: D1Database): Promise<Record<string, string>> {
  const res = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>();
  const map: Record<string, string> = {};
  for (const r of res.results ?? []) map[r.uuid] = r.name;
  return map;
}

interface ProductCatInfo {
  parentMap: Map<string, string>;   // productUuid → parentUuid
  parentNameMap: Map<string, string>; // parentUuid → category name
  productNameMap: Map<string, string>; // productUuid → product name
}

async function buildProductCategoryInfo(db: D1Database): Promise<ProductCatInfo> {
  const parentMap = new Map<string, string>();
  const parentNameMap = new Map<string, string>();
  const productNameMap = new Map<string, string>();

  // Get product→parentUuid mapping
  const prodRows = await db
    .prepare("SELECT uuid, name, parentUuid FROM shopProduct WHERE parentUuid IS NOT NULL")
    .all<{ uuid: string; name: string; parentUuid: string }>();
  for (const r of prodRows.results ?? []) {
    parentMap.set(r.uuid, r.parentUuid);
    productNameMap.set(r.uuid, r.name);
  }

  // Get parent names from the products table (groups are also shopProducts with parentUuid=null)
  const parentUuids = [...new Set(parentMap.values())];
  if (parentUuids.length > 0) {
    // Groups are rows in shopProduct where uuid is a parentUuid of another product
    // Their name is the category name
    const placeholders = parentUuids.map(() => "?").join(",");
    const groupRows = await db
      .prepare(`SELECT uuid, name FROM shopProduct WHERE uuid IN (${placeholders})`)
      .bind(...parentUuids)
      .all<{ uuid: string; name: string }>();
    for (const r of groupRows.results ?? []) {
      parentNameMap.set(r.uuid, r.name);
    }
  }

  return { parentMap, parentNameMap, productNameMap };
}

// ═══════════════════════════════════════════════════════════════════
// Parsing
// ═══════════════════════════════════════════════════════════════════

function parseProductPositions(transactionsJson: string): ProductPosition[] {
  const result: ProductPosition[] = [];
  let txs: any[];
  try { txs = JSON.parse(transactionsJson); } catch { return result; }
  if (!Array.isArray(txs)) return result;

  for (const tx of txs) {
    if (tx.type !== "REGISTER_POSITION") continue;
    result.push({
      commodityUuid: tx.commodityUuid || "",
      commodityName: (tx.commodityName || "—").trim(),
      quantity: tx.quantity ?? 0,
      price: tx.price ?? 0,
      costPrice: tx.costPrice ?? 0,
      resultSum: tx.resultSum ?? tx.sum ?? 0,
      isRefund: false, // filled by caller
    });
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// Aggregation
// ═══════════════════════════════════════════════════════════════════

function buildProductDayMap(docs: DocRow[]): Map<string, ProductDayEntry[]> {
  const map = new Map<string, ProductDayEntry[]>();

  for (const doc of docs) {
    const isRefund = doc.type === "PAYBACK";
    const date = doc.close_date.slice(0, 10);
    const store = doc.shop_id;

    const positions = parseProductPositions(doc.transactions);
    for (const pos of positions) {
      const uuid = pos.commodityUuid || pos.commodityName;
      if (!uuid) continue;
      const gp = (pos.price - pos.costPrice) * pos.quantity;

      if (!map.has(uuid)) map.set(uuid, []);
      map.get(uuid)!.push({
        date,
        store,
        revenue: isRefund ? -(pos.resultSum) : pos.resultSum,
        quantity: isRefund ? -pos.quantity : pos.quantity,
        grossProfit: isRefund ? -gp : gp,
      });
    }
  }

  return map;
}

// ═══════════════════════════════════════════════════════════════════
// Category CV
// ═══════════════════════════════════════════════════════════════════

function buildCategoryCvMap(
  productDay: Map<string, ProductDayEntry[]>,
  parentMap: Map<string, string>,
): Map<string, number> {
  // Aggregate by parentUuid → day → revenue
  const catDay = new Map<string, Map<string, number>>();

  for (const [uuid, entries] of productDay) {
    const parent = parentMap.get(uuid) || "__unknown__";
    if (!catDay.has(parent)) catDay.set(parent, new Map());
    const dateMap = catDay.get(parent)!;
    for (const e of entries) {
      dateMap.set(e.date, (dateMap.get(e.date) || 0) + e.revenue);
    }
  }

  const cvMap = new Map<string, number>();
  for (const [parent, dateMap] of catDay) {
    const revs = [...dateMap.values()];
    const a = avg(revs);
    if (a > 0) {
      cvMap.set(parent, (stddev(revs, a) / a) * 100);
    }
  }
  return cvMap;
}

// ═══════════════════════════════════════════════════════════════════
// Cross-sell
// ═══════════════════════════════════════════════════════════════════

function computeCrossSell(
  docs: DocRow[],
  topN: number,
): Map<string, ProductCrossSell[]> {
  // For each document, collect the set of product NAMES present
  // Prefer commodityName over commodityUuid; fall back to UUID only if name is missing or "—"
  const docProducts: string[][] = [];

  for (const doc of docs) {
    const positions = parseProductPositions(doc.transactions);
    const names = [...new Set(positions.map(p => {
      const name = p.commodityName;
      if (name && name !== "—") return name;
      return p.commodityUuid || name || "—";
    }).filter(Boolean))];
    if (names.length >= 2) docProducts.push(names);
  }

  // For each product name, count co-occurrence
  const cooccur = new Map<string, Map<string, number>>();
  const occurrence = new Map<string, number>();

  for (const names of docProducts) {
    for (const n of names) {
      occurrence.set(n, (occurrence.get(n) || 0) + 1);
      if (!cooccur.has(n)) cooccur.set(n, new Map());
      const comap = cooccur.get(n)!;
      for (const v of names) {
        if (n !== v) comap.set(v, (comap.get(v) || 0) + 1);
      }
    }
  }

  // Build result: top-N by affinity, keyed by product name
  const result = new Map<string, ProductCrossSell[]>();
  for (const [name, comap] of cooccur) {
    const total = occurrence.get(name) || 1;
    const items: ProductCrossSell[] = [...comap.entries()]
      .map(([partnerName, count]) => ({
        productName: partnerName,
        affinity: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.affinity - a.affinity)
      .slice(0, topN);
    result.set(name, items);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// Store HHI
// ═══════════════════════════════════════════════════════════════════

function computeStoreHHI(storeRevenues: Map<string, number>): number {
  const total = [...storeRevenues.values()].reduce((s, v) => s + v, 0);
  if (total === 0) return 0;
  let hhi = 0;
  for (const rev of storeRevenues.values()) {
    const share = rev / total;
    hhi += share * share;
  }
  return Math.round(hhi * 10000); // 0–10000
}

// ═══════════════════════════════════════════════════════════════════
// ABC / XYZ
// ═══════════════════════════════════════════════════════════════════

async function computeAbcXyz(
  productDay: Map<string, ProductDayEntry[]>,
  _catInfo: ProductCatInfo,
): Promise<Map<string, { abc: "A" | "B" | "C"; xyz: "X" | "Y" | "Z" }>> {
  const result = new Map<string, { abc: "A" | "B" | "C"; xyz: "X" | "Y" | "Z" }>();

  // ABC: by total net revenue
  const abcItems: { key: string; value: number }[] = [];
  const xyzItems: { key: string; cv: number }[] = [];

  for (const [uuid, entries] of productDay) {
    const byDate = new Map<string, number>();
    let totalRev = 0;
    for (const e of entries) {
      byDate.set(e.date, (byDate.get(e.date) || 0) + e.revenue);
      totalRev += e.revenue;
    }
    abcItems.push({ key: uuid, value: Math.max(0, totalRev) });

    const dailyRevs = [...byDate.values()];
    const a = avg(dailyRevs);
    const cv = a > 0 ? stddev(dailyRevs, a) / a : 999;
    xyzItems.push({ key: uuid, cv });
  }

  const abcMap = classifyABC(abcItems);
  const xyzMap = classifyXYZ(xyzItems);

  for (const item of abcItems) {
    result.set(item.key, {
      abc: abcMap.get(item.key) || "C",
      xyz: xyzMap.get(item.key) || "Z",
    });
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// Build product metrics
// ═══════════════════════════════════════════════════════════════════

function buildProductMetrics(
  productDay: Map<string, ProductDayEntry[]>,
  prevProductDay: Map<string, ProductDayEntry[]>,
  catInfo: ProductCatInfo,
  categoryCvMap: Map<string, number>,
  crossSellMap: Map<string, ProductCrossSell[]>,
  abcXyzMap: Map<string, { abc: "A" | "B" | "C"; xyz: "X" | "Y" | "Z" }>,
  shopNames: Record<string, string>,
  _totalDays: number,
): ProductMetrics[] {
  const products: ProductMetrics[] = [];

  // Precompute category average margin
  const catMarginSum = new Map<string, { sum: number; count: number }>();

  for (const [uuid, entries] of productDay) {
    const parent = catInfo.parentMap.get(uuid);
    if (!parent) continue;

    // Aggregate by date
    const byDate = new Map<string, { revenue: number; gp: number; stores: Set<string> }>();
    for (const e of entries) {
      if (!byDate.has(e.date)) byDate.set(e.date, { revenue: 0, gp: 0, stores: new Set() });
      const agg = byDate.get(e.date)!;
      agg.revenue += e.revenue;
      agg.gp += e.grossProfit;
      agg.stores.add(e.store);
    }

    const sortedDates = [...byDate.keys()].sort();
    const dailyRevenue = sortedDates.map(d => ({
      date: d,
      value: Math.round(byDate.get(d)!.revenue),
    }));

    let totalRevenue = 0;
    let totalGp = 0;
    let totalQuantity = 0;
    const byStore = new Map<string, number>();

    for (const [, agg] of byDate) {
      totalRevenue += agg.revenue;
      totalGp += agg.gp;
      for (const s of agg.stores) {
        byStore.set(s, (byStore.get(s) || 0) + agg.revenue);
      }
    }
    for (const e of entries) {
      totalQuantity += e.quantity;
    }

    const marginPct = totalRevenue > 0 ? (totalGp / totalRevenue) * 100 : 0;

    // Track category margin
    const cm = catMarginSum.get(parent) || { sum: 0, count: 0 };
    cm.sum += marginPct;
    cm.count++;
    catMarginSum.set(parent, cm);

    // Trend
    const revs = [...byDate.values()].map(v => v.revenue);
    const xs = Array.from({ length: revs.length }, (_, i) => i);
    const reg = linearRegression(xs, revs);
    const avgDailyRev = avg(revs);
    const relSlope = avgDailyRev > 0 ? reg.slope / avgDailyRev : 0;
    const trendDirection: "↑" | "↓" | "→" =
      relSlope > 0.02 ? "↑" : relSlope < -0.02 ? "↓" : "→";

    // CV
    const cv = avgDailyRev > 0 ? (stddev(revs, avgDailyRev) / avgDailyRev) * 100 : 0;
    const parentCat = catInfo.parentMap.get(uuid) || "__unknown__";
    const categoryCv = categoryCvMap.get(parentCat) || cv;
    const cvVsCategory = categoryCv > 0 ? cv / categoryCv : null;

    // Refund rate (from productDay, refunds have negative values)
    let totalRefundRevenue = 0;
    for (const e of entries) {
      if (e.revenue < 0) totalRefundRevenue += Math.abs(e.revenue);
    }
    const grossRevenue = totalRevenue + totalRefundRevenue;
    const refundRate = grossRevenue > 0 ? (totalRefundRevenue / grossRevenue) * 100 : 0;

    // Weekly refund trend
    const weeklyRefund = new Map<string, { refund: number; gross: number }>();
    for (const e of entries) {
      const week = getWeekLabel(e.date);
      if (!weeklyRefund.has(week)) weeklyRefund.set(week, { refund: 0, gross: 0 });
      const w = weeklyRefund.get(week)!;
      if (e.revenue < 0) w.refund += Math.abs(e.revenue);
      w.gross += Math.abs(e.revenue);
    }
    const weeklyRefundRates = [...weeklyRefund.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, w]) => ({ week, rate: w.gross > 0 ? (w.refund / w.gross) * 100 : 0 }));
    const refundRateTrend = weeklyRefundRates.length >= 2
      ? linearRegression(
          Array.from({ length: weeklyRefundRates.length }, (_, i) => i),
          weeklyRefundRates.map(r => r.rate),
        ).slope
      : 0;

    // Store HHI + breakdown
    const storeHHI = computeStoreHHI(byStore);
    const totalStoreRev = [...byStore.values()].reduce((s, v) => s + v, 0);
    const storeBreakdown: ProductStoreBreakdown[] = [...byStore.entries()]
      .map(([store, rev]) => ({
        store: shopNames[store] || store,
        revenue: Math.round(rev),
        share: totalStoreRev > 0 ? Math.round((rev / totalStoreRev) * 100) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Cross-sell — look up by product name first, then fall back to UUID
    const productName = catInfo.productNameMap.get(uuid) || uuid.slice(0, 8);
    const crossSell = crossSellMap.get(productName) || crossSellMap.get(uuid) || [];

    // Age in assortment
    const firstSaleDate = sortedDates[0] || null;
    const daysInAssortment = firstSaleDate
      ? daysBetween(firstSaleDate, sortedDates[sortedDates.length - 1])
      : 0;

    // ABC/XYZ
    const abcXyz = abcXyzMap.get(uuid) || { abc: "C" as const, xyz: "Z" as const };

    // Segment
    const segment = determineProductSegment({
      rankPrelim: 0, // filled after sorting
      trendDirection,
      trendR2: reg.r2,
      refundRate,
      refundRateTrend,
      daysInAssortment,
      storeHHI,
      marginPct,
      abcClass: abcXyz.abc,
    });

    // ── Anomaly detection (IQR) ──
    const revValues = dailyRevenue.map(d => d.value);
    const iqr = iqrStats(revValues);
    const anomalyDays = dailyRevenue
      .filter(d => isAnomaly(d.value, iqr))
      .map(d => ({
        date: d.date,
        value: d.value,
        direction: (d.value > iqr.q75 ? "up" : "down") as "up" | "down",
      }));

    // ── Trend confidence interval ──
    const trendCI = trendConfidenceInterval(xs, revs, reg.slope);

    // ── Waterfall vs prev period ──
    const prevEntries = prevProductDay.get(uuid) || [];
    const prevByDate = new Map<string, number>();
    for (const e of prevEntries) {
      prevByDate.set(e.date, (prevByDate.get(e.date) || 0) + e.revenue);
    }
    const prevTotalRevenue = [...prevByDate.values()].reduce((s, v) => s + v, 0);
    const prevTotalChecks = prevByDate.size;
    const prevNetQuantity = prevEntries.reduce((s, e) => s + e.quantity, 0);

    let waterfall: ProductMetrics["waterfall"] = null;
    if (prevTotalRevenue !== 0 && totalRevenue !== 0) {
      const currChecks = byDate.size;
      const currAvgCheck = currChecks > 0 ? totalRevenue / currChecks : 0;
      const prevAvgCheck = prevTotalChecks > 0 ? prevTotalRevenue / prevTotalChecks : 0;
      const refundDelta = -(totalRefundRevenue - prevEntries.filter(e => e.revenue < 0).reduce((s, e) => s + Math.abs(e.revenue), 0));
      waterfall = {
        prevRevenue: Math.round(prevTotalRevenue),
        currRevenue: Math.round(totalRevenue),
        delta: Math.round(totalRevenue - prevTotalRevenue),
        avgCheckDelta: Math.round((currAvgCheck - prevAvgCheck) * currChecks),
        checksDelta: Math.round(prevAvgCheck * (currChecks - prevTotalChecks)),
        refundDelta: Math.round(refundDelta),
      };
    }

    // ── Basket penetration ──
    const totalChecksAll = productDay.size > 0
      ? [...new Set([...productDay.values()].flatMap(e => e.map(x => `${x.date}|${x.store}`)))].length
      : 1;
    const productChecks = byDate.size;
    const basketPenetration = Math.round((productChecks / Math.max(1, totalChecksAll)) * 1000) / 10;

    // ── Previous period metrics ──
    const prevNetRevenue = prevTotalRevenue > 0 ? Math.round(prevTotalRevenue) : null;
    const prevGp = prevEntries.reduce((s, e) => s + e.grossProfit, 0);
    const prevMarginPct = prevTotalRevenue > 0 ? Math.round((prevGp / prevTotalRevenue) * 1000) / 10 : null;
    const revenueChangePct = prevNetRevenue ? Math.round((totalRevenue - prevNetRevenue) / prevNetRevenue * 100) : null;
    const marginChangePts = prevMarginPct !== null ? Math.round((marginPct - prevMarginPct) * 10) / 10 : null;

    products.push({
      productUuid: uuid,
      productName: catInfo.productNameMap.get(uuid) || uuid.slice(0, 8),
      categoryUuid: parentCat === "__unknown__" ? null : parentCat,
      categoryName: parentCat === "__unknown__" ? null : (catInfo.parentNameMap.get(parentCat) || null),
      netRevenue: Math.round(Math.max(0, totalRevenue)),
      netQuantity: Math.round(Math.max(0, totalQuantity)),
      grossProfit: Math.round(totalGp),
      marginPct: Math.round(marginPct * 10) / 10,
      trendSlope: reg.slope,
      trendDirection,
      trendR2: reg.r2,
      dailyRevenue,
      cv: Math.round(cv * 10) / 10,
      categoryCv: Math.round(categoryCv * 10) / 10,
      cvVsCategory: cvVsCategory !== null ? Math.round(cvVsCategory * 100) / 100 : null,
      refundRate: Math.round(refundRate * 10) / 10,
      refundRateTrend: Math.round(refundRateTrend * 1000) / 1000,
      weeklyRefundRates,
      storeHHI,
      storeBreakdown,
      crossSell,
      firstSaleDate,
      daysInAssortment,
      abcClass: abcXyz.abc,
      xyzClass: abcXyz.xyz,
      segment,
      rank: 0,
      rankEligible: revs.length >= MIN_DAYS_FOR_PRODUCT_RANKING,
      hypotheses: [],
      // New fields
      healthScore: 0, // filled in second pass
      marginPercentile: 50,
      cvPercentile: 50,
      refundPercentile: 50,
      anomalyDays,
      trendCI: {
        low: Math.round(trendCI.low * 100) / 100,
        high: Math.round(trendCI.high * 100) / 100,
        significant: trendCI.significant,
      },
      waterfall,
      basketPenetration,
      prevNetRevenue,
      prevMarginPct,
      revenueChangePct,
      marginChangePts,
    });
  }

  // Sort by netRevenue desc, assign ranks
  products.sort((a, b) => b.netRevenue - a.netRevenue);
  let rank = 0;
  for (const p of products) {
    if (p.rankEligible) {
      rank++;
      p.rank = rank;
    }
  }

  // ── Second pass: percentile ranks + health scores ──
  const eligible = products.filter(p => p.rankEligible);
  const allMargins = eligible.map(p => p.marginPct);
  const allCVs = eligible.map(p => p.cv);
  const allRefunds = eligible.map(p => p.refundRate);

  // Category average margins
  const catAvgMargin = new Map<string, number>();
  const catMarginSums = new Map<string, { sum: number; count: number }>();
  for (const p of eligible) {
    if (!p.categoryUuid) continue;
    const cur = catMarginSums.get(p.categoryUuid) || { sum: 0, count: 0 };
    cur.sum += p.marginPct;
    cur.count++;
    catMarginSums.set(p.categoryUuid, cur);
  }
  for (const [cat, val] of catMarginSums) {
    catAvgMargin.set(cat, val.sum / val.count);
  }

  for (const p of products) {
    if (!p.rankEligible) continue;

    // Percentile ranks (higher = better: 80 значит «лучше 80% товаров»)
    p.marginPercentile = percentileRank(p.marginPct, allMargins);
    p.cvPercentile = 100 - percentileRank(p.cv, allCVs); // инвертируем: низкий CV = хорошо
    p.refundPercentile = 100 - percentileRank(p.refundRate, allRefunds); // инвертируем

    // Health score 0–100
    const catAvg = p.categoryUuid ? catAvgMargin.get(p.categoryUuid) : undefined;
    const marginScore = catAvg ? Math.min(100, (p.marginPct / catAvg) * 100) : 50;
    const stabilityScore = p.cvVsCategory !== null
      ? Math.max(0, Math.min(100, (1 - (p.cvVsCategory - 1) / 2) * 100))
      : 50;
    const refundScore = Math.max(0, Math.min(100, (1 - p.refundRate / 20) * 100));
    const diversificationScore = Math.max(0, Math.min(100, (1 - p.storeHHI / 10000) * 100));
    const ageScore = Math.min(100, (p.daysInAssortment / 30) * 100);

    p.healthScore = Math.round(
      0.25 * Math.min(100, p.trendDirection === "↑" ? 100 : p.trendDirection === "→" ? 60 : 20) +
      0.20 * marginScore +
      0.15 * stabilityScore +
      0.15 * refundScore +
      0.15 * diversificationScore +
      0.10 * ageScore,
    );
  }

  // Re-compute segments with actual ranks
  for (const p of products) {
    if (!p.rankEligible) continue;
    p.segment = determineProductSegment({
      rankPrelim: p.rank,
      trendDirection: p.trendDirection,
      trendR2: p.trendR2,
      refundRate: p.refundRate,
      refundRateTrend: p.refundRateTrend,
      daysInAssortment: p.daysInAssortment,
      storeHHI: p.storeHHI,
      marginPct: p.marginPct,
      abcClass: p.abcClass,
    });
  }

  return products;
}

function determineProductSegment(p: {
  rankPrelim: number;
  trendDirection: "↑" | "↓" | "→";
  trendR2: number;
  refundRate: number;
  refundRateTrend: number;
  daysInAssortment: number;
  storeHHI: number;
  marginPct: number;
  abcClass: string;
}): ProductMetrics["segment"] {
  if (p.daysInAssortment < MIN_DAYS_FOR_PRODUCT_TREND) return "new";

  const isTop = p.rankPrelim > 0 && p.rankPrelim <= 10;
  const declining = p.trendDirection === "↓" && p.trendR2 > 0.3;
  const rising = p.trendDirection === "↑" && p.trendR2 > 0.3;

  if (isTop && declining) return "declining";
  if (isTop && p.storeHHI >= 8100) return "local_hit";
  if (isTop && rising && p.marginPct > 20) return "star";
  if (isTop && p.marginPct < 5) return "problem";
  if (isTop) return "cash_cow";
  if (declining) return "declining";

  return "cash_cow";
}

// ═══════════════════════════════════════════════════════════════════
// KPI snapshot
// ═══════════════════════════════════════════════════════════════════

function computeProductKpi(products: ProductMetrics[]): ProductKpiSnapshot {
  const totalSku = products.length;
  const totalRevenue = products.reduce((s, p) => s + p.netRevenue, 0);
  const totalGrossProfit = products.reduce((s, p) => s + p.grossProfit, 0);
  const activeProducts = products.filter(p => p.netRevenue > 0).length;
  const avgMarginPct = totalRevenue > 0
    ? Math.round((totalGrossProfit / totalRevenue) * 1000) / 10
    : 0;

  return {
    totalSku,
    totalRevenue,
    totalGrossProfit,
    avgMarginPct,
    activeProducts,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Hypotheses
// ═══════════════════════════════════════════════════════════════════

function buildProductHypotheses(
  products: ProductMetrics[],
  categoryCvMap: Map<string, number>,
  catInfo: ProductCatInfo,
): { id: string; title: string; confirmed: boolean; summary: string }[] {
  const hypotheses: { id: string; title: string; confirmed: boolean; summary: string }[] = [];

  // H1: Падающий тренд у товаров класса A
  const decliningA = products.filter(
    p => p.abcClass === "A" && p.trendDirection === "↓" && p.trendR2 > 0.3 && p.rankEligible,
  );
  if (decliningA.length > 0) {
    hypotheses.push({
      id: "h1-declining-a",
      title: "Падающий тренд у товаров класса A",
      confirmed: true,
      summary: `${decliningA.length} топ-товаров класса A показывают устойчивый спад: ${decliningA.slice(0, 3).map(p => p.productName).join(", ")}.`,
    });
  } else {
    hypotheses.push({
      id: "h1-declining-a",
      title: "Падающий тренд у товаров класса A",
      confirmed: false,
      summary: "Товары класса A стабильны или растут.",
    });
  }

  // H2: Растущий возврат
  const risingRefund = products.filter(
    p => p.refundRateTrend > 0 && p.refundRate > 5 && p.rankEligible,
  );
  if (risingRefund.length > 0) {
    hypotheses.push({
      id: "h2-rising-refund",
      title: "Растущий возврат",
      confirmed: true,
      summary: `У ${risingRefund.length} товаров растёт доля возвратов: ${risingRefund.slice(0, 3).map(p => `${p.productName} (${p.refundRate}%)`).join(", ")}.`,
    });
  } else {
    hypotheses.push({
      id: "h2-rising-refund",
      title: "Растущий возврат",
      confirmed: false,
      summary: "Доля возвратов стабильна или снижается.",
    });
  }

  // H3: Высокая волатильность относительно категории
  const volatileVsCat = products.filter(
    p => p.cvVsCategory !== null && p.cvVsCategory > 1.5 && p.rankEligible && p.netRevenue > 0,
  );
  if (volatileVsCat.length > 0) {
    const top3 = volatileVsCat.slice(0, 3);
    hypotheses.push({
      id: "h3-volatile-vs-category",
      title: "Волатильность выше категории",
      confirmed: true,
      summary: `${volatileVsCat.length} товаров в ${top3.length > 0 ? Math.round(top3.reduce((s, p) => s + p.cvVsCategory!, 0) / top3.length * 10) / 10 : 0}x волатильнее своей категории: ${top3.map(p => p.productName).join(", ")}.`,
    });
  } else {
    hypotheses.push({
      id: "h3-volatile-vs-category",
      title: "Волатильность выше категории",
      confirmed: false,
      summary: "Волатильность товаров в пределах нормы категорий.",
    });
  }

  // H4: Односалонный хит
  const localHits = products.filter(
    p => p.storeHHI >= 8100 && p.rankEligible && p.rank <= 10,
  );
  if (localHits.length > 0) {
    hypotheses.push({
      id: "h4-local-hit",
      title: "Односалонный хит",
      confirmed: true,
      summary: `${localHits.length} топ-товаров продаются в основном в одной точке: ${localHits.map(p => `${p.productName} (${p.storeBreakdown[0]?.store || "—"})`).join(", ")}. Кандидаты на расширение по сети.`,
    });
  } else {
    hypotheses.push({
      id: "h4-local-hit",
      title: "Односалонный хит",
      confirmed: false,
      summary: "Топ-товары распределены по сети равномерно.",
    });
  }

  // H5: Объёмный низкомаржинальный
  const catAvgMargin = new Map<string, number>();
  for (const p of products) {
    if (!p.categoryUuid || p.marginPct === 0) continue;
    const cur = catAvgMargin.get(p.categoryUuid) || { sum: 0, count: 0 };
    (cur as any).sum += p.marginPct;
    (cur as any).count++;
  }
  const catAvg = new Map<string, number>();
  for (const [cat, val] of catAvgMargin) {
    catAvg.set(cat, (val as any).sum / (val as any).count);
  }

  const lowMarginTop = products.filter(p => {
    if (!p.rankEligible || p.rank > 10 || !p.categoryUuid) return false;
    const avg = catAvg.get(p.categoryUuid);
    return avg !== undefined && p.marginPct < avg * 0.7;
  });

  if (lowMarginTop.length > 0) {
    hypotheses.push({
      id: "h5-low-margin-volume",
      title: "Объёмный низкомаржинальный",
      confirmed: true,
      summary: `${lowMarginTop.length} топ-товаров имеют маржу ниже средней по категории: ${lowMarginTop.map(p => `${p.productName} (${p.marginPct}% vs ~${Math.round(catAvg.get(p.categoryUuid!) || 0)}%)`).join(", ")}.`,
    });
  } else {
    hypotheses.push({
      id: "h5-low-margin-volume",
      title: "Объёмный низкомаржинальный",
      confirmed: false,
      summary: "Маржа топ-товаров в пределах нормы категорий.",
    });
  }

  // H6: Связка без предложения
  const missedCrossSell: string[] = [];
  for (const p of products) {
    if (!p.rankEligible || p.rank > 20) continue;
    if (p.crossSell.length === 0) continue;
    const topAffinity = p.crossSell[0];
    if (topAffinity.affinity > 20) {
      // Check if partner is in bottom 50%
      const partner = products.find(pp => pp.productName === topAffinity.productName || pp.productUuid === topAffinity.productName);
      if (partner && !partner.rankEligible) {
        missedCrossSell.push(`${p.productName} + ${topAffinity.productName} (${topAffinity.affinity}%)`);
      }
    }
  }
  if (missedCrossSell.length > 0) {
    hypotheses.push({
      id: "h6-missed-cross-sell",
      title: "Связка без предложения",
      confirmed: true,
      summary: `${missedCrossSell.length} частых пар покупают вместе, но второй товар продаётся редко: ${missedCrossSell.slice(0, 3).join(", ")}.`,
    });
  } else {
    hypotheses.push({
      id: "h6-missed-cross-sell",
      title: "Связка без предложения",
      confirmed: false,
      summary: "Часто покупаемые вместе товары хорошо представлены в продажах.",
    });
  }

  // Attach confirmed hypotheses to individual products
  for (const p of products) {
    const pHyps: ProductHypothesis[] = [];
    if (p.abcClass === "A" && p.trendDirection === "↓" && p.trendR2 > 0.3) {
      pHyps.push({ id: "h1", title: "Падающая звезда", confirmed: true, summary: `Устойчивый спад выручки (r²=${p.trendR2.toFixed(2)}).` });
    }
    if (p.refundRateTrend > 0 && p.refundRate > 5) {
      pHyps.push({ id: "h2", title: "Растущий возврат", confirmed: true, summary: `Возвраты растут (${p.refundRate}% за период).` });
    }
    if (p.cvVsCategory !== null && p.cvVsCategory > 1.5) {
      pHyps.push({ id: "h3", title: "Нестабильный спрос", confirmed: true, summary: `В ${p.cvVsCategory.toFixed(1)}x волатильнее категории.` });
    }
    if (p.storeHHI >= 8100 && p.rankEligible && p.rank <= 10) {
      pHyps.push({ id: "h4", title: "Односалонный хит", confirmed: true, summary: `${p.storeBreakdown[0]?.share || 0}% продаж в ${p.storeBreakdown[0]?.store || "одной точке"}.` });
    }
    if (p.rankEligible && p.rank <= 10 && p.categoryUuid) {
      const avg = catAvg.get(p.categoryUuid);
      if (avg !== undefined && p.marginPct < avg * 0.7) {
        pHyps.push({ id: "h5", title: "Низкая маржа", confirmed: true, summary: `Маржа ${p.marginPct}% при средней по категории ~${Math.round(avg)}%.` });
      }
    }
    p.hypotheses = pHyps;
  }

  return hypotheses;
}
