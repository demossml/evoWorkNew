import { useQuery } from "@tanstack/react-query";

export interface ShopOpenStatus {
  shopId: string;
  shopName: string;
  opened: boolean;
  openTime: string | null;
  sellerName: string | null;
  sellerUuid: string | null;
  scheduleOpen: string | null;
  scheduleClose: string | null;
  isWorkingDay: boolean;
  onTime: boolean | null;
  lateByMinutes: number | null;
  notOpenedYet: boolean;
}

interface OpenStatusResponse {
  shops: ShopOpenStatus[];
  date: string;
  targetWeekday: number;
}

async function fetchOpenStatus(date: string): Promise<OpenStatusResponse> {
  const res = await fetch(`/api/evotor/shops/open-status?date=${date}`);
  if (!res.ok) throw new Error("Ошибка загрузки статуса открытия");
  return res.json();
}

export function useOpenStatus(date: string) {
  return useQuery({
    queryKey: ["open-status", date],
    queryFn: () => fetchOpenStatus(date),
    refetchInterval: 60_000,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}
