/**
 * FocusCategoryWidget — компактная карточка «Фокус»: прицел + доля.
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

function compactRub(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}м ₽`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}к ₽`;
  return `${Math.round(n)} ₽`;
}

function shareColor(share: number): { accent: string; fill: string; pill: string } {
  if (share > 10) {
    return {
      accent: "bg-success",
      fill: "hsl(var(--success))",
      pill: "bg-success/15 text-success",
    };
  }
  if (share >= 3) {
    return {
      accent: "bg-primary",
      fill: "hsl(var(--primary))",
      pill: "bg-primary/15 text-primary",
    };
  }
  return {
    accent: "bg-muted-foreground/40",
    fill: "hsl(var(--muted-foreground))",
    pill: "bg-muted text-muted-foreground",
  };
}

function namesLabel(groups: FocusSales["groups"]): string {
  const names = groups.map((g) => g.name).filter(Boolean);
  if (names.length === 0) return "Выбранные группы";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} · ${names[1]}`;
  return `${names[0]} · ${names[1]} +${names.length - 2}`;
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

  const share = data?.sharePct ?? 0;
  const c = shareColor(share);
  const fillPct = Math.max(0, Math.min(100, share));
  const hasNumbers = (data?.totalRevenue ?? 0) > 0;

  return (
    <div className="relative rounded-xl border border-border bg-card overflow-hidden">
      {/* Левый accent */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${c.accent}`} />

      <div className="flex items-center gap-3 pl-4 pr-3 py-2.5 min-h-[56px]">
        {/* Мишень */}
        <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
          <Crosshair className="w-5 h-5 text-primary" />
        </div>

        {/* Центр: имена групп */}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground leading-snug truncate">
            {namesLabel(groups)}
          </div>
          <div className="text-[10px] text-muted-foreground">фокус дня</div>
        </div>

        {hasNumbers && (
          <>
            {/* Track доли */}
            <div className="w-16 shrink-0 hidden sm:block">
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${fillPct}%`, backgroundColor: c.fill }}
                />
              </div>
            </div>

            {/* ₽ + pill */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-sm font-bold text-foreground tabular-nums">
                {compactRub(data!.focusRevenue)}
              </span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums ${c.pill}`}>
                {share.toFixed(1)}%
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
