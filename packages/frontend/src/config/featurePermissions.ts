/**
 * featurePermissions — единый реестр прав на отчёты и плитки Home.
 * Семантика: если id есть в списке роли (ADMIN/CASHIER) — разрешено.
 * SUPERADMIN всегда видит всё. Прибыль для CASHIER всегда запрещена.
 */

export type FeatureGroup = "home" | "report";

export type FeatureDef = {
  id: string;
  label: string;
  group: FeatureGroup;
  path?: string;
  /** Жёсткий запрет: нельзя выдать CASHIER (прибыль/маржа). */
  profit?: boolean;
};

export const FEATURE_CATALOG: FeatureDef[] = [
  // ── Home ──
  { id: "home.revenue", label: "Выручка (Home)", group: "home" },
  { id: "home.tempo", label: "Темп продаж (Home)", group: "home" },
  { id: "home.finance", label: "Финансы (Home)", group: "home", profit: true },
  { id: "home.best_shop", label: "Эффективность (Home)", group: "home", profit: true },
  { id: "home.top_products", label: "Топ продуктов (Home)", group: "home" },
  { id: "home.accessories", label: "Аксессуары (Home)", group: "home" },
  { id: "home.high_margin", label: "Высокомаржинальные (Home)", group: "home", profit: true },
  { id: "home.focus", label: "Фокус (Home)", group: "home" },
  { id: "home.plan", label: "План (Home)", group: "home" },
  { id: "home.promo", label: "Акционные товары (Home)", group: "home" },
  { id: "home.alerts", label: "Алерты (Home)", group: "home" },
  { id: "home.stock", label: "Состояние склада (Home)", group: "home" },
  { id: "home.opening_status", label: "Открытие точки (Home)", group: "home" },
  { id: "home.quick_actions", label: "Быстрые действия (Home)", group: "home" },
  { id: "home.sync_status", label: "Синхронизация (Home)", group: "home" },

  // ── Reports ──
  { id: "report.sales_today", label: "Продуктовый отчёт", group: "report", path: "/evotor/sales-report" },
  { id: "report.period_comparison", label: "Сравнение периодов", group: "report", path: "/evotor/period-comparison" },
  { id: "report.salary", label: "Зарплата сотрудников", group: "report", path: "/evotor/salary-report" },
  { id: "report.sales_period", label: "Финансовый отчёт", group: "report", path: "/evotor/sales-for-the-period", profit: true },
  { id: "report.profit_gross", label: "Валовая прибыль", group: "report", path: "/evotor/gross-profit", profit: true },
  { id: "report.orders", label: "Заказ товара", group: "report", path: "/evotor/orders" },
  { id: "report.stock_realization", label: "Товарные остатки", group: "report", path: "/evotor/stock-realization-report" },
  { id: "report.dead_stock", label: "Dead stock", group: "report", path: "/evotor/dead-stock" },
  { id: "report.seller_dna", label: "Seller DNA", group: "report", path: "/evotor/seller-dna" },
  { id: "report.product_analysis", label: "Товары (аналитика)", group: "report", path: "/evotor/product-analysis" },
  { id: "report.store_analysis", label: "Магазины (аналитика)", group: "report", path: "/evotor/store-analysis" },
  { id: "report.store_openings", label: "Открытия (сводка)", group: "report", path: "/evotor/store-openings-admin" },
];

export type RoleFeaturePermissions = {
  version: 1;
  ADMIN: string[];
  CASHIER: string[];
};

/** Дефолты: обратная совместимость с текущим поведением. */
export function defaultFeaturePermissions(): RoleFeaturePermissions {
  return {
    version: 1,
    ADMIN: FEATURE_CATALOG.map((f) => f.id),
    CASHIER: FEATURE_CATALOG.filter((f) => !f.profit).map((f) => f.id).filter(
      (id) => !["report.period_comparison", "report.salary", "report.dead_stock", "report.seller_dna", "report.product_analysis", "report.store_analysis", "report.store_openings", "home.sync_status", "home.stock", "home.promo", "home.best_shop"].includes(id),
    ),
  };
}

export function canAccessFeature(
  role: string | null | undefined,
  featureId: string,
  perms: RoleFeaturePermissions,
): boolean {
  if (role === "SUPERADMIN") return true;
  // жёсткий запрет прибыли для кассира
  const def = FEATURE_CATALOG.find((f) => f.id === featureId);
  if (def?.profit && role === "CASHIER") return false;
  const list = role === "ADMIN" ? perms.ADMIN : role === "CASHIER" ? perms.CASHIER : [];
  return list.includes(featureId);
}
