import { useQuery } from "@tanstack/react-query";

export interface GrossProfitShop {
	revenue: number;
	cost: number;
	profit: number;
}

export interface GrossProfitResponse {
	date: string;
	shops: Record<string, GrossProfitShop>;
	total: {
		revenue: number;
		cost: number;
		profit: number;
	};
}

/**
 * Валовая прибыль за дату (по умолчанию — сегодня).
 * Обновляется каждые 2 минуты.
 */
export function useGrossProfit(date?: string) {
	return useQuery<GrossProfitResponse>({
		queryKey: ["gross-profit", date],
		queryFn: async () => {
			const params = date ? `?date=${date}` : "";
			const res = await fetch(`/api/evotor/gross-profit-today${params}`);
			if (!res.ok) throw new Error(`Ошибка ${res.status}`);
			return res.json();
		},
		staleTime: 2 * 60_000,
	});
}
