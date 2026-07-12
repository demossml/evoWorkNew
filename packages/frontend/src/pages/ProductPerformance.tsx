import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, ChevronUp, ArrowLeft, Package, AlertTriangle,
  TrendingUp, TrendingDown, Minus, Tag, Store as StoreIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useProductEffectiveness, type ProductMetrics } from "@/hooks/dashboard/useProductEffectiveness";
import { ReportKPIBar, Sparkline } from "@shared/ui";

function fmtRub(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M ₽`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k ₽`;
  return `${Math.round(n)} ₽`;
}

const TrendIcon = { "↑": TrendingUp, "↓": TrendingDown, "→": Minus } as const;

function riskColor(level: ProductMetrics["riskLevel"]) {
  return level === "critical" ? "text-destructive" : level === "warn" ? "text-warning" : "text-success";
}

function abcColor(cls: "A" | "B" | "C") {
  return cls === "A" ? "bg-primary text-primary-foreground" : cls === "B" ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground";
}

export default function ProductPerformance() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState(90);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"revenue" | "margin" | "trend">("revenue");

  const { data, isLoading, error } = useProductEffectiveness({ period });

  const sorted = useMemo(() => {
    if (!data) return [];
    const arr = [...data.products];
    if (sortBy === "margin") arr.sort((a, b) => b.marginPct - a.marginPct);
    else if (sortBy === "trend") arr.sort((a, b) => a.trendSlope - b.trendSlope);
    else arr.sort((a, b) => b.netRevenue - a.netRevenue);
    return arr;
  }, [data, sortBy]);

  const critical = useMemo(
    () => (data ? data.products.filter(p => p.rankEligible && p.riskLevel === "critical") : []),
    [data],
  );

  const snapshot = useMemo(() => {
    if (!data) return null;
    const total = data.products.reduce((s, p) => s + p.netRevenue, 0);
    const profit = data.products.reduce((s, p) => s + p.grossProfit, 0);
    return { total, profit, marginPct: total > 0 ? Math.round((profit / total) * 1000) / 10 : 0, count: data.products.length };
  }, [data]);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="app-safe-top sticky top-0 z-20 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="px-4 py-2.5">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1 -ml-1">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-foreground truncate">Анализ товаров</h1>
              <div className="text-xs text-muted-foreground">{period}д · {sorted.length} товаров</div>
            </div>
          </div>
          <div className="flex gap-1.5 mt-2">
            <button onClick={() => navigate("/evotor/seller-performance")} className="px-2.5 py-1 text-xs rounded-md font-medium text-muted-foreground hover:bg-muted">Продавцы</button>
            <button className="px-2.5 py-1 text-xs rounded-md font-medium bg-primary text-primary-foreground">Товары</button>
            <button onClick={() => navigate("/evotor/store-performance")} className="px-2.5 py-1 text-xs rounded-md font-medium text-muted-foreground hover:bg-muted">Магазины</button>
          </div>
          <div className="flex gap-1.5 mt-1.5">
            {[30, 60, 90].map(d => (
              <button
                key={d}
                onClick={() => setPeriod(d)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                  period === d ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {d}д
              </button>
            ))}
            <div className="ml-auto flex gap-1.5">
              {([["revenue", "Выручка"], ["margin", "Маржа"], ["trend", "Тренд"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    sortBy === key ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4 pb-24">
        {isLoading && (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-card border border-border animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-destructive">
            Не удалось загрузить анализ товаров
          </div>
        )}

        {snapshot && (
          <ReportKPIBar items={[
            { label: "Выручка", value: fmtRub(snapshot.total), emphasis: "primary" },
            { label: "Валовая прибыль", value: fmtRub(snapshot.profit) },
            { label: "Средняя маржа", value: `${snapshot.marginPct}%` },
            { label: "Товаров в отчёте", value: String(snapshot.count) },
          ]} />
        )}

        {critical.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 space-y-1.5">
            <div className="text-xs font-semibold text-destructive flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Требуют внимания
            </div>
            {critical.map(p => (
              <div key={p.uuid} className="text-xs text-destructive flex items-center gap-2 bg-destructive/10 rounded px-2 py-1">
                <span className="font-medium truncate">{p.name}</span>
                <span className="text-destructive/60">—</span>
                <span className="truncate">{p.riskReasons.join(" · ")}</span>
              </div>
            ))}
          </div>
        )}

        {data && data.hypotheses.filter(h => h.confirmed).length > 0 && (
          <div className="bg-card border border-border rounded-xl p-3 space-y-2">
            <div className="text-xs font-semibold text-foreground">Гипотезы, которые подтвердились</div>
            {data.hypotheses.filter(h => h.confirmed).map(h => (
              <div key={h.id} className="text-xs">
                <div className="font-medium text-foreground">{h.title}</div>
                <div className="text-muted-foreground mt-0.5">{h.summary}</div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {sorted.map(p => {
            const isOpen = expanded === p.uuid;
            const Icon = TrendIcon[p.trendDirection];
            return (
              <motion.div
                key={p.uuid}
                layout
                className={`rounded-xl border bg-card overflow-hidden ${!p.rankEligible ? "opacity-60" : ""}`}
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : p.uuid)}
                  className="w-full text-left p-3 flex items-center gap-3"
                >
                  <span className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold ${abcColor(p.abcClass)}`}>
                    {p.abcClass}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{p.category} · {p.daysListed}д в продаже</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-foreground tabular-nums">{fmtRub(p.netRevenue)}</div>
                    <div className={`text-xs flex items-center gap-0.5 justify-end ${riskColor(p.riskLevel)}`}>
                      <Icon className="w-3 h-3" /> {p.marginPct}%
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-muted rounded-lg p-2">
                            <div className="text-muted-foreground">Продано, шт</div>
                            <div className="font-semibold text-foreground">{p.netQuantity}</div>
                          </div>
                          <div className="bg-muted rounded-lg p-2">
                            <div className="text-muted-foreground">Средняя цена</div>
                            <div className="font-semibold text-foreground">{fmtRub(p.averagePrice)}</div>
                          </div>
                          <div className="bg-muted rounded-lg p-2">
                            <div className="text-muted-foreground">Возвраты</div>
                            <div className="font-semibold text-foreground">{p.refundRate}% {p.refundRateTrend !== "→" && `(${p.refundRateTrend})`}</div>
                          </div>
                          <div className="bg-muted rounded-lg p-2">
                            <div className="text-muted-foreground">Волатильность</div>
                            <div className="font-semibold text-foreground">{p.cv}% <span className="text-muted-foreground font-normal">(кат. ~{p.categoryCv}%)</span></div>
                          </div>
                        </div>

                        {p.dailyRevenue.length > 2 && (
                          <div className="flex items-center justify-between bg-muted rounded-lg p-2">
                            <span className="text-xs text-muted-foreground">Динамика выручки</span>
                            <Sparkline values={p.dailyRevenue.map(d => d.value)} width={100} height={24} />
                          </div>
                        )}

                        {p.storeConcentration > 0.5 && p.topStore && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <StoreIcon className="w-3.5 h-3.5" />
                            {Math.round(p.storeConcentration * 100)}% продаж в «{p.topStore}»
                          </div>
                        )}

                        {p.crossSell.length > 0 && (
                          <div>
                            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Tag className="w-3 h-3" /> Часто покупают вместе</div>
                            <div className="flex flex-wrap gap-1.5">
                              {p.crossSell.map(c => (
                                <span key={c.name} className="text-[11px] bg-primary/10 text-primary rounded-full px-2 py-0.5">
                                  {c.name} · {c.coOccurrencePct}%
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {!p.rankEligible && (
                          <div className="text-[10px] text-muted-foreground bg-muted rounded-lg p-2">
                            Мало данных ({p.daysListed}д) для тренда/риска — цифры показаны, но не участвуют в гипотезах.
                          </div>
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
            <Package className="w-6 h-6" />
            <p className="text-sm">Нет данных за выбранный период</p>
          </div>
        )}
      </div>
    </div>
  );
}
