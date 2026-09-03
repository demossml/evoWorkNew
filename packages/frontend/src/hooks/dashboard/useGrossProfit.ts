import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@shared/api";

export interface GrossProfitShop {
	revenue: number;
	cost: number;
	profit: number;
}

export interface GrossProfitResponse {
	since: string;
	until: string;
	shops: Record<string, GrossProfitShop>;
	total: {
		revenue: number;
		cost: number;
		profit: number;
	};
}

/**
 * Валовая прибыль за период.
 * По умолчанию — сегодня.
 */
export function useGrossProfit(params?: { since?: string; until?: string; enabled?: boolean }) {
	const since = params?.since;
	const until = params?.until;
	const enabled = params?.enabled !== false;

	return useQuery<GrossProfitResponse>({
		queryKey: ["gross-profit", since, until],
		queryFn: async () => {
			const search = new URLSearchParams();
			if (since) search.set("since", since);
			if (until) search.set("until", until);
			const qs = search.toString();
			const res = await fetch(`/api/evotor/gross-profit-today${qs ? "?" + qs : ""}`, {
				headers: getAuthHeaders(),
			});
			if (!res.ok) throw new Error(`Ошибка ${res.status}`);
			return res.json();
		},
		staleTime: 2 * 60_000,
		refetchInterval: 60_000,
		refetchOnWindowFocus: true,
		enabled,
	});
}
