import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, ChevronUp, Store as StoreIcon, AlertTriangle,
  TrendingUp, TrendingDown, Minus, Users, Clock, DoorOpen,
} from "lucide-react";
import { useStoreEffectiveness, type StoreMetrics } from "@/hooks/dashboard/useStoreEffectiveness";
import { ReportKPIBar, Sparkline } from "@shared/ui";

function fmtRub(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M ₽`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k ₽`;
  return `${Math.round(n)} ₽`;
}

const TrendIcon = { "↑": TrendingUp, "↓": TrendingDown, "→": Minus } as const;

function riskColor(level: StoreMetrics["riskLevel"]) {
  return level === "critical" ? "text-destructive" : level === "warn" ? "text-warning" : "text-success";
}

export default function StoresTab({ period }: { period: number }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, error } = useStoreEffectiveness({ period });

  const sorted = useMemo(() => (data ? [...data.stores].sort((a, b) => b.netRevenue - a.netRevenue) : []), [data]);

  const snapshot = useMemo(() => {
    if (!data) return null;
    const total = data.stores.reduce((s, x) => s + x.netRevenue, 0);
    const profit = data.stores.reduce((s, x) => s + x.grossProfit, 0);
    return { total, profit, marginPct: total > 0 ? Math.round((profit / total) * 1000) / 10 : 0, count: data.stores.length };
  }, [data]);

  return (
    <div className="flex-1 px-4 py-4 space-y-4 pb-24">
      {isLoading && (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-card border border-border animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-destructive">
          Не удалось загрузить анализ магазинов
        </div>
      )}

      {snapshot && (
        <ReportKPIBar items={[
          { label: "Выручка сети", value: fmtRub(snapshot.total), emphasis: "primary" },
          { label: "Валовая прибыль", value: fmtRub(snapshot.profit) },
          { label: "Средняя маржа", value: `${snapshot.marginPct}%` },
          { label: "Магазинов", value: String(snapshot.count) },
        ]} />
      )}

      {data && data.openingCorrelation && (
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-1">
            <DoorOpen className="w-3.5 h-3.5" /> Связь открытия магазина с выручкой дня
          </div>
          <div className="text-xs text-muted-foreground">{data.openingCorrelation.interpretation}</div>
          {data.openingCorrelation.correlation != null && (
            <div className="text-[10px] text-muted-foreground mt-1">
              Основано на времени загрузки фото открытия — не точный табель, но единственные доступные данные о времени открытия.
            </div>
          )}
        </div>
      )}

      {data && data.hypotheses.filter(h => h.confirmed && h.id !== "s5-opening-correlation").length > 0 && (
        <div className="bg-card border border-border rounded-xl p-3 space-y-2">
          <div className="text-xs font-semibold text-foreground">Гипотезы, которые подтвердились</div>
          {data.hypotheses.filter(h => h.confirmed && h.id !== "s5-opening-correlation").map(h => (
            <div key={h.id} className="text-xs">
              <div className="font-medium text-foreground">{h.title}</div>
              <div className="text-muted-foreground mt-0.5">{h.summary}</div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {sorted.map(s => {
          const isOpen = expanded === s.uuid;
          const Icon = TrendIcon[s.trendDirection];
          return (
            <motion.div key={s.uuid} layout className="rounded-xl border border-border bg-card overflow-hidden">
              <button onClick={() => setExpanded(isOpen ? null : s.uuid)} className="w-full text-left p-3 flex items-center gap-3">
                <span className="shrink-0 w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <StoreIcon className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground truncate">{s.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{s.uniqueSellers} продавцов · {s.daysActive}д активности</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-foreground tabular-nums">{fmtRub(s.netRevenue)}</div>
                  <div className={`text-xs flex items-center gap-0.5 justify-end ${riskColor(s.riskLevel)}`}>
                    <Icon className="w-3 h-3" /> {s.marginPct}% маржа
                  </div>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-muted rounded-lg p-2"><div className="text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> ₽/час</div><div className="font-semibold text-foreground">{s.revenuePerHour != null ? fmtRub(s.revenuePerHour) : "—"}</div></div>
                        <div className="bg-muted rounded-lg p-2"><div className="text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> ₽/продавца</div><div className="font-semibold text-foreground">{fmtRub(s.revenuePerSeller)}</div></div>
                        <div className="bg-muted rounded-lg p-2"><div className="text-muted-foreground">Волатильность</div><div className="font-semibold text-foreground">{s.cv}% <span className="text-muted-foreground font-normal">(сеть ~{s.networkCv}%)</span></div></div>
                        <div className="bg-muted rounded-lg p-2"><div className="text-muted-foreground">Текучка/мес</div><div className="font-semibold text-foreground">{s.sellerTurnoverPct != null ? `${s.sellerTurnoverPct}%` : "—"}</div></div>
                      </div>
                      {s.dailyRevenue.length > 2 && (
                        <div className="flex items-center justify-between bg-muted rounded-lg p-2">
                          <span className="text-xs text-muted-foreground">Динамика выручки</span>
                          <Sparkline values={s.dailyRevenue.map(d => d.value)} width={100} height={24} />
                        </div>
                      )}
                      {s.categoryMix.length > 0 && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Состав ассортимента vs сеть</div>
                          <div className="space-y-1">
                            {s.categoryMix.slice(0, 4).map(c => (
                              <div key={c.category} className="flex items-center justify-between text-xs">
                                <span className="text-foreground/80 truncate">{c.category}</span>
                                <span className={`tabular-nums ${Math.abs(c.deviationPp) > 15 ? (c.deviationPp > 0 ? "text-success" : "text-destructive") : "text-muted-foreground"}`}>
                                  {c.sharePct}% <span className="text-muted-foreground">({c.deviationPp > 0 ? "+" : ""}{c.deviationPp}пп)</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {!s.rankEligible && (
                        <div className="text-[10px] text-muted-foreground bg-muted rounded-lg p-2">Мало данных ({s.daysActive}д) для тренда/риска.</div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {data && sorted.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
          <AlertTriangle className="w-6 h-6" />
          <p className="text-sm">Нет данных за выбранный период</p>
        </div>
      )}
    </div>
  );
}
