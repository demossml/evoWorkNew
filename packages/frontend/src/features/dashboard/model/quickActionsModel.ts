export type QuickActionModel = {
  title: string;
  description: string;
  iconKey:
    | "door_open"
    | "package"
    | "file_text"
    | "trending_up"
    | "store"
    | "calculator"
    | "sparkles"
    | "upload";
  path: string;
  color: string;
  roles: string[];
  /** Ключ для получения бейджа. undefined = нет бейджа */
  badgeKey?: "deadStock" | "openings" | "lowStock";
  /** Право из FEATURE_CATALOG (report.*). Если задано — видимость по галочке. */
  permissionId?: string;
};

export const QUICK_ACTIONS: QuickActionModel[] = [
  {
    title: "Открытие магазина",
    description: "Зафиксировать открытие",
    iconKey: "door_open",
    path: "/evotor/open-store",
    color: "from-green-500 to-green-600",
    roles: ["CASHIER", "ADMIN", "SUPERADMIN"],
  },
  {
    title: "Мертвые остатки",
    description: "Проверить товары",
    iconKey: "package",
    path: "/evotor/dead-stock",
    color: "from-purple-500 to-purple-600",
    roles: ["ADMIN", "SUPERADMIN"],
    badgeKey: "deadStock",
  },
  {
    title: "Отчет по продажам",
    description: "Просмотр продаж",
    iconKey: "file_text",
    path: "/evotor/sales-report",
    color: "from-blue-500 to-blue-600",
    roles: ["CASHIER", "ADMIN", "SUPERADMIN"],
    permissionId: "report.sales_today",
  },
  {
    title: "Прогноз закупки",
    description: "SMA заказы",
    iconKey: "trending_up",
    path: "/evotor/orders",
    color: "from-orange-500 to-orange-600",
    roles: ["ADMIN", "SUPERADMIN"],
  },
  {
    title: "Открытия ТТ",
    description: "Сводка по открытиям",
    iconKey: "store",
    path: "/evotor/store-openings-admin",
    color: "from-teal-500 to-cyan-600",
    roles: ["SUPERADMIN"],
    permissionId: "report.store_openings",
  },
  {
    title: "Расчеты прибыли",
    description: "Валовая и чистая",
    iconKey: "calculator",
    path: "/evotor/profit",
    color: "from-emerald-500 to-teal-600",
    roles: ["ADMIN", "SUPERADMIN"],
  },
  {
    title: "Себестоимость",
    description: "Загрузить цены",
    iconKey: "upload",
    path: "/evotor/admin/cost-prices",
    color: "from-amber-500 to-orange-600",
    roles: ["ADMIN", "SUPERADMIN"],
  },
];

export function getAvailableQuickActions(
  employeeRole: string,
  can?: (featureId: string) => boolean,
) {
  return QUICK_ACTIONS.filter((action) => {
    if (employeeRole === "SUPERADMIN") return true;
    if (action.permissionId) return can ? can(action.permissionId) : false;
    return action.roles.includes(employeeRole);
  });
}
