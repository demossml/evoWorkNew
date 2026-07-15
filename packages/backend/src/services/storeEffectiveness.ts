// services/storeEffectiveness.ts
// Глубокий анализ магазинов на основе D1-данных (index_documents +
// opening_photos для гипотезы про открытие).

import {
  avg,
  stddev,
  coefficientOfVariation,
  linearRegression,
  trendDirection,
  formatDateLocal,
} from "./sharedStats";

const MIN_DAYS_FOR_TREND = 5;

export interface StoreMetrics {
  uuid: string;
  name: string;
  daysActive: number;
  netRevenue: number;
  netQuantity: number;
  grossProfit: number;
  marginPct: number;
  avgDailyRev: number;
  trendSlope: number;
  trendDirection: "↑" | "↓" | "→";
  trendR2: number;
  cv: number;
  networkCv: number; // сеть в целом, без этого магазина — база для сравнения
  revenuePerHour: number | null; // прокси: выручка / (время последний-первый чек за день, усреднённое)
  revenuePerSeller: number; // выручка / кол-во уникальных продавцов за период
  uniqueSellers: number;
  sellerTurnoverPct: number | null; // доля продавцов текущего месяца, которых не было в предыдущем
  categoryMix: { category: string; sharePct: number; networkSharePct: number; deviationPp: number }[];
  hourlyRevenue: { hour: number; avgRevenue: number }[]; // распределение по часам (локальное время магазина), усреднённое по дням
  riskLevel: "ok" | "warn" | "critical";
  riskReasons: string[];
  dailyRevenue: { date: string; value: number }[];
  rankEligible: boolean;
  utcOffset: number; // +N часов к UTC для локального времени магазина (автоопределено)
}

export interface OpeningCorrelation {
  sampleSize: number;
  correlation: number | null; // Pearson r между временем завершения открытия (часы от полуночи) и выручкой дня
  interpretation: string;
}

export interface StoreEffectivenessResult {
  stores: StoreMetrics[];
  openingCorrelation: OpeningCorrelation;
  hypotheses: { id: string; title: string; confirmed: boolean; summary: string }[];
  since: string;
  until: string;
}

interface DocRow {
  type: string;
  close_date: string;
  shop_id: string;
  open_user_uuid: string;
  transactions: string;
}

/**
 * Автоопределение UTC-смещения магазина по распределению транзакций.
 * Алгоритм: находим час P5 (5-й перцентиль транзакций) в UTC и считаем,
 * что это 9:00 утра по локальному времени магазина.
 * offset = 9 - p5HourUtc  (напр., P5=5 UTC → offset=+4, Самарское время)
 */
function detectUtcOffset(hourlyCounts: Map<number, number>): number {
  const entries = [...hourlyCounts.entries()].sort((a, b) => a[0] - b[0]);
  if (entries.length === 0) return 3; // default Moscow

  const total = entries.reduce((sum, [, c]) => sum + c, 0);
  if (total === 0) return 3;

  let cum = 0;
  for (const [h, c] of entries) {
    cum += c;
    if (cum >= total * 0.05) {
      const offset = 9 - h;
      // clamp to realistic Russian timezones: UTC+2 (Kaliningrad) to UTC+12 (Kamchatka)
      return Math.max(2, Math.min(12, offset));
    }
  }
  return 3;
}

