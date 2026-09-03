import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { DollarSign, TrendingUp, Loader2 } from "lucide-react";
import { getAuthHeaders } from "@shared/api";

interface PromoItem {
  product: string;
  bonus: number;
  qty: number;
  earned: number;
}

interface Props {
  employeeUuid?: string;
}

export function PromoEarningsWidget({ employeeUuid }: Props) {
  const [items, setItems] = useState<PromoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasActivePromos, setHasActivePromos] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      // Проверяем, есть ли активные акции
      const promoRes = await fetch("/api/promo/products", { headers: getAuthHeaders() });
      const promoData = await promoRes.json();
      const active = (promoData.products ?? []).filter((p: any) => p.is_active);
      setHasActivePromos(active.length > 0);

      if (active.length === 0) { setItems([]); setTotal(0); setLoading(false); return; }

      const params = employeeUuid ? `?employee_uuid=${encodeURIComponent(employeeUuid)}` : "";
      const res = await fetch(`/api/promo/today-earnings${params}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [employeeUuid]);

  useEffect(() => {
    void fetchData();
    const interval = setInterval(fetchData, 60_000); // обновление раз в минуту
    return () => clearInterval(interval);
  }, [fetchData]);

  // Скрываем только если нет активных акций вообще
  if (!loading && !hasActivePromos) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border bg-card overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-emerald-500/10">
        <DollarSign className="w-4 h-4 text-emerald-500" />
        <span className="text-sm font-semibold">Акционные товары</span>
        <span className="text-xs text-muted-foreground ml-auto">сегодня</span>
      </div>

      {/* Body */}
      <div className="px-4 py-2">
        {loading ? (
          <div className="flex justify-center py-3">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-xs text-destructive py-1">{error}</div>
        ) : (
          <div className="space-y-1.5">
            {items.length === 0 && (
              <div className="text-xs text-muted-foreground py-1">
                Нет проданных акционных товаров
              </div>
            )}
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate text-muted-foreground">
                  {item.product}
                </span>
                <span className="text-muted-foreground/70 whitespace-nowrap">
                  {item.qty} шт × {item.bonus}₽
                </span>
                <span className="w-14 text-right font-medium text-emerald-400 tabular-nums">
                  {item.earned} ₽
                </span>
              </div>
            ))}

            {/* Total */}
            <div className="flex items-center gap-2 pt-2 mt-1 border-t border-border text-sm">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              <span className="font-medium">К выдаче из кассы:</span>
              <span className="ml-auto font-bold text-emerald-400 tabular-nums">
                {total} ₽
              </span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
