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
    | "sparkles";
  path: string;
  color: string;
  roles: string[];
  /** Ключ для получения бейджа. undefined = нет бейджа */
  badgeKey?: "deadStock" | "openings" | "lowStock";
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
    roles: ["ADMIN", "SUPERADMIN"],
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
  },
  {
    title: "Расчеты прибыли",
    description: "Валовая и чистая",
    iconKey: "calculator",
    path: "/evotor/profit",
    color: "from-emerald-500 to-teal-600",
    roles: ["ADMIN", "SUPERADMIN"],
  },
];

export function getAvailableQuickActions(employeeRole: string) {
  return QUICK_ACTIONS.filter((action) => action.roles.includes(employeeRole));
}
