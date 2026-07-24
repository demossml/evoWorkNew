import { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, ChevronUp, TrendingUp, TrendingDown,
  AlertTriangle, Zap, BarChart3, DollarSign, ShoppingBag,
  Package, Percent, Store, Info, Download,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import { type ProductMetrics } from "@/hooks/dashboard/useProductEffectiveness";
import { useProductEffectiveness } from "@/hooks/dashboard/useProductEffectiveness";
import { ReportKPIBar, ReportShareButton, AIInsightsPanel, AIChatPanel, trendArrow } from "@shared/ui";
import { useProductAIInsights } from "@/hooks/dashboard/useProductAIInsights";
import { Brain } from "lucide-react";

// ====== Helpers ======

function fmtRub(n: number | null | undefined): string {
  if (n == null) return "— ₽";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M ₽`;
  if (n >= 1_000) return `${Math.round(n / 1000)}k ₽`;
  return `${Math.round(n)} ₽`;
}

const segmentLabels: Record<string, { label: string; cls: string }> = {
  star: { label: "Звезда", cls: "bg-warning/15 text-warning" },
  cash_cow: { label: "Дойная корова", cls: "bg-success/15 text-success" },
  problem: { label: "Проблемный", cls: "bg-destructive/15 text-destructive" },
  declining: { label: "Падающий", cls: "bg-warning/15 text-warning" },
  new: { label: "Новый", cls: "bg-primary/15 text-primary" },
  local_hit: { label: "Локальный хит", cls: "bg-accent/15 text-accent-foreground" },
};

const COLORS = ["#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899"];

// ====== Main ======

export default function ProductPerformancePage({ embedded, period: externalPeriod }: { embedded?: boolean; period?: number }) {
  const [period, setPeriod] = useState(externalPeriod ?? 90);
  useEffect(() => { if (externalPeriod !== undefined) setPeriod(externalPeriod); }, [externalPeriod]);
  const [store, setStore] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<keyof ProductMetrics>("netRevenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [chatEntityId, setChatEntityId] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useProductEffectiveness({ period, store: store === "all" ? undefined : store });
  const { data: aiInsights, isLoading: aiLoading } = useProductAIInsights({ period, store: store === "all" ? undefined : store });

  const sortedProducts = useMemo(() => {
    if (!data?.products) return [];
    const eligible = data.products.filter(p => p.rankEligible);
    const ineligible = data.products.filter(p => !p.rankEligible);
    const sorted = [...eligible].sort((a, b) => {
      const aVal = a[sortBy] ?? 0;
      const bVal = b[sortBy] ?? 0;
      return sortDir === "desc" ? (bVal as number) - (aVal as number) : (aVal as number) - (bVal as number);
    });
    return [...sorted, ...ineligible];
  }, [data, sortBy, sortDir]);

  const handleSort = (key: keyof ProductMetrics) => {
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
        <h1 className="text-lg font-bold">Глубокий анализ товаров</h1>
        <ReportShareButton targetRef={reportRef} filename="product-performance" />
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[30, 60, 90, 180].map(d => (
          <button
            key={d}
            onClick={() => setPeriod(d)}
            className={`px-3 py-1 text-xs rounded-full border ${period === d ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}
          >
            {d} дн.
          </button>
        ))}
        <select
          value={store}
          onChange={e => setStore(e.target.value)}
          className="ml-auto px-2 py-1 text-xs rounded border border-border bg-card"
        >
          <option value="all">Все магазины</option>
        </select>
      </div>
      </>
      )}

      {/* KPI Bar */}
      {/* KPI Bar — build from products aggregate */}
      {data.products.length > 0 && (
        <ReportKPIBar
          items={[
            { label: "SKU", value: String(data.products.length), icon: <Package className="w-4 h-4" /> },
            { label: "Выручка", value: fmtRub(data.products.reduce((s, p) => s + (p.netRevenue ?? 0), 0)), icon: <DollarSign className="w-4 h-4" />, emphasis: "positive" as const },
            { label: "Валовая прибыль", value: fmtRub(data.products.reduce((s, p) => s + (p.grossProfit ?? 0), 0)), icon: <TrendingUp className="w-4 h-4" />, emphasis: "positive" as const },
            { label: "Средняя маржа", value: `${(data.products.reduce((s, p) => s + (p.marginPct ?? 0), 0) / data.products.length).toFixed(1)}%`, icon: <Percent className="w-4 h-4" /> },
            { label: "Активных", value: String(data.products.filter(p => p.netRevenue > 0).length), icon: <Zap className="w-4 h-4" /> },
          ]}
        />
      )}

      {/* AI Insights Panel */}
      <AIInsightsPanel
        title="AI-анализ ассортимента"
        executiveSummary={aiInsights?.executiveSummary || ""}
        topIssues={aiInsights?.topIssues as any}
        topOpportunities={aiInsights?.topOpportunities as any}
        categoryInsight={aiInsights?.categoryInsight}
        actionableAdvice={aiInsights?.actionableAdvice || []}
        isLoading={aiLoading}
      />

      {/* Hypotheses Alerts */}
      {(data.hypotheses ?? []).filter(h => h.confirmed).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-xl p-3 space-y-1.5"
        >
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-xs font-bold">Гипотезы</span>
            <span className="text-xs text-amber-500 ml-auto">{(data.hypotheses ?? []).filter(h => h.confirmed).length} подтверждено</span>
          </div>
          {(data.hypotheses ?? []).filter(h => h.confirmed).slice(0, 5).map(h => (
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
          { key: "netRevenue" as const, label: "Выручка" },
          { key: "marginPct" as const, label: "Маржа %" },
          { key: "refundRate" as const, label: "Возврат %" },
          { key: "cv" as const, label: "CV" },
          { key: "storeHHI" as const, label: "HHI" },
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

      {/* Product list */}
      <div className="space-y-1.5">
        {sortedProducts.map((p, i) => (
          <ProductCard
            key={p.uuid}
            product={p}
            index={i}
            expanded={expanded === p.uuid}
            onToggle={() => setExpanded(expanded === p.uuid ? null : p.uuid)}
            onAskAI={() => setChatEntityId(p.uuid)}
          />
        ))}
        {sortedProducts.length === 0 && (
          <div className="text-center text-muted-foreground py-8">Нет данных за выбранный период.</div>
        )}
      </div>

      {/* Export CSV */}
      <button
        onClick={() => exportCSV(sortedProducts)}
        className="flex items-center gap-1 mx-auto text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        <Download className="w-3 h-3" /> Экспорт CSV
      </button>

      {/* AI Chat Panel */}
      <AnimatePresence>
        {chatEntityId && (
          <AIChatPanel
            contextType="product"
            entityId={chatEntityId}
            entityName={data?.products.find(p => p.uuid === chatEntityId)?.name}
            onClose={() => setChatEntityId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ====== Product Card ======

// Extended product type that includes optional fields not yet in backend
type ProductDisplay = ProductMetrics & {
  healthScore?: number;
  segment?: string;
  rank?: number;
  xyzClass?: string;
  marginChangePts?: number | null;
  revenueChangePct?: number | null;
  marginPercentile?: number;
  cvPercentile?: number;
  basketPenetration?: number;
  cvVsCategory?: number | null;
  storeHHI?: number;
  trendCI?: { high: number; low: number; significant: boolean };
  anomalyDays?: { date: string; direction: string; value: number }[];
  waterfall?: { prevRevenue: number; currRevenue: number; avgCheckDelta: number; checksDelta: number; refundDelta: number; delta: number };
  storeBreakdown?: { store: string; revenue: number }[];
  hypotheses?: { id: string; title: string; summary: string }[];
  weeklyRefundRates?: { week: string; rate: number }[];
};

function ProductCard({ product, index, expanded, onToggle, onAskAI }: {
  product: ProductDisplay; index: number; expanded: boolean; onToggle: () => void; onAskAI?: () => void;
}) {
  const { icon: tIcon, color: tColor } = trendArrow(product.trendDirection);
  const seg = segmentLabels[product.segment ?? ""] || segmentLabels.cash_cow;
  const healthScore = product.healthScore ?? 50;
  const storeBreakdown = product.storeBreakdown ?? [];
  const anomalyDays = product.anomalyDays ?? [];
  const hypotheses = product.hypotheses ?? [];
  const weeklyRefundRates = product.weeklyRefundRates ?? [];
  const crossSell = product.crossSell ?? [];

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
        {/* Rank */}
        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
          {product.rankEligible ? (product.rank ?? index + 1) : "—"}
        </div>

        {/* Name & segment */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{product.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${seg.cls}`}>{seg.label}</span>
            <HealthBadge score={healthScore} />
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <DollarSign className="w-3 h-3" /> {fmtRub(product.netRevenue)}
            </span>
            {product.revenueChangePct != null && (
              <span className={`flex items-center gap-0.5 ${(product.revenueChangePct ?? 0) >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {(product.revenueChangePct ?? 0) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {(product.revenueChangePct ?? 0) >= 0 ? "+" : ""}{product.revenueChangePct}%
              </span>
            )}
            <span className={`flex items-center gap-0.5 ${tColor}`}>
              {tIcon} {product.marginPct}%
              {product.marginChangePts != null && (
                <span className={(product.marginChangePts ?? 0) >= 0 ? "text-emerald-500" : "text-red-500"}>
                  {(product.marginChangePts ?? 0) >= 0 ? "+" : ""}{product.marginChangePts}пп
                </span>
              )}
            </span>
            <span>{product.abcClass}{(product as any).xyzClass || ""}</span>
            {product.category && <span className="text-[10px] opacity-60">{product.category}</span>}
          </div>
        </div>

        {/* Right side metrics */}
        <div className="text-right shrink-0">
          <div className="text-sm font-semibold">{fmtRub(product.netRevenue)}</div>
          <div className="text-[10px] text-muted-foreground">
            {product.marginPercentile != null ? `P${product.marginPercentile}м` : "—"} · {product.cvPercentile != null ? `P${product.cvPercentile}с` : "—"} · {product.daysListed}дн
          </div>
          <div className="text-[10px] text-muted-foreground">
            {product.basketPenetration != null ? `${product.basketPenetration}% чеков` : "—"}
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
              {(product.dailyRevenue ?? []).length >= 3 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    Динамика выручки
                    {product.trendCI && (
                      <span className="ml-2 text-[10px] opacity-60">
                        тренд: {product.trendDirection} (±{(product.trendCI.high - product.trendCI.low).toFixed(0)} ₽/д, {product.trendCI.significant ? "значим" : "не значим"})
                      </span>
                    )}
                  </div>
                  <ResponsiveContainer width="100%" height={130}>
                    <LineChart data={product.dailyRevenue}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 9 }} width={45} />
                      <Tooltip
                        formatter={(v: number) => fmtRub(v)}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          const isAnom = anomalyDays.some(a => a.date === d.date);
                          return (
                            <div className="bg-white dark:bg-gray-800 border border-border rounded-lg px-2 py-1 text-xs shadow">
                              <div>{d.date}</div>
                              <div className="font-medium">{fmtRub(d.value)}</div>
                              {isAnom && <div className="text-amber-500">Аномалия</div>}
                            </div>
                          );
                        }}
                      />
                      <Line type="monotone" dataKey="value" stroke={product.trendDirection === "↓" ? "#ef4444" : "#10b981"} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                  {anomalyDays.length > 0 && (
                    <div className="flex gap-1.5 mt-1 flex-wrap">
                      {anomalyDays.slice(0, 3).map(a => (
                        <span key={a.date} className={`text-[10px] px-1.5 py-0.5 rounded ${a.direction === "up" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {a.date}: {a.direction === "up" ? "↑" : "↓"} {fmtRub(a.value)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Waterfall */}
              {product.waterfall && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    Изменение выручки: {fmtRub(product.waterfall.prevRevenue)} → {fmtRub(product.waterfall.currRevenue)}
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-[10px]">
                    <WaterfallBar label="Δ чек" value={product.waterfall.avgCheckDelta} />
                    <WaterfallBar label="Δ кол-во" value={product.waterfall.checksDelta} />
                    <WaterfallBar label="Δ возвр" value={product.waterfall.refundDelta} />
                    <WaterfallBar label="Итого" value={product.waterfall.delta} bold />
                  </div>
                </div>
              )}

              {/* Health score detail */}
              <div className="bg-muted/20 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium">Health Score</span>
                  <HealthBadge score={healthScore} />
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${healthScore >= 70 ? "bg-emerald-500" : healthScore >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                    style={{ width: `${healthScore}%` }}
                  />
                </div>
              </div>

              {/* Store breakdown */}
              {storeBreakdown.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    Распределение по магазинам <span className="opacity-60">(HHI: {product.storeHHI ?? "—"})</span>
                  </div>
                  <ResponsiveContainer width="100%" height={Math.max(80, storeBreakdown.length * 24)}>
                    <BarChart data={storeBreakdown} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 9 }} />
                      <YAxis type="category" dataKey="store" tick={{ fontSize: 9 }} width={80} />
                      <Tooltip formatter={(v: number) => fmtRub(v)} />
                      <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                        {storeBreakdown.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Cross-sell */}
              {crossSell.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">С чем покупают вместе</div>
                  <div className="flex gap-1.5 flex-wrap">
                    {crossSell.map(cs => (
                      <span key={cs.name} className="text-[10px] px-2 py-0.5 bg-muted rounded-full">
                        {cs.name.slice(0, 20)} <span className="font-medium">{cs.coOccurrencePct}%</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Metrics grid */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <MetricBadge label="Маржа" value={`${product.marginPct}%`} />
                <MetricBadge label="CV" value={`${product.cv}%`} />
                <MetricBadge label="CV кат." value={product.cvVsCategory != null ? `${product.cvVsCategory}x` : "—"} />
                <MetricBadge label="Возврат" value={`${product.refundRate}%`} />
                <MetricBadge label="Тренд возвр." value={product.refundRateTrend > 0 ? `+${product.refundRateTrend}` : String(product.refundRateTrend)} />
                <MetricBadge label="В ассорт." value={`${product.daysListed} дн.`} />
                <MetricBadge label="Класс" value={`${product.abcClass}${(product as any).xyzClass || ""}`} />
                <MetricBadge label="Продаж" value={String(product.netQuantity)} />
                <MetricBadge label="Первая прод." value={product.firstSoldDate || "—"} />
              </div>

              {/* Hypotheses */}
              {hypotheses.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Гипотезы по товару</div>
                  {hypotheses.map(h => (
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
                  <Brain className="w-3.5 h-3.5" /> Спросить AI про этот товар
                </button>
              )}

              {/* Weekly refund rates */}
              {weeklyRefundRates.length >= 2 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Динамика возвратов по неделям</div>
                  <ResponsiveContainer width="100%" height={80}>
                    <LineChart data={weeklyRefundRates}>
                      <XAxis dataKey="week" tick={{ fontSize: 8 }} />
                      <YAxis tick={{ fontSize: 8 }} width={30} />
                      <Tooltip formatter={(v: number) => `${v}%`} />
                      <Line type="monotone" dataKey="rate" stroke="#ef4444" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
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

function exportCSV(products: ProductDisplay[]) {
  const header = "Название;Категория;Выручка;Количество;Маржа%;CV%;Возврат%;Класс;Сегмент;Тренд;Дней в ассорт.";
  const rows = products.map(p =>
    [p.name, p.category || "", p.netRevenue, p.netQuantity, p.marginPct, p.cv,
     p.refundRate, `${p.abcClass}${(p as any).xyzClass || ""}`, p.segment || "—",
     p.trendDirection, p.daysListed].join(";"),
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `product-performance-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