export async function computeStoreEffectiveness(
  db: D1Database,
  params: { period?: number; since?: string; until?: string },
): Promise<StoreEffectivenessResult> {
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

  const docs = await fetchDocs(db, since, until);
  const shopNames = await getShopNames(db);
  const categoryByProduct = await getCategoryByProduct(db);

  type Agg = {
    revenue: number;
    quantity: number;
    refundRevenue: number;
    refundCost: number;
    cost: number;
    dailyNet: Map<string, number>;
    sellers: Set<string>;
    dailySpanMs: Map<string, { first: number; last: number }>;
    categoryRevenue: Map<string, number>;
    hourlyRevenue: Map<number, number>;
    hourlyDayCount: Set<string>;
  };
  const byStore = new Map<string, Agg>();
  const networkCategoryRevenue = new Map<string, number>();
  let networkTotalRevenue = 0;

  for (const doc of docs) {
    const isRefund = doc.type === "PAYBACK";
    const day = doc.close_date.slice(0, 10);
    const store = doc.shop_id;
    if (!byStore.has(store)) {
      byStore.set(store, {
        revenue: 0, quantity: 0, refundRevenue: 0, refundCost: 0, cost: 0,
        dailyNet: new Map(), sellers: new Set(), dailySpanMs: new Map(),
        categoryRevenue: new Map(), hourlyRevenue: new Map(), hourlyDayCount: new Set(),
      });
    }
    const s = byStore.get(store)!;
    if (doc.open_user_uuid) s.sellers.add(doc.open_user_uuid);

    const ms = Date.parse(doc.close_date.replace(" ", "T") + (doc.close_date.includes("+") ? "" : "+03:00"));
    if (!Number.isNaN(ms)) {
      if (!s.dailySpanMs.has(day)) s.dailySpanMs.set(day, { first: ms, last: ms });
      const span = s.dailySpanMs.get(day)!;
      if (ms < span.first) span.first = ms;
      if (ms > span.last) span.last = ms;
    }

    let transactions: any[];
    try { transactions = JSON.parse(doc.transactions); } catch { continue; }
    if (!Array.isArray(transactions)) continue;

    let docSum = 0;
    for (const tx of transactions) {
      if (tx.type === "REGISTER_POSITION") {
        const sum = tx.sum ?? 0;
        const quantity = tx.quantity ?? 0;
        const lineCost = (tx.costPrice ?? 0) * quantity;
        const category = categoryByProduct.get(tx.commodityUuid) || "Без категории";
        if (isRefund) {
          s.refundRevenue += sum;
          s.refundCost += lineCost;
        } else {
          s.revenue += sum;
          s.quantity += quantity;
          s.cost += lineCost;
          s.categoryRevenue.set(category, (s.categoryRevenue.get(category) ?? 0) + sum);
          networkCategoryRevenue.set(category, (networkCategoryRevenue.get(category) ?? 0) + sum);
          networkTotalRevenue += sum;
          docSum += sum;
        }
      }
    }
    s.dailyNet.set(day, (s.dailyNet.get(day) ?? 0) + (isRefund ? -docSum : docSum));

    if (!isRefund && !Number.isNaN(ms)) {
      const hour = new Date(ms).getUTCHours();
      s.hourlyRevenue.set(hour, (s.hourlyRevenue.get(hour) ?? 0) + docSum);
      s.hourlyDayCount.add(day);
    }
  }

  const employeesByStoreMonth = await getSellersByStoreMonth(db, since, until);

  const stores: StoreMetrics[] = [];
  for (const [storeId, s] of byStore) {
    const sortedDays = [...s.dailyNet.keys()].sort();
    const revs = sortedDays.map(d => s.dailyNet.get(d)!);
    const dailyRevenue = sortedDays.map(d => ({ date: d, value: Math.round(s.dailyNet.get(d)!) }));
    const netRevenue = revs.reduce((a, b) => a + b, 0);
    const netCost = s.cost - s.refundCost;
    const grossProfit = netRevenue - netCost;
    const marginPct = netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 1000) / 10 : 0;

    const m = avg(revs);
    const sd = stddev(revs, m);
    const cv = coefficientOfVariation(m, sd);

    const xs = revs.map((_, i) => i);
    const reg = linearRegression(xs, revs);
    const daysActive = sortedDays.length;
    const trend = trendDirection(reg, daysActive, MIN_DAYS_FOR_TREND, Math.max(200, m * 0.1));

    // Network CV baseline = CV of (network total minus this store), so a
    // store isn't compared against a baseline that includes itself.
    const otherStoresRevs = new Map<string, number>();
    for (const [otherId, other] of byStore) {
      if (otherId === storeId) continue;
      for (const [day, v] of other.dailyNet) {
        otherStoresRevs.set(day, (otherStoresRevs.get(day) ?? 0) + v);
      }
    }
    const networkRevs = [...otherStoresRevs.values()];
    const networkM = avg(networkRevs);
    const networkCv = coefficientOfVariation(networkM, stddev(networkRevs, networkM));

    // Revenue per hour — average daily span (last sale - first sale) across
    // days with at least 2 sales that day (a single sale gives a zero span
    // that says nothing about hours open).
    const spans: number[] = [];
    for (const { first, last } of s.dailySpanMs.values()) {
      if (last > first) spans.push((last - first) / 3_600_000);
    }
    const avgHours = spans.length > 0 ? avg(spans) : null;
    const revenuePerHour = avgHours && avgHours > 0.5 ? Math.round(m / avgHours) : null;

    const uniqueSellers = s.sellers.size;
    const revenuePerSeller = uniqueSellers > 0 ? Math.round(netRevenue / uniqueSellers) : 0;

    // Category mix vs network
    const categoryMix = [...s.categoryRevenue.entries()]
      .map(([category, rev]) => {
        const sharePct = netRevenue > 0 ? (rev / (netRevenue + s.refundRevenue)) * 100 : 0;
        const networkSharePct = networkTotalRevenue > 0 ? (networkCategoryRevenue.get(category)! / networkTotalRevenue) * 100 : 0;
        return {
          category,
          sharePct: Math.round(sharePct * 10) / 10,
          networkSharePct: Math.round(networkSharePct * 10) / 10,
          deviationPp: Math.round((sharePct - networkSharePct) * 10) / 10,
        };
      })
      .sort((a, b) => Math.abs(b.deviationPp) - Math.abs(a.deviationPp));

    // Detect store timezone from hourly distribution
    const utcOffset = detectUtcOffset(s.hourlyRevenue);

    const hourlyRevenue = [...s.hourlyRevenue.entries()]
      .map(([hourUtc, total]) => {
        const localHour = (hourUtc + utcOffset + 24) % 24;
        return { hour: localHour, avgRevenue: Math.round(total / Math.max(1, s.hourlyDayCount.size)) };
      })
      .sort((a, b) => a.hour - b.hour);

    // Turnover proxy
    const monthKeys = [...employeesByStoreMonth.keys()].filter(k => k.startsWith(storeId + "|")).sort();
    let sellerTurnoverPct: number | null = null;
    if (monthKeys.length >= 2) {
      const lastMonth = employeesByStoreMonth.get(monthKeys[monthKeys.length - 1])!;
      const prevMonth = employeesByStoreMonth.get(monthKeys[monthKeys.length - 2])!;
      const left = [...prevMonth].filter(u => !lastMonth.has(u));
      sellerTurnoverPct = prevMonth.size > 0 ? Math.round((left.length / prevMonth.size) * 1000) / 10 : 0;
    }

    const rankEligible = daysActive >= MIN_DAYS_FOR_TREND;
    const riskReasons: string[] = [];
    let riskLevel: "ok" | "warn" | "critical" = "ok";
    if (rankEligible) {
      if (trend === "↓") {
        riskReasons.push(`Тренд ${Math.round(reg.slope)} ₽/день`);
        riskLevel = "warn";
      }
      if (cv > networkCv * 1.5 && cv > 25) {
        riskReasons.push(`Волатильность ${Math.round(cv)}% (сеть ~${Math.round(networkCv)}%)`);
        riskLevel = riskLevel === "ok" ? "warn" : "critical";
      }
      if (sellerTurnoverPct != null && sellerTurnoverPct > 40) {
        riskReasons.push(`Текучка продавцов ${sellerTurnoverPct}% за месяц`);
        riskLevel = riskLevel === "ok" ? "warn" : "critical";
      }
      const bigDeviation = categoryMix.find(c => Math.abs(c.deviationPp) > 15);
      if (bigDeviation) {
        riskReasons.push(`«${bigDeviation.category}» ${bigDeviation.deviationPp > 0 ? "выше" : "ниже"} сети на ${Math.abs(bigDeviation.deviationPp)}пп`);
      }
    }
    if (riskReasons.length === 0) riskReasons.push("Стабильно");

    stores.push({
      uuid: storeId,
      name: shopNames[storeId] || storeId,
      daysActive,
      netRevenue: Math.round(netRevenue),
      netQuantity: s.quantity,
      grossProfit: Math.round(grossProfit),
      marginPct,
      avgDailyRev: Math.round(m),
      trendSlope: Math.round(reg.slope),
      trendDirection: trend,
      trendR2: Math.round(reg.r2 * 100) / 100,
      cv: Math.round(cv * 10) / 10,
      networkCv: Math.round(networkCv * 10) / 10,
      revenuePerHour,
      revenuePerSeller,
      uniqueSellers,
      sellerTurnoverPct,
      categoryMix,
      hourlyRevenue,
      riskLevel,
      riskReasons,
      dailyRevenue,
      rankEligible,
      utcOffset,
    });
  }

  stores.sort((a, b) => b.netRevenue - a.netRevenue);

  const openingCorrelation = await computeOpeningCorrelation(db, since, until, byStore, Object.fromEntries(stores.map(s => [s.uuid, s.utcOffset])));
  const hypotheses = buildHypotheses(stores, openingCorrelation);

  return { stores, openingCorrelation, hypotheses, since, until };
}

