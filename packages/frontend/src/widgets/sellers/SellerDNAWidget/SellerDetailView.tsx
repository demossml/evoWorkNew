import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  ArrowLeft,
  ArrowRightLeft,
  Sparkles,
  User,
  Target,
  Zap,
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { DateFilterValue } from "@/widgets/home/DateFilter";
import type { SellerDNAProfile, DNALabel, HourlyPoint } from "./types";
import { useWeekdayBreakdown } from "@/hooks/useWeekdayBreakdown";

// ===================== Props =====================

interface SellerDetailViewProps {
  seller: SellerDNAProfile | null;
  onBack: () => void;
  onCompare?: () => void;
  insights?: string[];
  useBenchmark?: boolean;
  dateFilter?: DateFilterValue;
}

// ===================== Constants =====================

const DNA_COLORS: Record<DNALabel, string> = {
  Охотник: "bg-success/10 text-success border-success/20",
  Стабильный: "bg-primary/10 text-primary border-primary/20",
  Одиночка: "bg-warning/10 text-warning border-warning/20",
  Восходящий: "bg-primary/10 text-primary border-primary/20",
  Проблемный: "bg-destructive/10 text-destructive border-destructive/20",
};

function scoreColor(score: number): { text: string; ring: string } {
  if (score >= 80) return { text: "text-success", ring: "#16a34a" };
  if (score >= 60) return { text: "text-warning", ring: "#d97706" };
  return { text: "text-destructive", ring: "#dc2626" };
}

// ===================== Helpers =====================

function formatMoney(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return `${n}`;
}

