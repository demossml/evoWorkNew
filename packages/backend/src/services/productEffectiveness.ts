// services/productEffectiveness.ts
// Глубокий анализ товаров на основе D1-данных (index_documents).
// Тот же принцип, что и sellerEffectiveness.ts: не "сколько продано" (это
// уже есть в «Прод. отчёте»), а "этот товар — актив или проблема, и почему".

import {
  avg,
  stddev,
  coefficientOfVariation,
  linearRegression,
  trendDirection,
  median,
  mad,
  formatDateLocal,
  resolveStoreParam,
} from "./sharedStats";

const MIN_DAYS_FOR_TREND = 5;
const LOW_MARGIN_THRESHOLD = 15; // %
const HIGH_STORE_CONCENTRATION = 0.7; // HHI-подобный порог: >70% выручки в одном магазине

export interface ProductMetrics {
  uuid: string;
  name: string;
  category: string;
  abcClass: "A" | "B" | "C";
  daysListed: number; // сколько дней товар вообще продавался в этом окне
  firstSoldDate: string | null;
  netRevenue: number;
  netQuantity: number;
  grossProfit: number;
  marginPct: number;
  averagePrice: number;
  refundRate: number;
  refundRateTrend: "↑" | "↓" | "→";
  trendSlope: number;
  trendDirection: "↑" | "↓" | "→";
  trendR2: number;
  cv: number;
  categoryCv: number; // средний CV по категории — база для сравнения
  storeConcentration: number; // 0..1, доля выручки в самом сильном магазине
  topStore: string | null;
  crossSell: { name: string; coOccurrencePct: number }[]; // топ-3 связки
  riskLevel: "ok" | "warn" | "critical";
  riskReasons: string[];
  dailyRevenue: { date: string; value: number }[];
  rankEligible: boolean; // как у продавцов — мало дней = не участвует в честном сравнении по тренду/CV
}

export interface ProductEffectivenessResult {
  products: ProductMetrics[];
  hypotheses: { id: string; title: string; confirmed: boolean; summary: string }[];
  since: string;
  until: string;
}

interface DocRow {
  type: string;
  close_date: string;
  shop_id: string;
  transactions: string;
}

interface RegisterPositionTx {
  type: string;
  commodityUuid: string;
  commodityName: string;
  quantity: number;
  sum: number;
  costPrice: number;
}