function buildHypotheses(stores: StoreMetrics[], opening: OpeningCorrelation) {
  const hypotheses: { id: string; title: string; confirmed: boolean; summary: string }[] = [];

  const declining = stores.filter(s => s.rankEligible && s.trendDirection === "↓");
  if (declining.length > 0) {
    hypotheses.push({
      id: "s1-declining",
      title: "Падающий тренд по магазинам",
      confirmed: true,
      summary: `${declining.map(s => `${s.name} (${s.trendSlope} ₽/день, r²=${s.trendR2})`).join(", ")}.`,
    });
  }

  const volatile = stores.filter(s => s.rankEligible && s.riskReasons.some(r => r.startsWith("Волатильность")));
  if (volatile.length > 0) {
    hypotheses.push({
      id: "s2-volatile",
      title: "Магазины волатильнее сети",
      confirmed: true,
      summary: volatile.map(s => `${s.name}: CV ${s.cv}% против сети ~${s.networkCv}%`).join("; "),
    });
  }

  const skewed = stores.filter(s => s.rankEligible && s.categoryMix.some(c => Math.abs(c.deviationPp) > 15));
  if (skewed.length > 0) {
    hypotheses.push({
      id: "s3-assortment-skew",
      title: "Перекос ассортимента относительно сети",
      confirmed: true,
      summary: skewed.map(s => {
        const top = s.categoryMix[0];
        return `${s.name}: «${top.category}» ${top.deviationPp > 0 ? "выше" : "ниже"} сети на ${Math.abs(top.deviationPp)}пп`;
      }).join("; "),
    });
  }

  const turnover = stores.filter(s => s.sellerTurnoverPct != null && s.sellerTurnoverPct > 40);
  if (turnover.length > 0) {
    hypotheses.push({
      id: "s4-turnover",
      title: "Высокая текучка продавцов",
      confirmed: true,
      summary: turnover.map(s => `${s.name}: ${s.sellerTurnoverPct}% за месяц`).join("; "),
    });
  }

  hypotheses.push({
    id: "s5-opening-correlation",
    title: "Связь времени открытия магазина с выручкой дня",
    confirmed: opening.correlation != null && Math.abs(opening.correlation) > 0.3,
    summary: opening.interpretation,
  });

  return hypotheses;
}

