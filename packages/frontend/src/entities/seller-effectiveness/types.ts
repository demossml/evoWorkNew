// Исследование эффективности продавцов v2.1 — хардкод-данные
// При подключении API/DuckDB: заменить на useQuery с client.api.employees["seller-effectiveness"].$get()

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
  trendSlope: number;       // ₽/день slope линейной регрессии
  trendDirection: "↑" | "↓" | "→";
  trendR2: number;
  cv: number;               // % без нулевых дней
  mad: number;              // MAD-стабильность
  vapeShare: number;        // % только по SKU с commodity_uuid
  accShare: number;         // % аксессуаров
  stores: SellerStoreMetrics[];
  storeLabels: string[];    // ['П', 'Т'] / ['Т'] / ['45', 'П', 'Т']
  efficiencyVsStore: number; // % vs средняя выручка магазина
  riskLevel: "ok" | "warn" | "critical";
  riskReasons: string[];
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

// ====== ДАННЫЕ ИССЛЕДОВАНИЯ v2.1 ======

export const STORE_BASELINES: StoreBaseline[] = [
  { store: "Победа", days: 92, avgDailyRev: 27451, sd: 9411, cv: 34.3, avgCheck: 366 },
  { store: "Твардоского", days: 91, avgDailyRev: 26249, sd: 7702, cv: 29.3, avgCheck: 337 },
  { store: "45", days: 92, avgDailyRev: 20277, sd: 4732, cv: 23.3, avgCheck: 386 },
];

export const SELLERS: SellerMetrics[] = [
  {
    uuid: "59618984877",
    name: "Александра",
    daysWorked: 51,
    totalChecks: 4104,
    totalRevenue: 1505479,
    avgDailyRev: 29519,
    avgCheck: 367,
    checksPerDay: 80.5,
    trendSlope: -28,
    trendDirection: "→",
    trendR2: 0.005,
    cv: 32.9,
    mad: 0.178,
    vapeShare: 19.1,
    accShare: 47.8,
    stores: [
      { store: "Победа", days: 48, avgDailyRev: 29439, trend: -27, cv: 33.7 },
      { store: "Твардоского", days: 3, avgDailyRev: 30804, trend: -219, cv: 17.8 },
    ],
    storeLabels: ["П", "Т"],
    efficiencyVsStore: 107,
    riskLevel: "ok",
    riskReasons: [],
  },
  {
    uuid: "769619168",
    name: "Карина Боброва",
    daysWorked: 43,
    totalChecks: 3219,
    totalRevenue: 1137741,
    avgDailyRev: 26459,
    avgCheck: 353,
    checksPerDay: 74.9,
    trendSlope: -12,
    trendDirection: "→",
    trendR2: 0.001,
    cv: 31.5,
    mad: 0.207,
    vapeShare: 25.1,
    accShare: 43.4,
    stores: [
      { store: "Твардоского", days: 43, avgDailyRev: 26459, trend: -12, cv: 31.5 },
    ],
    storeLabels: ["Т"],
    efficiencyVsStore: 101,
    riskLevel: "ok",
    riskReasons: [],
  },
  {
    uuid: "valya",
    name: "ВАЛЯ Валентина",
    daysWorked: 28,
    totalChecks: 2275,
    totalRevenue: 724055,
    avgDailyRev: 25859,
    avgCheck: 318,
    checksPerDay: 81.2,
    trendSlope: -93,
    trendDirection: "↓",
    trendR2: 0.049,
    cv: 28.3,
    mad: 0.234,
    vapeShare: 15.7,
    accShare: 37.1,
    stores: [
      { store: "Твардоского", days: 26, avgDailyRev: 25673, trend: -116, cv: 29.4 },
      { store: "Победа", days: 2, avgDailyRev: 28280, trend: 20, cv: 1.9 },
    ],
    storeLabels: ["Т", "П"],
    efficiencyVsStore: 98,
    riskLevel: "critical",
    riskReasons: ["Нисходящий тренд −93 ₽/день", "Самый низкий средний чек (318 ₽)", "Низкая vape-доля (15.7%)"],
  },
  {
    uuid: "1133134176",
    name: "Федорова Карина",
    daysWorked: 50,
    totalChecks: 3232,
    totalRevenue: 1116059,
    avgDailyRev: 22321,
    avgCheck: 345,
    checksPerDay: 64.6,
    trendSlope: -46,
    trendDirection: "→",
    trendR2: 0.022,
    cv: 36.3,
    mad: 0.281,
    vapeShare: 19.8,
    accShare: 42.3,
    stores: [
      { store: "Победа", days: 34, avgDailyRev: 22116, trend: -29, cv: 38.4 },
      { store: "Твардоского", days: 16, avgDailyRev: 22758, trend: -171, cv: 31.5 },
    ],
    storeLabels: ["П", "Т"],
    efficiencyVsStore: 92,
    riskLevel: "warn",
    riskReasons: ["Максимальная волатильность CV 36.3%", "Худший MAD 0.281"],
  },
  {
    uuid: "5415308750",
    name: "Алла",
    daysWorked: 56,
    totalChecks: 2986,
    totalRevenue: 1123899,
    avgDailyRev: 20070,
    avgCheck: 376,
    checksPerDay: 53.3,
    trendSlope: -39,
    trendDirection: "→",
    trendR2: 0.036,
    cv: 28.7,
    mad: 0.183,
    vapeShare: 23.7,
    accShare: 40.0,
    stores: [
      { store: "45", days: 51, avgDailyRev: 19061, trend: -18, cv: 24.7 },
      { store: "Победа", days: 3, avgDailyRev: 26394, trend: -51, cv: 6.9 },
      { store: "Твардоского", days: 2, avgDailyRev: 36310, trend: -2004, cv: 8.3 },
    ],
    storeLabels: ["45", "П", "Т"],
    efficiencyVsStore: 94,
    riskLevel: "ok",
    riskReasons: [],
  },
  {
    uuid: "6555710145",
    name: "Сухорукова Нелли",
    daysWorked: 43,
    totalChecks: 2213,
    totalRevenue: 868610,
    avgDailyRev: 20200,
    avgCheck: 393,
    checksPerDay: 51.5,
    trendSlope: -46,
    trendDirection: "→",
    trendR2: 0.038,
    cv: 30.4,
    mad: 0.174,
    vapeShare: 24.4,
    accShare: 39.5,
    stores: [
      { store: "45", days: 43, avgDailyRev: 20200, trend: -46, cv: 30.4 },
    ],
    storeLabels: ["45"],
    efficiencyVsStore: 100,
    riskLevel: "ok",
    riskReasons: [],
  },
  {
    uuid: "475039971",
    name: "⚠️ Администратор",
    daysWorked: 7,
    totalChecks: 619,
    totalRevenue: 224238,
    avgDailyRev: 32034,
    avgCheck: 362,
    checksPerDay: 88.4,
    trendSlope: -85,
    trendDirection: "↓",
    trendR2: 0.098,
    cv: 20.7,
    mad: 0.150,
    vapeShare: 15.4,
    accShare: 39.6,
    stores: [
      { store: "Победа", days: 6, avgDailyRev: 32914, trend: -137, cv: 20.5 },
      { store: "Твардоского", days: 1, avgDailyRev: 26752, trend: 0, cv: 0 },
    ],
    storeLabels: ["П", "Т"],
    efficiencyVsStore: 0,
    riskLevel: "warn",
    riskReasons: ["n=7 — исключён из рейтинга", "Требуется ≥20 смен"],
  },
];

