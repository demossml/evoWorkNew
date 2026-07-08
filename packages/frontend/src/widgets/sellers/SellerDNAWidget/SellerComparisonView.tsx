import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Sparkles,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
} from "lucide-react";
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
import type { SellerDNAProfile, DNALabel, WeekdayCompareProfile, WeekdayCompareResult } from "./types";
import { useSellerComparison } from "@/hooks/useSellerComparison";
import { useHourlyCompare } from "@/hooks/useHourlyCompare";
import { HourlyCompareTable } from "./HourlyCompareTable";

// ===================== Props =====================

interface SellerComparisonViewProps {
  allSellers: SellerDNAProfile[];
  weekdayCompare?: {
    weekday: number;
    dates: string[];
    sellers: WeekdayCompareProfile[];
    recommendation?: { message: string; bestWeekday?: number; bestWeekdayLabel?: string; bestCount?: number };
  } | null;
  onBack: () => void;
  compareMode?: "auto" | "weekday" | "timeline";
  onCompareModeChange?: (mode: "auto" | "weekday" | "timeline") => void;
  compareWeekday?: number;
  onCompareWeekdayChange?: (wd: number) => void;
  targetDate?: string;
  shopId?: string;
  sellerIds?: string[];
}

// ===================== Constants =====================

const SELLER_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#f43f5e"];

const DNA_COLORS: Record<DNALabel, string> = {
  Охотник: "bg-success/10 text-success border-success/20",
  Стабильный: "bg-primary/10 text-primary border-primary/20",
  Одиночка: "bg-warning/10 text-warning border-warning/20",
  Восходящий: "bg-primary/10 text-primary border-primary/20",
  Проблемный: "bg-destructive/10 text-destructive border-destructive/20",
};

interface MetricRow {
  label: string;
  category?: string;
  cells: { seller: string; value: string; raw: number; isBest: boolean }[];
}

// ===================== Helpers =====================

function formatMoney(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return `${n}`;
}

function initials(name: string) {
  const parts = name.split(" ");
  return parts.length >= 2
    ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function trendBadge(trend: "up" | "down" | "stable", slope: number) {
  if (trend === "up") {
    return (
      <span className="inline-flex items-center gap-0.5 text-success text-[10px] font-medium">
        <TrendingUp className="w-2.5 h-2.5" />+{slope.toFixed(0)}/д
      </span>
    );
  }
  if (trend === "down") {
    return (
      <span className="inline-flex items-center gap-0.5 text-destructive text-[10px] font-medium">
        <TrendingDown className="w-2.5 h-2.5" />
        {slope.toFixed(0)}/д
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground text-[10px] font-medium">
      <Minus className="w-2.5 h-2.5" />0/д
    </span>
  );
}

// ===================== Charts =====================

function buildHourlyOverlay(sellers: SellerDNAProfile[]) {
  const allHours = sellers.flatMap(s => s.hourlyRevenue.map(p => p.hour));
  const minHour = Math.min(6, ...allHours);
  const maxHour = Math.max(23, ...allHours);

  const map = new Map<number, Record<string, number>>();
  for (let h = minHour; h <= maxHour; h++) {
    const entry: Record<string, number> = { hour: `${h}:00` };
    sellers.forEach((s) => {
      entry[s.name] = 0;
    });
    map.set(h, entry);
  }

  sellers.forEach((seller) => {
    for (const p of seller.hourlyRevenue) {
      const entry = map.get(p.hour);
      if (entry) entry[seller.name] = p.revenue;
    }
  });

  return Array.from(map.values());
}

function buildHourlyChecksOverlay(sellers: SellerDNAProfile[]) {
  const allHours = sellers.flatMap(s => s.hourlyRevenue.map(p => p.hour));
  const minHour = Math.min(6, ...allHours);
  const maxHour = Math.max(23, ...allHours);

  const map = new Map<number, Record<string, number>>();
  for (let h = minHour; h <= maxHour; h++) {
    const entry: Record<string, number> = { hour: `${h}:00` };
    sellers.forEach((s) => {
      entry[s.name] = 0;
    });
    map.set(h, entry);
  }

  sellers.forEach((seller) => {
    for (const p of seller.hourlyRevenue) {
      const entry = map.get(p.hour);
      if (entry) entry[seller.name] = p.checks;
    }
  });

  return Array.from(map.values());
}

// ===================== Sub-components =====================

function EmptyComparison() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Users className="w-8 h-8 text-muted-foreground opacity-40" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">
        Недостаточно продавцов
      </h3>
      <p className="text-xs text-muted-foreground max-w-xs">
        Выберите минимум 2 продавца во вкладке «Рейтинг», чтобы увидеть сравнение.
      </p>
    </div>
  );
}

