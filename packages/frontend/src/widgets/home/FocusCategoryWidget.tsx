/**
 * FocusCategoryWidget — компактная карточка «Фокус».
 * Показывает выбранные группы товаров и их долю в выручке за сегодня.
 * Скрывается сам, если focus-группы не выбраны.
 */

import { useQuery } from "@tanstack/react-query";
import { Crosshair } from "lucide-react";
import { getAuthHeaders } from "@shared/api";

type FocusSales = {
  groups: Array<{ uuid: string; name: string }>;
  focusRevenue: number;
  totalRevenue: number;
  sharePct: number;
};

function formatRub(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}

export function FocusCategoryWidget() {
  const { data, isLoading } = useQuery<FocusSales>({
    queryKey: ["focus-category-sales"],
    queryFn: async () => {
      const d = new Date();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const today = `${d.getFullYear()}-${m}-${day}`;
      const res = await fetch(`/api/tenant/focus-category/sales?since=${today}&until=${today}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  if (isLoading) return null;

  const groups = data?.groups ?? [];
  if (groups.length === 0) return null;

  const names = groups.map((g) => g.name).filter(Boolean).join(", ");
  const hasNumbers = (data?.totalRevenue ?? 0) > 0;

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3">
      <span className="text-muted-foreground shrink-0">
        <Crosshair className="w-5 h-5" />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground">Фокус</div>
        <div className="text-[11px] text-muted-foreground truncate">
          {names || "Выбранные группы"}
        </div>
      </div>
      {hasNumbers && (
        <div className="ml-auto text-right shrink-0">
          <div className="text-sm font-bold text-foreground">
            {formatRub(data!.focusRevenue)} ₽
          </div>
          <div className="text-[10px] text-muted-foreground">
            {data!.sharePct}% выручки
          </div>
        </div>
      )}
    </div>
  );
}
