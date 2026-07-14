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
  AlertTriangle,
  Calendar,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
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
  ReferenceLine,
} from "recharts";
import type { DateFilterValue } from "@/widgets/home/DateFilter";
import type { SellerDNAProfile, DNALabel, HourlyPoint, AbsenceAnalysis, AbsenceSlot } from "./types";
import { useWeekdayBreakdown } from "@/hooks/useWeekdayBreakdown";
import { client } from "@/helpers/api";

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

  // Absence analysis
  const [absenceData, setAbsenceData] = useState<AbsenceAnalysis | null>(null);
  const [absenceLoading, setAbsenceLoading] = useState(false);

  const fetchAbsence = useCallback(async () => {
    if (!seller.uuid || !dateFilter?.since || !dateFilter?.until) return;
    setAbsenceLoading(true);
    try {
      const since = dateFilter.since;
      const until = dateFilter.until;
      const res = await fetch(
        `/api/sellers/absence-analysis?sellerId=${seller.uuid}&since=${since}&until=${until}&minSlotMinutes=25`
      );
      if (res.ok) {
        const data: AbsenceAnalysis = await res.json();
        setAbsenceData(data);
      }
    } catch {
      // тихо
    } finally {
      setAbsenceLoading(false);
    }
  }, [seller.uuid, dateFilter?.since, dateFilter?.until]);

  useEffect(() => {
    fetchAbsence();
  }, [fetchAbsence]);

  // Вычисляем агрегированные метрики отсутствия
  const totalAbsentMin = absenceData?.slots.reduce((s, sl) => s + sl.durationMinutes, 0) ?? 0;
  const absentRate = seller.avgHours && seller.daysWorked > 0
    ? Math.round((totalAbsentMin / (seller.avgHours * 60 * seller.daysWorked)) * 100)
    : 0;
  const highProbSlots = (absenceData?.slots ?? []).filter((s) => s.probability_absent >= 0.5);

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
            value={`${seller.lateRate}%`}
            sub={
              seller.lateRate > 10 ? (
                <span className="text-destructive text-xs">⚠️ {seller.avgLateMinutes} мин ср.</span>
              ) : seller.lateRate > 0 ? (
                <span className="text-muted-foreground text-xs">{seller.avgLateMinutes} мин ср.</span>
              ) : (
                <span className="text-success text-xs">Без опозданий</span>
              )
            }
          />
        </div>
      </div>

      {/* Дисциплина и отсутствие */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-3 py-2 border-b border-border">
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />
            Дисциплина и отсутствие
          </h4>
        </div>
        <div className="p-3 space-y-3">
          {/* Метрики дисциплины + отсутствия */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-muted/50 rounded-lg p-2.5 text-center">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Опоздания</div>
              <div className={`text-lg font-bold tabular-nums ${seller.lateRate > 10 ? 'text-destructive' : 'text-foreground'}`}>
                {seller.lateRate}%
              </div>
              <div className="text-[10px] text-muted-foreground">{seller.avgLateMinutes} мин в среднем</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-2.5 text-center">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Пунктуальность</div>
              <div className={`text-lg font-bold tabular-nums ${seller.onTimeRate >= 95 ? 'text-success' : seller.onTimeRate >= 80 ? 'text-warning' : 'text-destructive'}`}>
                {seller.onTimeRate}%
              </div>
              <div className="text-[10px] text-muted-foreground">смен без опозданий</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-2.5 text-center">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Время absent</div>
              <div className={`text-lg font-bold tabular-nums ${absentRate > 15 ? 'text-destructive' : 'text-foreground'}`}>
                {totalAbsentMin}м
              </div>
              <div className="text-[10px] text-muted-foreground">{absentRate}% времени смен</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-2.5 text-center">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Подозр. слотов</div>
              <div className={`text-lg font-bold tabular-nums ${highProbSlots.length > 2 ? 'text-destructive' : 'text-foreground'}`}>
                {highProbSlots.length}
              </div>
              <div className="text-[10px] text-muted-foreground">P(absence) ≥ 50%</div>
            </div>
          </div>

          {/* График: пунктуальность открытия */}
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Пунктуальность открытия смен
              </span>
              <span className="text-[10px] font-medium text-foreground">
                {seller.onTimeRate}% вовремя
              </span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden flex">
              <div
                className="h-full bg-success rounded-l-full transition-all duration-700"
                style={{ width: `${seller.onTimeRate}%` }}
              />
              <div
                className="h-full bg-destructive/70 transition-all duration-700"
                style={{ width: `${seller.lateRate}%` }}
              />
              {absentRate > 0 && (
                <div
                  className="h-full bg-amber-500/60 rounded-r-full transition-all duration-700"
                  style={{ width: `${Math.min(absentRate, 100 - seller.onTimeRate - seller.lateRate)}%` }}
                />
              )}
            </div>
            <div className="flex justify-between mt-1 text-[9px] text-muted-foreground">
              <span className="text-success">{seller.onTimeRate}% вовремя</span>
              <span className="text-destructive">{seller.lateRate}% опоздания</span>
              {absentRate > 0 && <span className="text-amber-500">{absentRate}% absent</span>}
            </div>
          </div>

          {/* Список подозрительных absent-периодов */}
          {highProbSlots.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className="w-3 h-3 text-destructive" />
                <span className="text-[10px] font-semibold text-destructive uppercase tracking-wide">
                  Подозрительные периоды без чеков
                </span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {highProbSlots.slice(0, 8).map((slot, i) => (
                  <div
                    key={i}
                    className="bg-destructive/5 border border-destructive/15 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium text-foreground">
                        {slot.date} · {slot.slot}
                      </span>
                      <span className={`text-xs font-bold tabular-nums ${
                        slot.probability_absent >= 0.7 ? 'text-destructive' : 'text-amber-500'
                      }`}>
                        {Math.round(slot.probability_absent * 100)}%
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      {slot.explanation}
                    </p>
                    {slot.recommendation && (
                      <p className="text-[10px] text-primary/80 mt-0.5">
                        💡 {slot.recommendation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Нет данных об отсутствии */}
          {!absenceLoading && absenceData && highProbSlots.length === 0 && (
            <div className="text-[10px] text-muted-foreground text-center py-2">
              Подозрительных периодов без чеков не обнаружено
            </div>
          )}
          {absenceLoading && (
            <div className="text-[10px] text-muted-foreground text-center py-2">
              Загрузка анализа отсутствия...
            </div>
          )}
        </div>
      </div>

      {/* AI Insights */}
      <AIInsights
        insights={[
          ...(insights.length > 0 ? insights : seller.aiInsights),
          ...(highProbSlots.length > 0
            ? highProbSlots.slice(0, 2).map((s) =>
                `⚠️ ${s.date} в ${s.slot}: ${Math.round(s.probability_absent * 100)}% вероятность отсутствия — ${s.explanation.toLowerCase()}`
              )
            : []),
        ]}
      />
    </motion.div>
  );
}

export default SellerDetailView;