/**
 * H4 из концепции: коррелирует ли время завершения открытия (по факту
 * последней загруженной фотографии чек-листа за день) с выручкой этого дня.
 * Это не полноценный time-clock — opening_photos.created_at это когда фото
 * дошло до сервера, не факт открытия по регламенту секунда в секунду — но
 * это единственный источник времени, который вообще есть для открытия.
 * Пирсоновская корреляция, без притворства в точности: если данных мало
 * или связь слабая, отчёт честно об этом говорит, а не рисует стрелку.
 */
async function computeOpeningCorrelation(
  db: D1Database,
  since: string,
  until: string,
  byStore: Map<string, { dailyNet: Map<string, number> }>,
  storeOffsets: Record<string, number>,
): Promise<OpeningCorrelation> {
  let rows: { shop_uuid: string; date: string; last_photo: string }[] = [];
  try {
    const res = await db
      .prepare(`
        SELECT shop_uuid, date, MAX(created_at) as last_photo
        FROM opening_photos
        WHERE date >= ?1 AND date <= ?2
        GROUP BY shop_uuid, date
      `)
      .bind(since, until)
      .all<{ shop_uuid: string; date: string; last_photo: string }>();
    rows = res.results ?? [];
  } catch {
    return { sampleSize: 0, correlation: null, interpretation: "Нет данных по фото открытия за этот период." };
  }

  const hours: number[] = [];
  const revenues: number[] = [];
  for (const row of rows) {
    const store = byStore.get(row.shop_uuid);
    const rev = store?.dailyNet.get(row.date);
    if (rev == null) continue;
    const ms = Date.parse(row.last_photo.replace(" ", "T") + "Z"); // created_at — SQLite datetime('now'), это UTC
    if (Number.isNaN(ms)) continue;
    const offsetHours = storeOffsets[row.shop_uuid] ?? 3;
    const localMs = ms + offsetHours * 3_600_000;
    const hourOfDay = new Date(localMs).getUTCHours() + new Date(localMs).getUTCMinutes() / 60;
    hours.push(hourOfDay);
    revenues.push(rev);
  }

  if (hours.length < 10) {
    return {
      sampleSize: hours.length,
      correlation: null,
      interpretation: `Недостаточно данных (${hours.length} дней с фото открытия) для статистически значимого вывода — нужно минимум 10.`,
    };
  }

  const r = pearsonCorrelation(hours, revenues);
  const strength = Math.abs(r) > 0.5 ? "сильная" : Math.abs(r) > 0.3 ? "умеренная" : "слабая или отсутствует";
  const direction = r < 0 ? "чем позже завершено открытие, тем ниже выручка дня" : "выраженной отрицательной связи не видно";
  return {
    sampleSize: hours.length,
    correlation: Math.round(r * 100) / 100,
    interpretation: `r=${Math.round(r * 100) / 100} на ${hours.length} днях. Связь ${strength}${r < -0.3 ? ` — ${direction}` : ""}.`,
  };
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = avg(xs), my = avg(ys);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den === 0 ? 0 : num / den;
}