function trendBadge(trend: "up" | "down" | "stable", slope: number) {
  if (trend === "up") {
    return (
      <span className="inline-flex items-center gap-0.5 text-success text-xs font-medium">
        <TrendingUp className="w-3 h-3" />+{slope.toFixed(0)}/д
      </span>
    );
  }
  if (trend === "down") {
    return (
      <span className="inline-flex items-center gap-0.5 text-destructive text-xs font-medium">
        <TrendingDown className="w-3 h-3" />
        {slope.toFixed(0)}/д
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground text-xs font-medium">
      <Minus className="w-3 h-3" />0/д
    </span>
  );
}

// ===================== Chart helpers =====================

/** Build data for the hourly revenue chart (merged seller + store avg) */
function buildHourlyChartData(
  seller: HourlyPoint[],
  storeAvg: HourlyPoint[],
) {
  // Determine full range from actual data
  const minHour = Math.min(6, ...seller.map(p => p.hour), ...storeAvg.map(p => p.hour));
  const maxHour = Math.max(23, ...seller.map(p => p.hour), ...storeAvg.map(p => p.hour));

  // Merge by hour, fill gaps
  const map = new Map<number, { hour: string; seller: number; store: number }>();
  for (let h = minHour; h <= maxHour; h++) {
    map.set(h, { hour: `${h}:00`, seller: 0, store: 0 });
  }
  for (const p of seller) {
    map.set(p.hour, {
      hour: `${p.hour}:00`,
      seller: p.revenue,
      store: map.get(p.hour)?.store ?? 0,
    });
  }
  for (const p of storeAvg) {
    const cur = map.get(p.hour);
    if (cur) cur.store = p.revenue;
  }
  return Array.from(map.values());
}

function buildHourlyChecksData(seller: HourlyPoint[]) {
  const minHour = Math.min(6, ...seller.map(p => p.hour));
  const maxHour = Math.max(23, ...seller.map(p => p.hour));

  const map = new Map<number, { hour: string; checks: number }>();
  for (let h = minHour; h <= maxHour; h++) {
    map.set(h, { hour: `${h}:00`, checks: 0 });
  }
  for (const p of seller) {
    map.set(p.hour, { hour: `${p.hour}:00`, checks: p.checks });
  }
  return Array.from(map.values());
}

// ===================== Sub-components =====================

function CircularScoreLarge({ score }: { score: number }) {
  const col = scoreColor(score);
  const r = 36;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - score / 100);

  const [animOffset, setAnimOffset] = useState(circumference);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setAnimOffset(offset));
    return () => cancelAnimationFrame(raf);
  }, [offset]);

  return (
    <div className="relative w-24 h-24 shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" strokeWidth="5" className="stroke-muted" />
        <circle
          cx="44" cy="44" r={r}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          stroke={col.ring}
          strokeDasharray={circumference}
          strokeDashoffset={animOffset}
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-xl font-bold tabular-nums ${col.text}`}>
        {score}
      </span>
    </div>
  );
}

function MetricTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="bg-muted/50 rounded-lg p-3 flex flex-col gap-1 hover:bg-muted/70 transition-colors">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <span className="text-base font-bold text-foreground tabular-nums">{value}</span>
      {sub && <div className="text-xs">{sub}</div>}
    </div>
  );
}

// ===================== Placeholder =====================

function EmptyPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <User className="w-8 h-8 text-muted-foreground opacity-40" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">Продавец не выбран</h3>
      <p className="text-xs text-muted-foreground max-w-xs">
        Нажмите на карточку продавца во вкладке «Рейтинг», чтобы увидеть детальный анализ.
      </p>
    </div>
  );
}

// ===================== Hourly Revenue Chart =====================

function HourlyRevenueChart({ seller, useBenchmark }: { seller: SellerDNAProfile; useBenchmark?: boolean }) {
  const data = buildHourlyChartData(seller.hourlyRevenue, seller.storeAvgHourlyRevenue);

  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <h4 className="text-xs font-semibold text-foreground mb-2">
        Выручка по часам
        <span className="text-muted-foreground font-normal ml-1 text-[10px]">
          {useBenchmark
            ? "(серая — среднее за тот же день, 4 нед.)"
            : "(серая — среднее по магазину)"}
        </span>
      </h4>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="hour" tick={{ fontSize: 10 }} className="text-muted-foreground" />
            <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" tickFormatter={formatMoney} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8 }}
              formatter={(v: number, name: string) => [
                `${formatMoney(v)}₽`,
                name === "seller" ? "Продавец" : "Среднее",
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: 10 }}
              formatter={(v: string) => (v === "seller" ? "Продавец" : "Магазин")}
            />
            <Line
              type="monotone"
              dataKey="store"
              stroke="#9ca3af"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              name="store"
            />
            <Line
              type="monotone"
              dataKey="seller"
              stroke="#6366f1"
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
              name="seller"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ===================== Hourly Checks Chart =====================

function HourlyChecksChart({ seller }: { seller: SellerDNAProfile }) {
  const data = buildHourlyChecksData(seller.hourlyRevenue);

  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <h4 className="text-xs font-semibold text-foreground mb-2">
        Активность (чеки по часам)
      </h4>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="hour" tick={{ fontSize: 10 }} className="text-muted-foreground" />
            <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8 }}
              formatter={(v: number) => [`${v} чеков`, "Активность"]}
            />
            <Bar dataKey="checks" fill="#818cf8" radius={[3, 3, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ===================== Weekday breakdown chart =====================

const WD_LABELS_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function WeekdayBreakdownChart({ breakdown }: { breakdown: Record<number, { days: number; totalRevenue: number; totalChecks: number; avgCheck: number; rubPerHour: number | null }> }) {
  const maxRevenue = Math.max(...Object.values(breakdown).map(b => b.totalRevenue), 1);

  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <h4 className="text-xs font-semibold text-foreground mb-2">
        Выручка по дням недели
      </h4>
      <div className="space-y-1.5">
        {WD_LABELS_SHORT.map((label, idx) => {
          const data = breakdown[idx];
          if (!data) return null;
          const barPct = (data.totalRevenue / maxRevenue) * 100;
          const barColor = barPct >= 80 ? "#6366f1" : barPct >= 50 ? "#818cf8" : "#a5b4fc";
          return (
            <div key={idx} className="flex items-center gap-2 text-xs">
              <span className="w-6 text-right text-muted-foreground font-medium">{label}</span>
              <div className="flex-1 relative h-5 bg-muted/80 rounded overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded transition-all duration-500 flex items-center justify-end pr-1.5"
                  style={{ width: `${Math.max(barPct, 3)}%`, backgroundColor: barColor }}
                >
                  <span className="text-[10px] text-white font-medium tabular-nums">
                    {formatMoney(data.totalRevenue)}₽
                  </span>
                </div>
              </div>
              <span className="w-14 text-left text-muted-foreground tabular-nums">
                {data.days} д.
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===================== AI Insights =====================

function AIInsights({ insights }: { insights: string[] }) {
  return (
    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold text-primary">AI Инсайты</span>
      </div>
      <ul className="space-y-1.5">
        {insights.map((insight, i) => (
          <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
            <span className="text-primary mt-0.5 shrink-0">•</span>
            {insight}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ===================== Main component =====================

export function SellerDetailView({ seller, onBack, onCompare, insights = [], useBenchmark, dateFilter }: SellerDetailViewProps) {
  if (!seller) return <EmptyPlaceholder />;

  const col = scoreColor(seller.overallScore);

  // Weekday breakdown
  const { data: weekdayBreakdown } = useWeekdayBreakdown(
    seller.uuid,
    dateFilter?.since ?? "",
    dateFilter?.until ?? "",
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-start gap-4">
        {/* Avatar + Score */}
        <CircularScoreLarge score={seller.overallScore} />

        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-foreground truncate">{seller.name}</h3>

          {/* DNA label */}
          <span
            className={`inline-block text-[10px] px-2 py-0.5 rounded-full border font-medium mt-0.5 ${DNA_COLORS[seller.dnaLabel]}`}
          >
            {seller.dnaLabel}
          </span>

          {/* Trend */}
          <div className="mt-1">{trendBadge(seller.trend, seller.trendSlope)}</div>

          {/* Top-line metrics */}
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
            <span>Ранг #{seller.rank}</span>
            <span>{seller.daysWorked} смен</span>
            <span>{formatMoney(seller.totalRevenue)}₽</span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-foreground hover:bg-muted/80 transition"
        >
          <ArrowLeft className="w-3 h-3" />
          К списку
        </button>
        {onCompare && (
          <button
            onClick={onCompare}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-foreground hover:bg-muted/80 transition"
          >
            <ArrowRightLeft className="w-3 h-3" />
            Сравнить
          </button>
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <HourlyRevenueChart seller={seller} useBenchmark={useBenchmark} />
        <HourlyChecksChart seller={seller} />
      </div>

      {/* Weekday breakdown */}
      {weekdayBreakdown && Object.keys(weekdayBreakdown).length > 0 && (
        <WeekdayBreakdownChart breakdown={weekdayBreakdown} />
      )}

      {/* Metrics grid */}
      <div>
        <h4 className="text-xs font-semibold text-foreground mb-2">Ключевые метрики</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <MetricTile
            icon={<Zap className="w-3 h-3" />}
            label="₽/час"
            value={seller.rubPerHour != null ? `${formatMoney(seller.rubPerHour)}₽` : "—"}
            sub={trendBadge(seller.trend, seller.trendSlope)}
          />
          <MetricTile
            icon={<Target className="w-3 h-3" />}
            label="Средний чек"
            value={`${seller.avgCheck}₽`}
          />
          <MetricTile
            icon={<TrendingUp className="w-3 h-3" />}
            label="% Аксессуаров"
            value={`${seller.accShare}%`}
          />
          <MetricTile
            icon={<Clock className="w-3 h-3" />}
            label="Мёртвое время"
            value={`${seller.deadTimePct}%`}
            sub={
              seller.deadTimePct > 20 ? (
                <span className="text-destructive text-xs">⚠️ Выше нормы</span>
              ) : undefined
            }
          />
          <MetricTile
            icon={<Zap className="w-3 h-3" />}
            label="Эфф. пиков"
            value={`${Math.round(seller.peakHourEfficiency * 100)}%`}
          />
          <MetricTile
            icon={<Target className="w-3 h-3" />}
            label="Качество"
            value={`${seller.serviceQuality.total}/100`}
          />
        </div>
      </div>

      {/* Dead time slots */}
      {seller.deadTimeSlots.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2">Мёртвые периоды</h4>
          <div className="space-y-1">
            {seller.deadTimeSlots.map((slot, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2"
              >
                <span className="text-xs font-medium text-foreground">
                  {slot.from} – {slot.to}
                </span>
                <span className="text-xs text-muted-foreground">{slot.minutes} мин</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stability */}
      <div>
        <h4 className="text-xs font-semibold text-foreground mb-2">Стабильность</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricTile
            icon={<TrendingUp className="w-3 h-3" />}
            label="CV выручки"
            value={`${seller.stability.revenueCV}%`}
          />
          <MetricTile
            icon={<Target className="w-3 h-3" />}
            label="CV чека"
            value={`${seller.stability.checkCV}%`}
          />
          <MetricTile
            icon={<User className="w-3 h-3" />}
            label="Посещаемость"
            value={`${seller.stability.attendanceRate}%`}
          />
          <MetricTile
            icon={<Clock className="w-3 h-3" />}
            label="Опоздания"
            value={`${seller.stability.lateOpenRate}%`}
            sub={
              seller.stability.lateOpenRate > 10 ? (
                <span className="text-destructive text-xs">⚠️ Частые</span>
              ) : undefined
            }
          />
        </div>
      </div>

      {/* AI Insights */}
      <AIInsights insights={insights.length > 0 ? insights : seller.aiInsights} />
    </motion.div>
  );
}

export default SellerDetailView;