export async function computeProductEffectiveness(
  db: D1Database,
  params: { period?: number; since?: string; until?: string; store?: string },
): Promise<ProductEffectivenessResult> {
  const shopNamesEarly = await getShopNames(db);
  const resolvedStore = resolveStoreParam(params.store, shopNamesEarly);

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

  const docs = await fetchDocs(db, since, until, resolvedStore);
  const shopNames = shopNamesEarly;
  const categoryByProduct = await getCategoryByProduct(db);

  type Agg = {
    name: string;
    revenue: number;
    quantity: number;
    refundRevenue: number;
    refundQuantity: number;
    cost: number;
    refundCost: number;
    dailyNet: Map<string, number>;
    dailyRefund: Map<string, number>;
    byStore: Map<string, number>;
    firstSeen: string | null;
    lastSeen: string | null;
    daysSeen: Set<string>;
  };
  const agg = new Map<string, Agg>();

  // Для cross-sell: по каждому SELL-документу — набор товаров в чеке
  const baskets: string[][] = [];

  for (const doc of docs) {
    const isRefund = doc.type === "PAYBACK";
    const day = doc.close_date.slice(0, 10);
    let transactions: RegisterPositionTx[];
    try {
      transactions = JSON.parse(doc.transactions);
    } catch {
      continue;
    }
    if (!Array.isArray(transactions)) continue;

    const basketUuids = new Set<string>();

    for (const tx of transactions) {
      if (tx.type !== "REGISTER_POSITION") continue;
      const uuid = tx.commodityUuid || tx.commodityName;
      if (!uuid) continue;
      if (!agg.has(uuid)) {
        agg.set(uuid, {
          name: (tx.commodityName || uuid).trim(),
          revenue: 0, quantity: 0, refundRevenue: 0, refundQuantity: 0,
          cost: 0, refundCost: 0,
          dailyNet: new Map(), dailyRefund: new Map(), byStore: new Map(),
          firstSeen: null, lastSeen: null, daysSeen: new Set(),
        });
      }
      const a = agg.get(uuid)!;
      const sum = tx.sum ?? 0;
      const quantity = tx.quantity ?? 0;
      const lineCost = (tx.costPrice ?? 0) * quantity;

      if (isRefund) {
        a.refundRevenue += sum;
        a.refundQuantity += quantity;
        a.refundCost += lineCost;
        a.dailyNet.set(day, (a.dailyNet.get(day) ?? 0) - sum);
        a.dailyRefund.set(day, (a.dailyRefund.get(day) ?? 0) + sum);
      } else {
        a.revenue += sum;
        a.quantity += quantity;
        a.cost += lineCost;
        a.dailyNet.set(day, (a.dailyNet.get(day) ?? 0) + sum);
        a.byStore.set(doc.shop_id, (a.byStore.get(doc.shop_id) ?? 0) + sum);
        basketUuids.add(uuid);
      }
      a.daysSeen.add(day);
      if (!a.firstSeen || day < a.firstSeen) a.firstSeen = day;
      if (!a.lastSeen || day > a.lastSeen) a.lastSeen = day;
    }

    if (basketUuids.size > 1) baskets.push([...basketUuids]);
  }

  // Co-purchase counts (сколько раз пара товаров встретилась в одном чеке)
  const coCount = new Map<string, Map<string, number>>();
  const soloCount = new Map<string, number>();
  for (const basket of baskets) {
    for (const uuid of basket) {
      soloCount.set(uuid, (soloCount.get(uuid) ?? 0) + 1);
    }
    for (let i = 0; i < basket.length; i++) {
      for (let j = i + 1; j < basket.length; j++) {
        const [a, b] = [basket[i], basket[j]];
        if (!coCount.has(a)) coCount.set(a, new Map());
        if (!coCount.has(b)) coCount.set(b, new Map());
        coCount.get(a)!.set(b, (coCount.get(a)!.get(b) ?? 0) + 1);
        coCount.get(b)!.set(a, (coCount.get(b)!.get(a) ?? 0) + 1);
      }
    }
  }

  // ABC — те же пороги 70%/90% накопленной выручки, что в orderForecastV2,
  // чтобы класс товара значил одно и то же в обеих фичах.
  const revenueByUuid = [...agg.entries()]
    .map(([uuid, a]) => [uuid, a.revenue - a.refundRevenue] as const)
    .filter(([, r]) => r > 0)
    .sort((a, b) => b[1] - a[1]);
  const totalRevenue = revenueByUuid.reduce((s, [, r]) => s + r, 0);
  const abcMap = new Map<string, "A" | "B" | "C">();
  let cumulative = 0;
  for (const [uuid, revenue] of revenueByUuid) {
    cumulative += revenue;
    const pct = totalRevenue > 0 ? cumulative / totalRevenue : 1;
    abcMap.set(uuid, pct <= 0.7 ? "A" : pct <= 0.9 ? "B" : "C");
  }

  // Категория → средний CV товаров этой категории (база для сравнения,
  // тот же принцип, что "магазин vs сеть" у продавцов)
  const cvByCategory = new Map<string, number[]>();
  for (const [uuid, a] of agg) {
    const category = categoryByProduct.get(uuid) || "Без категории";
    const revs = [...a.dailyNet.values()];
    if (revs.length < 2) continue;
    const m = avg(revs);
    const cv = coefficientOfVariation(m, stddev(revs, m));
    if (!cvByCategory.has(category)) cvByCategory.set(category, []);
    cvByCategory.get(category)!.push(cv);
  }
  const categoryCvBaseline = new Map<string, number>();
  for (const [category, cvs] of cvByCategory) {
    categoryCvBaseline.set(category, avg(cvs));
  }

  const products: ProductMetrics[] = [];

  for (const [uuid, a] of agg) {
    const netRevenue = a.revenue - a.refundRevenue;
    const netQuantity = a.quantity - a.refundQuantity;
    const netCost = a.cost - a.refundCost;
    const grossProfit = netRevenue - netCost;
    const marginPct = netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 1000) / 10 : 0;
    const grossRevenueForRate = a.revenue + a.refundRevenue;
    const refundRate = grossRevenueForRate > 0 ? (a.refundRevenue / grossRevenueForRate) * 100 : 0;

    const sortedDays = [...a.dailyNet.keys()].sort();
    const revs = sortedDays.map(d => a.dailyNet.get(d)!);
    const dailyRevenue = sortedDays.map(d => ({ date: d, value: Math.round(a.dailyNet.get(d)!) }));
    const m = avg(revs);
    const sd = stddev(revs, m);
    const cv = coefficientOfVariation(m, sd);

    const xs = revs.map((_, i) => i);
    const reg = linearRegression(xs, revs);
    const daysListed = a.daysSeen.size;
    const trend = trendDirection(reg, daysListed, MIN_DAYS_FOR_TREND, Math.max(50, m * 0.1));

    // Concentration — доля выручки в самом сильном магазине
    let topStore: string | null = null;
    let topStoreRevenue = 0;
    for (const [storeId, rev] of a.byStore) {
      if (rev > topStoreRevenue) { topStoreRevenue = rev; topStore = storeId; }
    }
    const totalStoreRevenue = [...a.byStore.values()].reduce((s, v) => s + v, 0);
    const storeConcentration = totalStoreRevenue > 0 ? topStoreRevenue / totalStoreRevenue : 0;

    // Cross-sell — топ-3 товара, чаще всего встречающихся в одном чеке
    const partners = coCount.get(uuid);
    const crossSell: { name: string; coOccurrencePct: number }[] = [];
    if (partners && soloCount.get(uuid)) {
      const base = soloCount.get(uuid)!;
      const sorted = [...partners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      for (const [partnerUuid, count] of sorted) {
        const partnerName = agg.get(partnerUuid)?.name || partnerUuid;
        crossSell.push({ name: partnerName, coOccurrencePct: Math.round((count / base) * 1000) / 10 });
      }
    }

    const category = categoryByProduct.get(uuid) || "Без категории";
    const categoryCv = categoryCvBaseline.get(category) ?? cv;
    const abcClass = abcMap.get(uuid) || "C";

    // Refund rate trend — сравнить первую и вторую половину периода по
    // валовым продажам/возвратам (используем dailyNet+dailyRefund как
    // прокси валовой продажи за день, раз это уже посчитано).
    let refundRateTrend: "↑" | "↓" | "→" = "→";
    if (sortedDays.length >= MIN_DAYS_FOR_TREND) {
      const half = Math.floor(sortedDays.length / 2);
      const rateFor = (days: string[]) => {
        let gross = 0, refund = 0;
        for (const d of days) {
          const net = a.dailyNet.get(d) ?? 0;
          const ref = a.dailyRefund.get(d) ?? 0;
          gross += net + ref;
          refund += ref;
        }
        return gross > 0 ? refund / gross : 0;
      };
      const firstRate = rateFor(sortedDays.slice(0, half));
      const secondRate = rateFor(sortedDays.slice(half));
      if (secondRate > firstRate * 1.5 && secondRate > 0.05) refundRateTrend = "↑";
      else if (secondRate < firstRate * 0.5 && firstRate > 0.05) refundRateTrend = "↓";
    }

    const riskReasons: string[] = [];
    let riskLevel: "ok" | "warn" | "critical" = "ok";
    const rankEligible = daysListed >= MIN_DAYS_FOR_TREND;

    if (rankEligible) {
      if (abcClass === "A" && trend === "↓") {
        riskReasons.push(`Топ-товар, тренд ${Math.round(reg.slope)} ₽/день`);
        riskLevel = "critical";
      }
      if (cv > categoryCv * 1.5 && cv > 30) {
        riskReasons.push(`Волатильность ${Math.round(cv)}% (категория ~${Math.round(categoryCv)}%)`);
        riskLevel = riskLevel === "ok" ? "warn" : "critical";
      }
      if (marginPct < LOW_MARGIN_THRESHOLD && netQuantity > 0) {
        riskReasons.push(`Маржа ${marginPct}% (объёмный, но низкомаржинный)`);
        riskLevel = riskLevel === "ok" ? "warn" : riskLevel;
      }
      if (storeConcentration > HIGH_STORE_CONCENTRATION && a.byStore.size >= 2) {
        const storeName = topStore ? shopNames[topStore] || topStore : "?";
        riskReasons.push(`${Math.round(storeConcentration * 100)}% продаж в одном магазине (${storeName})`);
        riskLevel = riskLevel === "ok" ? "warn" : riskLevel;
      }
    }
    if (riskReasons.length === 0) riskReasons.push("Стабильно");

    products.push({
      uuid,
      name: a.name,
      category,
      abcClass,
      daysListed,
      firstSoldDate: a.firstSeen,
      netRevenue: Math.round(netRevenue),
      netQuantity,
      grossProfit: Math.round(grossProfit),
      marginPct,
      averagePrice: netQuantity > 0 ? Math.round(netRevenue / netQuantity) : 0,
      refundRate: Math.round(refundRate * 10) / 10,
      refundRateTrend,
      trendSlope: Math.round(reg.slope),
      trendDirection: trend,
      trendR2: Math.round(reg.r2 * 100) / 100,
      cv: Math.round(cv * 10) / 10,
      categoryCv: Math.round(categoryCv * 10) / 10,
      storeConcentration: Math.round(storeConcentration * 100) / 100,
      topStore: topStore ? shopNames[topStore] || topStore : null,
      crossSell,
      riskLevel,
      riskReasons,
      dailyRevenue,
      rankEligible,
    });
  }

  products.sort((a, b) => b.netRevenue - a.netRevenue);

  const hypotheses = buildHypotheses(products);

  return { products, hypotheses, since, until };
}