async function fetchDocs(db: D1Database, since: string, until: string): Promise<DocRow[]> {
  const res = await db
    .prepare(`SELECT type, close_date, shop_id, open_user_uuid, transactions FROM index_documents WHERE close_date >= ?1 AND close_date <= ?2 AND type IN ('SELL', 'PAYBACK')`)
    .bind(since, until)
    .all<DocRow>();
  return res.results ?? [];
}

async function getShopNames(db: D1Database): Promise<Record<string, string>> {
  const res = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>();
  const map: Record<string, string> = {};
  for (const r of res.results ?? []) map[r.uuid] = r.name;
  return map;
}

async function getCategoryByProduct(db: D1Database): Promise<Map<string, string>> {
  const res = await db
    .prepare("SELECT uuid, product_group, parentUuid, name FROM shopProduct")
    .all<{ uuid: string; product_group: number; parentUuid: string | null; name: string }>();
  const rows = res.results ?? [];
  const groupNames = new Map<string, string>();
  for (const r of rows) if (r.product_group) groupNames.set(r.uuid, r.name || "Без категории");
  const categoryByProduct = new Map<string, string>();
  for (const r of rows) if (!r.product_group && r.parentUuid) {
    categoryByProduct.set(r.uuid, groupNames.get(r.parentUuid) || "Без категории");
  }
  return categoryByProduct;
}

/** Map "shopUuid|YYYY-MM" → Set of employee uuids active that store-month, from index_documents (who actually sold), not from `schedule` — reflects who really worked, not who was scheduled. */
async function getSellersByStoreMonth(db: D1Database, since: string, until: string): Promise<Map<string, Set<string>>> {
  const res = await db
    .prepare(`SELECT shop_id, close_date, open_user_uuid FROM index_documents WHERE close_date >= ?1 AND close_date <= ?2 AND type = 'SELL'`)
    .bind(since, until)
    .all<{ shop_id: string; close_date: string; open_user_uuid: string }>();
  const map = new Map<string, Set<string>>();
  for (const r of res.results ?? []) {
    if (!r.open_user_uuid) continue;
    const monthKey = `${r.shop_id}|${r.close_date.slice(0, 7)}`;
    if (!map.has(monthKey)) map.set(monthKey, new Set());
    map.get(monthKey)!.add(r.open_user_uuid);
  }
  return map;
}
