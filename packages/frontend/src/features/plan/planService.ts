// features/plan/planService.ts
// Единственное место бизнес-логики плана вейпов.
// Компоненты НЕ считают ничего сами — только отображают.

// ── Пороги статусов ──
const THRESHOLDS = {
  green:  1.0,   // >= 100% — выполнен
  yellow: 0.7,   // >= 70%  — риск
  // < 70% — критично
};

// ── Типы ──
export type PlanStatus = 'green' | 'yellow' | 'red';

export interface PlanProduct {
  name: string;
  qty:  number;
  sum:  number;   // 0 пока бэк не отдаёт
}

export interface PlanShop {
  shopId:             string;
  name:               string;
  plan:               number;
  fact:               number;
  progress:           number;   // 0..1 (может >1 если перевыполнен)
  status:             PlanStatus;
  statusLabel:        string;
  delta:              number;   // fact - plan
  forecast:           number;
  requiredHourlyRate: number;
  remainingAmount:    number;
  products:           PlanProduct[];
}

export interface PlanNetwork {
  totalPlan:     number;
  totalFact:     number;
  progress:      number;
  shopsOnTarget: number;
  shopsTotal:    number;
}

export interface PlanDomainModel {
  network: PlanNetwork;
  shops:   PlanShop[];
  date:    string;
}

// ── Утилиты форматирования ──
export const formatMoney = (v: number): string => {
  if (v == null || !Number.isFinite(v)) return "0";
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
};

export const formatPercent = (v: number): string =>
  `${Math.round(v * 100)}%`;

export const formatDelta = (v: number): string =>
  `${v >= 0 ? '+' : ''}${formatMoney(v)} ₽`;

export const formatRate = (v: number): string =>
  `${formatMoney(v)} ₽/ч`;

// ── Основная функция ──
export function buildPlanDomainModel(
  rawSalesData: Record<string, { datePlan: number; dataSales: number; dataQuantity: Record<string, { qty: number; sum: number } | number> }>,
  date: string,
  workingHoursTotal = 12,
  currentHour?: number,
): PlanDomainModel {
  const now = new Date();
  const hour = currentHour ?? now.getHours();
  const elapsedHours   = Math.max(hour - 9, 0.5);   // открытие в 9:00
  const remainingHours = Math.max(workingHoursTotal - elapsedHours, 0.5);

  const shops: PlanShop[] = Object.entries(rawSalesData).map(([name, d]) => {
    const progress = d.datePlan > 0 ? d.dataSales / d.datePlan : 0;
    const status: PlanStatus =
      progress >= THRESHOLDS.green  ? 'green'  :
      progress >= THRESHOLDS.yellow ? 'yellow' : 'red';

    const ratePerHour  = d.dataSales / elapsedHours;
    const forecast     = ratePerHour * workingHoursTotal;
    const remaining    = Math.max(d.datePlan - d.dataSales, 0);

    const products: PlanProduct[] = Object.entries(d.dataQuantity || {})
      .map(([pname, data]) => ({
        name: pname,
        qty:  typeof data === 'object' ? data.qty : data,
        sum:  typeof data === 'object' ? data.sum : 0,
      }))
      .sort((a, b) => b.qty - a.qty);

    return {
      shopId:             name,
      name,
      plan:               d.datePlan,
      fact:               d.dataSales,
      progress,
      status,
      statusLabel:        status === 'green' ? 'Выполнен' : status === 'yellow' ? 'Риск' : 'Критично',
      delta:              d.dataSales - d.datePlan,
      forecast,
      requiredHourlyRate: remainingHours > 0 ? remaining / remainingHours : 0,
      remainingAmount:    remaining,
      products,
    };
  });

  // Сортировка: отстающие вверху (по возрастанию progress)
  shops.sort((a, b) => a.progress - b.progress);

  const totalPlan = shops.reduce((s, sh) => s + sh.plan, 0);
  const totalFact = shops.reduce((s, sh) => s + sh.fact, 0);

  return {
    date,
    network: {
      totalPlan,
      totalFact,
      progress:      totalPlan > 0 ? totalFact / totalPlan : 0,
      shopsOnTarget: shops.filter(s => s.status === 'green').length,
      shopsTotal:    shops.length,
    },
    shops,
  };
}

// ── Экспорт для JPEG — только ОДИН магазин ──
export function buildShopExportData(shop: PlanShop): {
  vapeSales: { name: string; qty: number; sum: number }[];
  summary:   { plan: number; fact: number; progress: number; delta: number };
} {
  return {
    vapeSales: shop.products,
    summary: {
      plan:     shop.plan,
      fact:     shop.fact,
      progress: shop.progress,
      delta:    shop.delta,
    },
  };
}