// ===================== Weekday multi-week comparison table =====================

const WD_NAMES = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function WeekdayCompareTable({ data }: { data: { weekday: number; dates: string[]; sellers: import("./types").WeekdayCompareProfile[] } }) {
  if (data.sellers.length < 2) return <EmptyComparison />;

  const colors = ["#6366f1", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#ec4899"];

  // Build rows
  const rows = [
    { label: "Дней отработано", getValue: (s: typeof data.sellers[0]) => `${s.daysWorked} / ${data.dates.length}` },
    { label: "Выручка/час", getValue: (s: typeof data.sellers[0]) => s.rubPerHour ? `${s.rubPerHour.toLocaleString()}₽` : "—", higherIsBetter: true },
    { label: "Средний чек", getValue: (s: typeof data.sellers[0]) => `${s.avgCheck.toLocaleString()}₽`, higherIsBetter: true },
    { label: "Мёртвое время", getValue: (s: typeof data.sellers[0]) => `${s.deadTimePct}%`, higherIsBetter: false },
  ];

  return (
    <div className="space-y-3">
      {/* Info header */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Сравнение за {WD_NAMES[data.weekday]}</span>:{" "}
        {data.dates.length} одинаковых дней за последние недели ({data.dates.join(", ")})
      </div>

      {/* Table */}
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-2 font-medium text-muted-foreground sticky left-0 z-10 bg-card">
                Метрика
              </th>
              {data.sellers.map((s, i) => (
                <th key={s.uuid} className="text-right py-2 px-2 font-medium whitespace-nowrap" style={{ color: colors[i % colors.length] }}>
                  {s.name.split(" ")[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const vals = data.sellers.map(s => parseFloat(row.getValue(s)));
              const bestVal = row.higherIsBetter ? Math.max(...vals) : Math.min(...vals);
              return (
                <tr key={ri} className="border-b border-border/30 group hover:bg-muted/30 transition-colors">
                  <td className={`py-1.5 pr-2 text-muted-foreground sticky left-0 z-10 transition-colors ${ri % 2 === 0 ? "bg-muted/20" : "bg-card"}`}>
                    {row.label}
                  </td>
                  {data.sellers.map((s, i) => {
                    const sv = parseFloat(row.getValue(s));
                    const isBest = !isNaN(sv) && sv === bestVal;
                    return (
                      <td key={s.uuid} className={`py-1.5 px-2 text-right tabular-nums whitespace-nowrap transition-colors ${ri % 2 === 0 ? "bg-muted/20" : ""} ${isBest ? "font-bold text-foreground" : "text-muted-foreground"}`}>
                        {isBest && <Star className="w-2.5 h-2.5 inline-block mr-0.5 -mt-0.5" style={{ color: colors[i % colors.length] }} />}
                        {row.getValue(s)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Ideal profile row */}
      <IdealProfileRow sellers={data.sellers} colors={colors} />

      {/* Hourly chart */}
      <WeekdayHourlyOverlay data={data} colors={colors} />
    </div>
  );
}

function IdealProfileRow({ sellers, colors }: { sellers: import("./types").WeekdayCompareProfile[]; colors: string[] }) {
  // Top-3 by rubPerHour
  const top3 = [...sellers].sort((a, b) => (b.rubPerHour ?? 0) - (a.rubPerHour ?? 0)).slice(0, 3);
  if (top3.length === 0) return null;

  const idealRubPerHour = Math.round(top3.reduce((s, x) => s + (x.rubPerHour ?? 0), 0) / top3.length);
  const idealAvgCheck = Math.round(top3.reduce((s, x) => s + x.avgCheck, 0) / top3.length);
  const idealDeadTime = Math.round(top3.reduce((s, x) => s + x.deadTimePct, 0) / top3.length);

  return (
    <div className="bg-warning/5 border border-warning/20 rounded-lg p-3 text-xs">
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles className="w-3.5 h-3.5 text-warning" />
        <span className="font-semibold text-warning">Идеальный профиль (топ-3)</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <span className="text-muted-foreground">Выручка/ч:</span>{" "}
          <span className="font-semibold text-foreground">{idealRubPerHour.toLocaleString()}₽</span>
        </div>
        <div>
          <span className="text-muted-foreground">Средний чек:</span>{" "}
          <span className="font-semibold text-foreground">{idealAvgCheck.toLocaleString()}₽</span>
        </div>
        <div>
          <span className="text-muted-foreground">Мёртвое время:</span>{" "}
          <span className="font-semibold text-foreground">{idealDeadTime}%</span>
        </div>
      </div>
    </div>
  );
}

function WeekdayHourlyOverlay({ data, colors }: { data: { sellers: import("./types").WeekdayCompareProfile[] }; colors: string[] }) {
  // Merge all sellers' hourly data
  const hourSet = new Set<number>();
  for (const s of data.sellers) {
    for (const p of s.hourlyRevenue) hourSet.add(p.hour);
  }
  const hours = [...hourSet].sort((a, b) => a - b);
  const minH = Math.min(6, ...hours);
  const maxH = Math.max(23, ...hours);

  const chartData: Record<string, any>[] = [];
  for (let h = minH; h <= maxH; h++) {
    const entry: Record<string, any> = { hour: `${h}:00` };
    for (const s of data.sellers) {
      const pt = s.hourlyRevenue.find(p => p.hour === h);
      entry[s.name] = pt ? pt.revenue : 0;
    }
    chartData.push(entry);
  }

  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <h4 className="text-xs font-semibold text-foreground mb-2">
        Выручка по часам (среднее за {WD_NAMES[data.sellers.length > 0 ? 0 : 0]})
      </h4>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="hour" tick={{ fontSize: 10 }} className="text-muted-foreground" />
            <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" tickFormatter={formatMoney} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: number, name: string) => [`${formatMoney(v)}₽`, name]} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {data.sellers.map((s, i) => (
              <Line key={s.uuid} type="monotone" dataKey={s.name} stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r: 2, fill: colors[i % colors.length] }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SellerHeader({
  seller,
  color,
}: {
  seller: SellerDNAProfile;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 text-white"
        style={{ backgroundColor: color }}
      >
        {initials(seller.name)}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground truncate">
          {seller.name.split(" ")[0]}
        </div>
        <div
          className={`text-[9px] px-1 py-px rounded-full inline-block font-medium ${DNA_COLORS[seller.dnaLabel]}`}
        >
          {seller.dnaLabel}
        </div>
      </div>
    </div>
  );
}

// ===================== Comparison table =====================

function ComparisonTable({ rows }: { rows: MetricRow[] }) {
  const hasRows = rows.length > 0;

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 pr-2 font-medium text-muted-foreground sticky left-0 z-10 bg-card">
              Метрика
            </th>
            {hasRows && rows[0].cells.map((c, ci) => (
              <th
                key={ci}
                className="text-right py-2 px-2 font-medium whitespace-nowrap"
                style={{ color: SELLER_COLORS[ci] }}
              >
                {c.seller.split(" ")[0]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const isEven = ri % 2 === 0;
            return (
            <tr key={ri} className="border-b border-border/30 group hover:bg-muted/30 transition-colors">
              <td
                className={`py-1.5 pr-2 text-muted-foreground sticky left-0 z-10 transition-colors ${
                  isEven ? "bg-muted/20" : "bg-card"
                }`}
              >
                {row.label}
              </td>
              {row.cells.map((cell, ci) => (
                <td
                  key={ci}
                  className={`py-1.5 px-2 text-right tabular-nums whitespace-nowrap transition-colors ${
                    isEven ? "bg-muted/20" : ""
                  } ${cell.isBest ? "font-bold text-foreground" : "text-muted-foreground"}`}
                >
                  {cell.isBest && (
                    <Star className="w-2.5 h-2.5 inline-block mr-0.5 -mt-0.5" style={{ color: SELLER_COLORS[ci] }} />
                  )}
                  {cell.value}
                </td>
              ))}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ===================== Charts =====================

function RevenueOverlayChart({ sellers }: { sellers: SellerDNAProfile[] }) {
  const data = buildHourlyOverlay(sellers);

  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <h4 className="text-xs font-semibold text-foreground mb-2">
        Выручка по часам
      </h4>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="hour" tick={{ fontSize: 10 }} className="text-muted-foreground" />
            <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" tickFormatter={formatMoney} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8 }}
              formatter={(v: number, name: string) => [`${formatMoney(v)}₽`, name]}
            />
            <Legend
              wrapperStyle={{ fontSize: 10 }}
              formatter={(v: string) => (
                <span style={{ color: SELLER_COLORS[sellers.findIndex((s) => s.name === v)] }}>
                  {v.split(" ")[0]}
                </span>
              )}
            />
            {sellers.map((seller, i) => (
              <Line
                key={seller.uuid}
                type="monotone"
                dataKey={seller.name}
                stroke={SELLER_COLORS[i]}
                strokeWidth={2}
                dot={{ r: 2, fill: SELLER_COLORS[i] }}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ChecksOverlayChart({ sellers }: { sellers: SellerDNAProfile[] }) {
  const data = buildHourlyChecksOverlay(sellers);

  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <h4 className="text-xs font-semibold text-foreground mb-2">
        Чеки по часам
      </h4>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="hour" tick={{ fontSize: 10 }} className="text-muted-foreground" />
            <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8 }}
              formatter={(v: number, name: string) => [`${v}`, name]}
            />
            <Legend
              wrapperStyle={{ fontSize: 10 }}
              formatter={(v: string) => (
                <span style={{ color: SELLER_COLORS[sellers.findIndex((s) => s.name === v)] }}>
                  {v.split(" ")[0]}
                </span>
              )}
            />
            {sellers.map((seller, i) => (
              <Bar
                key={seller.uuid}
                dataKey={seller.name}
                fill={SELLER_COLORS[i]}
                radius={[2, 2, 0, 0]}
                maxBarSize={16}
                opacity={0.85}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ===================== AI summary =====================

function AIComparisonSummary({ sellers }: { sellers: SellerDNAProfile[] }) {
  const names = sellers.map((s) => s.name.split(" ")[0]).join(", ");
  const best = sellers.reduce((a, b) =>
    a.overallScore > b.overallScore ? a : b
  );
  const worst = sellers.reduce((a, b) =>
    a.overallScore < b.overallScore ? a : b
  );

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold text-primary">
          AI Сравнительный анализ
        </span>
      </div>
      <ul className="space-y-1.5">
        <li className="text-xs text-foreground flex items-start gap-1.5">
          <span className="text-primary mt-0.5 shrink-0">•</span>
          Среди сравниваемых ({names}) лидирует <strong>{best.name.split(" ")[0]}</strong> с DNA Score{" "}
          {best.overallScore}/100. Отрыв от ближайшего —{" "}
          {best.overallScore -
            Math.max(...sellers.filter((s) => s.uuid !== best.uuid).map((s) => s.overallScore))}{" "}
          баллов.
        </li>
        <li className="text-xs text-foreground flex items-start gap-1.5">
          <span className="text-primary mt-0.5 shrink-0">•</span>
          <strong>{worst.name.split(" ")[0]}</strong> требует наибольшего внимания: DNA Score{" "}
          {worst.overallScore}/100. Ключевые зоны роста:{" "}
          {worst.weaknesses.slice(0, 2).join(", ").toLowerCase()}.
        </li>
        <li className="text-xs text-foreground flex items-start gap-1.5">
          <span className="text-primary mt-0.5 shrink-0">•</span>
          Разброс по среднему чеку: от{" "}
          {Math.min(...sellers.map((s) => s.avgCheck))}₽ до{" "}
          {Math.max(...sellers.map((s) => s.avgCheck))}₽ — разница{" "}
          {Math.round(
            ((Math.max(...sellers.map((s) => s.avgCheck)) -
              Math.min(...sellers.map((s) => s.avgCheck))) /
              Math.min(...sellers.map((s) => s.avgCheck))) *
              100
          )}
          %. Это указывает на разный подход к допродажам.
        </li>
        <li className="text-xs text-foreground flex items-start gap-1.5">
          <span className="text-primary mt-0.5 shrink-0">•</span>
          По мёртвому времени: худший показатель —{" "}
          {Math.max(...sellers.map((s) => s.deadTimePct))}%, лучший —{" "}
          {Math.min(...sellers.map((s) => s.deadTimePct))}%. Рекомендуется проанализировать
          расписание смен для выравнивания загрузки.
        </li>
        <li className="text-xs text-foreground flex items-start gap-1.5">
          <span className="text-primary mt-0.5 shrink-0">•</span>
          Общая рекомендация: масштабировать практики{" "}
          <strong>{best.name.split(" ")[0]}</strong> на остальных продавцов через
          наставничество и тренинги. Ожидаемый прирост выручки: +8–15%.
        </li>
      </ul>
    </div>
  );
}

function SellerToggleChip({
  seller,
  selected,
  color,
  onToggle,
}: {
  seller: SellerDNAProfile;
  selected: boolean;
  color: string;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-200 active:scale-95 ${
        selected
          ? "bg-card border-primary text-foreground shadow-sm"
          : "bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
      }`}
    >
      <span
        className="w-3.5 h-3.5 rounded-full shrink-0"
        style={{ backgroundColor: color, opacity: selected ? 1 : 0.35 }}
      />
      {seller.name.split(" ")[0]}
    </button>
  );
}

// ===================== Main component =====================

export function SellerComparisonView({
  allSellers,
  weekdayCompare,
  onBack,
  compareMode = "auto",
  onCompareModeChange,
  compareWeekday,
  onCompareWeekdayChange,
  targetDate,
  shopId,
  sellerIds = [],
}: SellerComparisonViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const ids = allSellers.slice(0, 3).map((s) => s.uuid);
    return new Set(ids);
  });

  const toggleSeller = (uuid: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else if (next.size < 4) next.add(uuid);
      return next;
    });
  };

  const sellers = useMemo(
    () => allSellers.filter((s) => selectedIds.has(s.uuid)),
    [allSellers, selectedIds],
  );

  const selectedIdArray = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const { metrics } = useSellerComparison(selectedIdArray, allSellers);

  // Build weekday comparison if data available
  const weekdaySellers = weekdayCompare?.sellers ?? [];
  const hasWeekdayData = compareMode === "weekday" && weekdaySellers.length >= 2;
  const isTimeline = compareMode === "timeline";

  if (!hasWeekdayData && !isTimeline && allSellers.length < 2) return <EmptyComparison />;

  const subContent = isTimeline
    ? <TimelineView targetDate={targetDate ?? new Date().toISOString().slice(0, 10)} shopId={shopId} sellerIds={sellerIds} />
    : hasWeekdayData
      ? <WeekdayCompareTable data={weekdayCompare!} />
      : sellers.length < 2
        ? <EmptyComparison />
        : <ComparisonContent sellers={sellers} metrics={metrics} />;

  const WD_LABELS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          Сравнение продавцов
        </h3>
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-foreground hover:bg-muted/80 transition"
        >
          <ArrowLeft className="w-3 h-3" />
          К списку
        </button>
      </div>

      {/* Comparison mode selector */}
      {onCompareModeChange && (
        <div className="flex gap-1 bg-muted/60 rounded-md p-0.5 w-fit">
          <button
            onClick={() => onCompareModeChange("auto")}
            className={`px-2.5 py-1 text-[10px] font-medium rounded transition ${
              compareMode === "auto"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Авто
          </button>
          <button
            onClick={() => onCompareModeChange("weekday")}
            className={`px-2.5 py-1 text-[10px] font-medium rounded transition ${
              compareMode === "weekday"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            По дням недели
          </button>
          <button
            onClick={() => onCompareModeChange("timeline")}
            className={`px-2.5 py-1 text-[10px] font-medium rounded transition ${
              compareMode === "timeline"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            По минутам
          </button>
        </div>
      )}

      {/* Recommendation banner — when same-day mode finds too few matches */}
      {weekdayCompare?.recommendation && (
        <div className="bg-warning/5 border border-warning/20 rounded-lg p-3 text-xs flex items-start gap-2">
          <Sparkles className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-warning mb-0.5">Рекомендация</div>
            <div className="text-muted-foreground">{weekdayCompare.recommendation.message}</div>
          </div>
        </div>
      )}

      {/* Weekday picker — only in auto mode when we filter within a range */}
      {compareMode === "auto" && onCompareWeekdayChange && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {WD_LABELS.map((label, idx) => (
            <button
              key={idx}
              onClick={() => onCompareWeekdayChange(idx)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition whitespace-nowrap ${
                compareWeekday === idx
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Seller selector chips — only in auto mode */}
      {compareMode === "auto" && (
        <div className="flex flex-wrap gap-1.5">
          {allSellers.map((seller, i) => (
            <SellerToggleChip
              key={seller.uuid}
              seller={seller}
              selected={selectedIds.has(seller.uuid)}
              color={SELLER_COLORS[i % SELLER_COLORS.length]}
              onToggle={() => toggleSeller(seller.uuid)}
            />
          ))}
        </div>
      )}

      {subContent}
    </motion.div>
  );
}

// ===================== Comparison content =====================

function ComparisonContent({
  sellers,
  metrics,
}: {
  sellers: SellerDNAProfile[];
  metrics: { label: string; cells: { seller: string; value: string; raw: number; isBest: boolean }[] }[];
}) {
  return (
    <>
      {/* Seller header chips */}
      <div className="flex gap-3 flex-wrap">
        {sellers.map((seller, i) => (
          <SellerHeader key={seller.uuid} seller={seller} color={SELLER_COLORS[i]} />
        ))}
      </div>

      {/* Comparison table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-3 py-2 border-b border-border">
          <h4 className="text-xs font-semibold text-foreground">
            Сводная таблица
          </h4>
        </div>
        <div className="p-2">
          <ComparisonTable rows={metrics} />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <RevenueOverlayChart sellers={sellers} />
        <ChecksOverlayChart sellers={sellers} />
      </div>

      {/* AI comparison summary */}
      <AIComparisonSummary sellers={sellers} />
    </>
  );
}

// ===================== Timeline view (hourly-compare) =====================

function TimelineView({
  targetDate,
  shopId,
  sellerIds,
}: {
  targetDate: string;
  shopId?: string;
  sellerIds: string[];
}) {
  const [granularity, setGranularity] = useState(60);
  const { data, isLoading } = useHourlyCompare({
    targetDate,
    weeksBack: 5,
    shopId,
    sellerIds,
    granularityMinutes: granularity,
  });

  if (sellerIds.length < 2) return <EmptyComparison />;

  return (
    <HourlyCompareTable
      data={data ?? { weekday: 0, weekdayLabel: "", dates: [], sellers: [], slots: [] }}
      granularityMinutes={granularity}
      onGranularityChange={setGranularity}
      loading={isLoading}
    />
  );
}

export default SellerComparisonView;