function buildHypotheses(products: ProductMetrics[]) {
  const hypotheses: { id: string; title: string; confirmed: boolean; summary: string }[] = [];

  const decliningStars = products.filter(p => p.rankEligible && p.abcClass === "A" && p.trendDirection === "↓");
  if (decliningStars.length > 0) {
    hypotheses.push({
      id: "p1-declining-stars",
      title: "Падение у топовых товаров (класс A)",
      confirmed: true,
      summary: `${decliningStars.length} товаров класса A с падающим трендом: ${decliningStars.slice(0, 5).map(p => p.name).join(", ")}.`,
    });
  }

  const lowMarginVolume = products.filter(p => p.rankEligible && p.marginPct < LOW_MARGIN_THRESHOLD && p.abcClass !== "C");
  if (lowMarginVolume.length > 0) {
    hypotheses.push({
      id: "p2-low-margin-volume",
      title: "Объёмные, но низкомаржинные товары",
      confirmed: true,
      summary: `${lowMarginVolume.length} товаров с заметным объёмом продаж, но маржой ниже ${LOW_MARGIN_THRESHOLD}%: ${lowMarginVolume.slice(0, 5).map(p => p.name).join(", ")}. Кандидаты на пересмотр цены.`,
    });
  }

  const singleStoreHits = products.filter(p => p.rankEligible && p.storeConcentration > HIGH_STORE_CONCENTRATION && p.netRevenue > 0);
  if (singleStoreHits.length > 0) {
    hypotheses.push({
      id: "p3-single-store-concentration",
      title: "Локальные хиты — кандидаты на расширение по сети",
      confirmed: true,
      summary: `${singleStoreHits.length} товаров с концентрацией продаж в одном магазине: ${singleStoreHits.slice(0, 5).map(p => `${p.name} (${p.topStore})`).join(", ")}.`,
    });
  }

  const untappedCrossSell = products.filter(
    p => p.rankEligible && p.crossSell.length > 0 && p.crossSell[0].coOccurrencePct > 40 && p.netQuantity < median(products.map(x => x.netQuantity)),
  );
  if (untappedCrossSell.length > 0) {
    hypotheses.push({
      id: "p4-cross-sell",
      title: "Недоиспользуемые связки товаров",
      confirmed: true,
      summary: `Товары, которые часто покупают вместе с популярными позициями, но сами продаются мало: ${untappedCrossSell.slice(0, 5).map(p => p.name).join(", ")}. Повод для допродажи на кассе.`,
    });
  }

  const risingRefunds = products.filter(p => p.rankEligible && p.refundRateTrend === "↑");
  if (risingRefunds.length > 0) {
    hypotheses.push({
      id: "p5-rising-refunds",
      title: "Растущая доля возвратов",
      confirmed: true,
      summary: `${risingRefunds.length} товаров с ростом доли возвратов во второй половине периода: ${risingRefunds.slice(0, 5).map(p => `${p.name} (${p.refundRate}%)`).join(", ")}. Повод проверить партию/описание/консультацию продавца.`,
    });
  }

  return hypotheses;
}