export const DOW_DATA: DowData[] = [
  {
    store: "Победа", 0: 18402, 1: 29915, 2: 31352, 3: 30962, 4: 30075, 5: 32628, 6: 18552,
    weekdayAvg: 30986, weekendAvg: 18477, dropPct: -40,
  },
  {
    store: "Твардоского", 0: 16606, 1: 25687, 2: 29133, 3: 29000, 4: 30822, 5: 32499, 6: 19245,
    weekdayAvg: 29428, weekendAvg: 17926, dropPct: -39,
  },
  {
    store: "45", 0: 19465, 1: 18587, 2: 20687, 3: 20629, 4: 22405, 5: 21702, 6: 18436,
    weekdayAvg: 20802, weekendAvg: 18950, dropPct: -9,
  },
];

export const HYPOTHESES: HypothesisResult[] = [
  { id: "H1", title: "Эффект точки сильнее эффекта продавца", confirmed: true, summary: "Размах 39–48% внутри магазина. Store fixed effects необходимы." },
  { id: "H2", title: "Vape-доля коррелирует с волатильностью", confirmed: false, summary: "Линейной связи нет. Федорова (сред. vape → макс. CV) — контрпример." },
  { id: "H3", title: "Выходные требуют отдельной модели", confirmed: true, summary: "Спад −40% в Сб–Вс для Победы и Твардоского. 45: всего −9%." },
  { id: "H4", title: "Администратор — high-skill", confirmed: false, summary: "Средний чек 362 ≈ 359 (средний). Высокая выручка — артефакт малого n." },
  { id: "H5", title: "Магазин > продавца для среднего чека", confirmed: false, summary: "Размах продавцов 74 ₽ > размаха магазинов 49 ₽. Кто продаёт — важнее." },
];

export const KPI_SNAPSHOT: KpiSnapshot = {
  totalRevenue: 6700110,
  avgDailyRev: 24867,
  avgCheck: 358,
  totalShifts: 278,
  activeToday: 5,
};
