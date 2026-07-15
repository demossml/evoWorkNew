import { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, ChevronUp, TrendingUp, TrendingDown,
  AlertTriangle, BarChart3, DollarSign, Store,
  Users, Clock, Info, Download, Building2,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import { type StoreMetrics } from "@/hooks/dashboard/useStoreEffectiveness";
import { useStoreEffectiveness } from "@/hooks/dashboard/useStoreEffectiveness";
import { ReportKPIBar, ReportShareButton, AIInsightsPanel, AIChatPanel } from "@shared/ui";
import { useStoreAIInsights } from "@/hooks/dashboard/useStoreAIInsights";
import { Brain } from "lucide-react";

// ====== Helpers ======

function fmtRub(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "— ₽";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M ₽`;
  if (n >= 1_000) return `${Math.round(n / 1000)}k ₽`;
  return `${Math.round(n)} ₽`;
}

function trendArrow(dir: "↑" | "↓" | "→"): { icon: JSX.Element; color: string } {
  if (dir === "↑") return { icon: <TrendingUp className="w-4 h-4" />, color: "text-emerald-500" };
  if (dir === "↓") return { icon: <TrendingDown className="w-4 h-4" />, color: "text-red-500" };
  return { icon: <span className="text-lg">→</span>, color: "text-gray-400" };
}

const segmentLabels: Record<string, { label: string; cls: string }> = {
  healthy: { label: "✅ Здоровая", cls: "bg-emerald-100 text-emerald-700" },
  declining: { label: "📉 Падающая", cls: "bg-red-100 text-red-700" },
  volatile: { label: "🌊 Волатильная", cls: "bg-amber-100 text-amber-700" },
  understaffed: { label: "👥 Недоукомплектована", cls: "bg-orange-100 text-orange-700" },
  assortment_gap: { label: "📦 Перекос ассортимента", cls: "bg-purple-100 text-purple-700" },
  discipline_issue: { label: "⏰ Дисциплина открытия", cls: "bg-blue-100 text-blue-700" },
};

const COLORS = ["#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4"];

// ====== Main ======

export default function StorePerformancePage({ embedded, period: externalPeriod }: { embedded?: boolean; period?: number }) {
  const [period, setPeriod] = useState(externalPeriod ?? 90);
  useEffect(() => { if (externalPeriod !== undefined) setPeriod(externalPeriod); }, [externalPeriod]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<keyof StoreMetrics>("totalRevenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [chatEntityId, setChatEntityId] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useStoreEffectiveness({ period });
  const { data: aiInsights, isLoading: aiLoading } = useStoreAIInsights({ period });

  const sortedStores = useMemo(() => {
    if (!data?.stores) return [];
    const eligible = data.stores.filter(s => s.rankEligible);
    const ineligible = data.stores.filter(s => !s.rankEligible);
    const sorted = [...eligible].sort((a, b) => {
      const aVal = a[sortBy] ?? 0;
      const bVal = b[sortBy] ?? 0;
      return sortDir === "desc" ? (bVal as number) - (aVal as number) : (aVal as number) - (bVal as number);
    });
    return [...sorted, ...ineligible];
  }, [data, sortBy, sortDir]);

  const handleSort = (key: keyof StoreMetrics) => {
    if (sortBy === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(key); setSortDir("desc"); }
  };

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 text-center text-red-500">
        Ошибка загрузки данных. Попробуйте позже.
      </div>
    );
  }

  return (
    <div ref={reportRef} className="pb-20 px-3 pt-3 max-w-4xl mx-auto space-y-4">
      {!embedded && (
      <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Глубокий анализ торговых точек</h1>
        <ReportShareButton targetRef={reportRef} filename="store-performance" />
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {[30, 60, 90, 180].map(d => (
          <button
            key={d}
            onClick={() => setPeriod(d)}
            className={`px-3 py-1 text-xs rounded-full border ${period === d ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}
          >
            {d} дн.
          </button>
        ))}
      </div>
      </>
      )}

      {/* KPI Bar */}
      {data.snapshot && (
        <ReportKPIBar
          items={[
            { label: "Точек", value: String(data.snapshot.totalShops), icon: <Store className="w-4 h-4" /> },
            { label: "Выручка", value: fmtRub(data.snapshot.totalRevenue), icon: <DollarSign className="w-4 h-4" />, emphasis: "positive" as const },
            { label: "Средняя маржа", value: `${data.snapshot.avgMarginPct}%`, icon: <TrendingUp className="w-4 h-4" /> },
            { label: "₽/час", value: data.snapshot.avgRubPerHour ? fmtRub(data.snapshot.avgRubPerHour) : "—", icon: <Clock className="w-4 h-4" /> },
            { label: "Продавцов", value: String(data.snapshot.totalSellers), icon: <Users className="w-4 h-4" /> },
          ]}
        />
      )}

      {/* AI Insights Panel */}
      <AIInsightsPanel
        title="AI-анализ торговых точек"
        executiveSummary={aiInsights?.executiveSummary || ""}
        topIssues={aiInsights?.topIssues as any}
        topOpportunities={aiInsights?.topOpportunities as any}
        disciplineInsight={aiInsights?.disciplineInsight}
        actionableAdvice={aiInsights?.actionableAdvice || []}
        isLoading={aiLoading}
      />

      {/* Hypotheses Alerts */}
      {data?.hypotheses?.filter(h => h.confirmed).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-xl p-3 space-y-1.5"
        >
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-xs font-bold">Гипотезы</span>
            <span className="text-xs text-amber-500 ml-auto">{data.hypotheses.filter(h => h.confirmed).length} подтверждено</span>
          </div>
          {data.hypotheses.filter(h => h.confirmed).slice(0, 5).map(h => (
            <div key={h.id} className="text-xs text-amber-600 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-800/30 rounded px-2 py-1">
              <span className="font-medium">{h.title}</span>: {h.summary}
            </div>
          ))}
        </motion.div>
      )}

      {/* Sort controls */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { key: "rank" as const, label: "Ранг" },
          { key: "totalRevenue" as const, label: "Выручка" },
          { key: "marginPct" as const, label: "Маржа %" },
          { key: "rubPerHour" as const, label: "₽/час" },
          { key: "cv" as const, label: "CV" },
          { key: "uniqueSellers" as const, label: "Продавцы" },
        ].map(s => (
          <button
            key={s.key}
            onClick={() => handleSort(s.key)}
            className={`px-2 py-0.5 text-xs rounded whitespace-nowrap ${sortBy === s.key ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"}`}
          >
            {s.label} {sortBy === s.key && (sortDir === "desc" ? "↓" : "↑")}
          </button>
        ))}
      </div>

      {/* Store list */}
      <div className="space-y-1.5">
        {sortedStores.map((s, i) => (
          <StoreCard
            key={s.shopUuid}
            store={s}
            index={i}
            expanded={expanded === s.shopUuid}
            onToggle={() => setExpanded(expanded === s.shopUuid ? null : s.shopUuid)}
            onAskAI={() => setChatEntityId(s.shopUuid)}
          />
        ))}
        {sortedStores.length === 0 && (
          <div className="text-center text-muted-foreground py-8">Нет данных за выбранный период.</div>
        )}
      </div>

      {/* Export CSV */}
      <button
        onClick={() => exportCSV(sortedStores)}
        className="flex items-center gap-1 mx-auto text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        <Download className="w-3 h-3" /> Экспорт CSV
      </button>

      {/* AI Chat Panel */}
      <AnimatePresence>
        {chatEntityId && (
          <AIChatPanel
            contextType="store"
            entityId={chatEntityId}
            entityName={data?.stores.find(s => s.shopUuid === chatEntityId)?.shopName}
            onClose={() => setChatEntityId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ====== Store Card ======

function StoreCard({ store, index, expanded, onToggle, onAskAI }: {
  store: StoreMetrics; index: number; expanded: boolean; onToggle: () => void; onAskAI?: () => void;
}) {
  const { icon: tIcon, color: tColor } = trendArrow(store.trendDirection);
  const seg = segmentLabels[store.segment] || segmentLabels.healthy;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      className="bg-card rounded-xl border border-border overflow-hidden"
    >
      {/* Summary row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
          {store.rankEligible ? store.rank : "—"}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{store.shopName}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${seg.cls}`}>{seg.label}</span>
            <HealthBadge score={store.healthScore} />
            {store.clusterLabel && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${store.clusterLabel === "large" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                {store.clusterLabel === "large" ? "Крупный" : "Малый"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <DollarSign className="w-3 h-3" /> {fmtRub(store.totalRevenue)}
            </span>
            {store.revenueChangePct !== null && (
              <span className={`flex items-center gap-0.5 ${store.revenueChangePct >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {store.revenueChangePct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {store.revenueChangePct >= 0 ? "+" : ""}{store.revenueChangePct}%
              </span>
            )}
            <span className={`flex items-center gap-0.5 ${tColor}`}>{tIcon} {store.marginPct}%</span>
            <span>{store.uniqueSellers} чел.</span>
            {store.rubPerHour && <span>{fmtRub(store.rubPerHour)}/ч</span>}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-sm font-semibold">{fmtRub(store.totalRevenue)}</div>
          <div className="text-[10px] text-muted-foreground">
            P{store.revenuePercentile}в · P{store.marginPercentile}м · P{store.rubPerHourPercentile}ч
          </div>
        </div>

        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border"
          >
            <div className="p-3 space-y-4">
              {/* Trend chart with anomalies */}
              {store.dailyRevenue?.length >= 3 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    Динамика выручки
                    <span className="ml-2 text-[10px] opacity-60">
                      тренд: {store.trendDirection} ({store.trendCI?.significant ? "значим" : "не значим"})
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={130}>
                    <LineChart data={store.dailyRevenue}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 9 }} width={45} />
                      <Tooltip formatter={(v: number) => fmtRub(v)} />
                      <Line type="monotone" dataKey="value" stroke={store.trendDirection === "↓" ? "#ef4444" : "#10b981"} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                  {store.anomalyDays?.length > 0 && (
                    <div className="flex gap-1.5 mt-1 flex-wrap">
                      {store.anomalyDays.slice(0, 3).map(a => (
                        <span key={a.date} className={`text-[10px] px-1.5 py-0.5 rounded ${a.direction === "up" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {a.date}: {a.direction === "up" ? "↑" : "↓"} {fmtRub(a.value)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Health score */}
              <div className="bg-muted/20 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium">Health Score</span>
                  <HealthBadge score={store.healthScore} />
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${store.healthScore >= 70 ? "bg-emerald-500" : store.healthScore >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                    style={{ width: `${store.healthScore}%` }}
                  />
                </div>
              </div>

              {/* Waterfall */}
              {store.waterfall && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    Изменение выручки: {fmtRub(store.waterfall.prevRevenue)} → {fmtRub(store.waterfall.currRevenue)}
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-[10px]">
                    <WaterfallBar label="Δ чек" value={store.waterfall.avgCheckDelta} />
                    <WaterfallBar label="Δ кол-во" value={store.waterfall.checksDelta} />
                    <WaterfallBar label="Δ возвр" value={store.waterfall.refundDelta} />
                    <WaterfallBar label="Итого" value={store.waterfall.delta} bold />
                  </div>
                </div>
              )}

              {/* Peak hour coverage */}
              {store.peakHourCoverage?.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Загрузка по часам vs сеть</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={store.peakHourCoverage}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="hour" tick={{ fontSize: 9 }} label={{ value: `час (UTC+${store.utcOffset})`, position: "insideBottom", offset: -5, fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} width={45} />
                      <Tooltip formatter={(v: number) => fmtRub(v)} />
                      <Bar dataKey="revenue" name="Выручка точки" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="networkAvgRevenue" name="Среднее по сети" fill="#e5e7eb" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Metrics grid */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <MetricBadge label="Выручка" value={fmtRub(store.totalRevenue)} />
                <MetricBadge label="Маржа" value={store.marginPct != null ? `${store.marginPct}%` : "—"} />
                <MetricBadge label="Сред.день" value={fmtRub(store.avgDailyRev)} />
                <MetricBadge label="CV" value={store.cv != null ? `${store.cv}%` : "—"} />
                <MetricBadge label="CV vs сеть" value={store.cvVsNetwork !== null ? `${store.cvVsNetwork}x` : "—"} />
                <MetricBadge label="₽/час" value={store.rubPerHour ? fmtRub(store.rubPerHour) : "—"} />
                <MetricBadge label="Часов/день" value={store.avgHoursPerDay ? `${store.avgHoursPerDay}ч` : "—"} />
                <MetricBadge label="₽/продавца" value={store.revenuePerSeller ? fmtRub(store.revenuePerSeller) : "—"} />
                <MetricBadge label="Продавцов" value={String(store.uniqueSellers)} />
              </div>

              {/* Staff churn */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <MetricBadge label="Текучка" value={store.churnRate !== null ? `${store.churnRate}%` : "—"} />
                <MetricBadge label="Новых" value={String(store.newSellers)} />
                <MetricBadge label="Ушло" value={String(store.lostSellers)} />
              </div>

              {/* Opening compliance */}
              {store.openingComplianceCorrelation !== null && (
                <div className="bg-muted/30 rounded-lg p-3">
                  <div className="text-xs font-medium mb-2">Дисциплина открытия</div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <MetricBadge label="Корреляция (r)" value={String(store.openingComplianceCorrelation)} />
                    <MetricBadge label="Опозданий" value={`${store.lateOpenDays} дн.`} />
                    <MetricBadge label="Потеря выручки" value={store.lateOpenRevenueImpact !== null ? `~${store.lateOpenRevenueImpact}%` : "—"} />
                  </div>
                  {store.openingComplianceCorrelation < -0.3 && (
                    <div className="mt-2 text-[10px] text-red-500 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1">
                      ⚠️ Опоздания с открытием статистически значимо связаны с более низкой выручкой. Рекомендуется усилить контроль открытия.
                    </div>
                  )}
                </div>
              )}

              {/* Category mix delta — empty state for now */}
              {store.categoryMixDelta?.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Ассортимент vs сеть</div>
                  <ResponsiveContainer width="100%" height={Math.max(80, (store.categoryMixDelta?.length ?? 0) * 24)}>
                    <BarChart data={store.categoryMixDelta} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 9 }} />
                      <YAxis type="category" dataKey="category" tick={{ fontSize: 9 }} width={70} />
                      <Tooltip />
                      <Bar dataKey="delta" name="Δ п.п." radius={[0, 4, 4, 0]}>
                        {store.categoryMixDelta.map((d, i) => (
                          <Cell key={i} fill={d.delta > 0 ? "#10b981" : "#ef4444"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Hypotheses */}
              {store.hypotheses?.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Гипотезы по точке</div>
                  {store.hypotheses.map(h => (
                    <div key={h.id} className="text-[10px] flex items-start gap-1.5 bg-muted/30 rounded px-2 py-1">
                      <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                      <span><span className="font-medium">{h.title}</span>: {h.summary}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* AI Ask button */}
              {onAskAI && (
                <button
                  onClick={onAskAI}
                  className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/40 rounded-lg transition-colors border border-violet-200 dark:border-violet-800"
                >
                  <Brain className="w-3.5 h-3.5" /> Спросить AI про эту точку
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function MetricBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/30 rounded px-2 py-1">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-xs font-medium">{value}</div>
    </div>
  );
}

function HealthBadge({ score }: { score: number }) {
  const cls = score >= 70
    ? "bg-emerald-100 text-emerald-700"
    : score >= 40
      ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-700";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${cls}`}>
      {score}
    </span>
  );
}

function WaterfallBar({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-xs ${bold ? "font-bold" : ""} ${value >= 0 ? "text-emerald-600" : "text-red-600"}`}>
        {value >= 0 ? "+" : ""}{fmtRub(value)}
      </div>
    </div>
  );
}

// ====== CSV Export ======

function exportCSV(stores: StoreMetrics[]) {
  const header = "Магазин;Выручка;Маржа%;CV%;₽/час;Продавцов;Текучка%;Сегмент;Тренд;Опозданий;r открытие";
  const rows = stores.map(s =>
    [s.shopName, s.totalRevenue, s.marginPct, s.cv,
     s.rubPerHour || "", s.uniqueSellers, s.churnRate || "",
     s.segment, s.trendDirection, s.lateOpenDays,
     s.openingComplianceCorrelation || ""].join(";"),
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `store-performance-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