async function fetchDocs(db: D1Database, since: string, until: string, shopUuid?: string): Promise<DocRow[]> {
  let sql = `SELECT type, close_date, shop_id, transactions FROM index_documents WHERE close_date >= ?1 AND close_date <= ?2 AND type IN ('SELL', 'PAYBACK')`;
  const binds: (string)[] = [since, until];
  if (shopUuid) {
    sql += ` AND shop_id = ?3`;
    binds.push(shopUuid);
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

/** commodityUuid → имя категории (группы), через shopProduct.parentUuid. */
async function getCategoryByProduct(db: D1Database): Promise<Map<string, string>> {
  const res = await db
    .prepare("SELECT uuid, product_group, parentUuid, name FROM shopProduct")
    .all<{ uuid: string; product_group: number; parentUuid: string | null; name: string }>();
  const rows = res.results ?? [];

  const groupNames = new Map<string, string>();
  for (const r of rows) {
    if (r.product_group) groupNames.set(r.uuid, r.name || "Без категории");
  }

  const categoryByProduct = new Map<string, string>();
  for (const r of rows) {
    if (!r.product_group && r.parentUuid) {
      categoryByProduct.set(r.uuid, groupNames.get(r.parentUuid) || "Без категории");
    }
  }
  return categoryByProduct;
}
