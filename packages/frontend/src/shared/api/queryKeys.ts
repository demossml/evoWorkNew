export const queryKeys = {
  employee: {
    me: () => ["employee", "me"] as const,
    role: () => ["employee", "role"] as const,
    uuidAndName: () => ["employee", "uuid-and-name"] as const,
  },
  schedules: {
    all: () => ["schedules", "all"] as const,
  },
  evotor: {
    workingByShops: () => ["evotor", "working-by-shops"] as const,
  },
  stores: {
    shops: () => ["stores", "shops"] as const,
    shopNames: () => ["stores", "shop-names"] as const,
  },
  reports: {
    reportAndPlanToday: () => ["reports", "report-and-plan", "today"] as const,
    sales: {
      shops: (userId: string) => ["reports", "sales", "shops", userId] as const,
      groups: (shopUuid: string) =>
        ["reports", "sales", "groups-by-shop", shopUuid] as const,
    },
    orders: {
      forecast: (params: {
        startDate: string;
        endDate: string;
        shopUuid: string;
        groups: string[];
        period: number;
        userId: string;
      }) =>
        [
          "reports",
          "orders",
          "forecast",
          params.startDate,
          params.endDate,
          params.shopUuid,
          params.groups.join(","),
          params.period,
          params.userId,
        ] as const,
    },
  },
  alerts: {
    todayFinancial: () => ["alerts", "today-financial"] as const,
  },
  stock: {
    health: (days: number) => ["stock", "health", days] as const,
    transfer: (days: number) => ["stock", "transfer", days] as const,
  },
  admin: {
    dataMode: () => ["admin", "data-mode"] as const,
  },
  sellers: {
    advancedStats: (since: string, until: string, benchmarkWeekday?: number, weekday?: number) =>
      ["sellers", "advanced-stats", since, until, benchmarkWeekday, weekday] as const,
    insights: (sellerId: string) =>
      ["sellers", "insights", sellerId] as const,
  },
};
