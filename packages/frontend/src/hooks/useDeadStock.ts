import { useQuery } from "@tanstack/react-query";

interface DeadStockItem {
  itemId: string;
  name: string;
  article: string | null;
  currentStock: number | null;
  daysWithoutSales: number;
  lastSaleDate: string | null;
  shopId: string;
  shopName: string;
  totalRevenueLast90Days: number;
  updatedAt: string;
}

interface DeadStockResponse {
  items: DeadStockItem[];
  total: number;
  threshold: number;
  since: string | null;
  until: string | null;
}

interface UseDeadStockParams {
  daysWithoutSales?: number;
  shopId?: string | null;
  since?: string;
  until?: string;
  enabled?: boolean;
}

function buildQuery(params: UseDeadStockParams): string {
  const q = new URLSearchParams();
  if (params.daysWithoutSales) q.set("daysWithoutSales", String(params.daysWithoutSales));
  if (params.shopId) q.set("shopId", params.shopId);
  if (params.since) q.set("since", params.since);
  if (params.until) q.set("until", params.until);
  return q.toString();
}

export function useDeadStock(params: UseDeadStockParams = {}) {
  const query = buildQuery(params);

  return useQuery<DeadStockResponse>({
    queryKey: ["dead-stock", params.daysWithoutSales, params.shopId, params.since, params.until],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/dead-stock?${query}`);
      if (!res.ok) throw new Error("Ошибка загрузки");
      return res.json();
    },
    refetchInterval: 300_000,
    staleTime: 120_000,
    enabled: params.enabled !== false,
  });
}

export type { DeadStockItem, DeadStockResponse, UseDeadStockParams };
