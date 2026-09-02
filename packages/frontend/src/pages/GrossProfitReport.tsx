import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, ChevronUp, TrendingUp, DollarSign,
  PieChartIcon, Package, Percent,
} from "lucide-react";
import { DateFilter, type DateFilterValue } from "@widgets/home/DateFilter";
import { Card, CardContent, CardHeader, CardTitle, ReportKPIBar } from "@shared/ui";
import { LoadingState, ErrorState } from "@shared/ui/states";
import { useTelegramBackButton } from "../hooks/useSimpleTelegramBackButton";
import { useEmployeeRole } from "../hooks/useApi";
import { canSeeProfit } from "@features/dashboard/model/homePageModel";
import { getAuthHeaders } from "@shared/api";
import { HelpButton } from "@shared/help/HelpSheet";

// ─── Types ───────────────────────────────────────────────────────────

interface ProductItem {
  name: string;
  article: string;
  revenue: number;
  cost: number;
  profit: number;
  quantity: number;
  margin: number;
}

interface GroupData {
  groupUuid: string;
  groupName: string;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  share: number;
  items: ProductItem[];
}

interface GrossProfitResponse {
  since: string;
  until: string;
  totalRevenue: number;
  totalCost: number;
  totalGrossProfit: number;
  totalMargin: number;
  groups: GroupData[];
}

// ─── Helpers ──────────────────────────────────────────────────────────

/** Цвета из CSS-токенов (поддерживают светлую/тёмную тему) */
const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

function fmtRub(n: number): string {
  return `${Math.round(Number(n) || 0).toLocaleString("ru-RU")} ₽`;
}

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function getTodayRange(): DateFilterValue {
  const d = new Date();
  const s = d.toISOString().slice(0, 10);
  return { since: s, until: s, dateMode: "today" };
}

// ─── Pie Helpers ───────────────────────────────────────────────────────

const PieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground">{d.groupName}</p>
      <p className="text-muted-foreground">Прибыль: {fmtRub(d.profit)}</p>
      <p className="text-muted-foreground">Маржа: {d.margin.toFixed(1)}%</p>
      <p className="text-muted-foreground">Доля: {d.share.toFixed(1)}%</p>
    </div>
  );
};

/**
 * Custom label: снаружи сектора — линия + сумма в ₽.
 * Внутри сектора — % (через отдельный LabelList).
 */
const RADIAN = Math.PI / 180;
function renderCustomLabel({
  cx, cy, midAngle, innerRadius, outerRadius, percent, profit,
}: any) {
  const radius = outerRadius + 20;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  // Точка на внешней границе сектора (для линии)
  const ex = cx + (outerRadius + 6) * Math.cos(-midAngle * RADIAN);
  const ey = cy + (outerRadius + 6) * Math.sin(-midAngle * RADIAN);

  // Не показываем метку для очень маленьких секторов (<3%)
  if (percent < 0.03) return null;

  const textAnchor = x > cx ? "start" : "end";

  return (
    <g>
      <polyline
        points={`${ex},${ey} ${x},${y}`}
        stroke="hsl(var(--muted-foreground) / 0.4)"
        strokeWidth={1}
        fill="none"
      />
      <text
        x={x + (x > cx ? 4 : -4)}
        y={y}
        textAnchor={textAnchor}
        dominantBaseline="central"
        className="text-[11px] fill-foreground font-mono"
      >
        {fmtRub(profit)}
      </text>
    </g>
  );
}

// ─── Main Component ───────────────────────────────────────────────────

export default function GrossProfitReport() {
  useTelegramBackButton();

  // Проверка роли — SUPERADMIN или ADMIN
  const { data: roleData, isLoading: roleLoading } = useEmployeeRole();
  const canSeeProfitValue = canSeeProfit(roleData?.employeeRole);

  const [dateFilter, setDateFilter] = useState<DateFilterValue>(getTodayRange);
  const [shopId, setShopId] = useState<string>("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showAllGroups, setShowAllGroups] = useState(false);

  // Загружаем список магазинов
  const { data: shopsData } = useQuery({
    queryKey: ["shops", "list"],
    queryFn: async () => {
      const res = await fetch("/api/evotor/shops", {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Не удалось загрузить магазины");
      return res.json() as Promise<{ shopOptions: Record<string, string> }>;
    },
    staleTime: 5 * 60_000,
  });

  const shopOptions: Record<string, string> = useMemo(
    () => ({ all: "Все магазины", ...(shopsData?.shopOptions ?? {}) }),
    [shopsData],
  );

  // Основные данные отчёта
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<GrossProfitResponse>({
    queryKey: ["gross-profit", dateFilter.since, dateFilter.until, shopId],
    queryFn: async () => {
      const params = new URLSearchParams({
        since: dateFilter.since,
        until: dateFilter.until,
      });
      if (shopId !== "all") params.set("shopId", shopId);

      const res = await fetch(`/api/reports/gross-profit?${params}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any)?.error || `Ошибка ${res.status}`);
      }
      return res.json();
    },
    enabled: !!dateFilter.since && !!dateFilter.until,
  });

  // Данные для горизонтальных баров: группы, отсортированные по прибыли
  const barData = useMemo(() => {
    if (!data?.groups) return [];
    return [...data.groups]
      .filter((g) => g.revenue > 0)
      .map((g) => ({
        groupName: g.groupName,
        profit: g.profit,
        revenue: g.revenue,
        share: g.share,
      }))
      .sort((a, b) => b.profit - a.profit);
  }, [data]);

  // Порог для скрытия мелких групп
  const MIN_SHARE_VISIBLE = 0.5;
  const visibleGroups = useMemo(() => {
    if (!data?.groups) return [];
    if (showAllGroups) return data.groups;
    return data.groups.filter(
      g => g.share >= MIN_SHARE_VISIBLE || g.revenue >= 500,
    );
  }, [data, showAllGroups]);

  const toggleGroup = (uuid: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  };

  // ── Render ──────────────────────────────────────────────────────────

  if (roleLoading) return <LoadingState />;
  if (!canSeeProfitValue) {
    return (
      <div className="app-page min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground">Доступ запрещён</h2>
          <p className="text-sm text-muted-foreground mt-1">Требуется роль SUPERADMIN или ADMIN</p>
        </div>
      </div>
    );
  }

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={String(error)} onRetry={() => refetch()} />;
  if (!data) return <ErrorState error="Нет данных" onRetry={() => refetch()} />;

  return (
    <div className="app-page min-h-screen bg-background">
      {/* Шапка */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3 app-safe-top">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <PieChartIcon className="w-5 h-5 text-primary" />
            Валовая прибыль
          </h1>
          <HelpButton helpId="gross-profit" className="ml-auto" />
        </div>

        {/* Фильтры */}
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <DateFilter value={dateFilter} onChange={setDateFilter} />

          <select
            value={shopId}
            onChange={(e) => setShopId(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          >
            {Object.entries(shopOptions).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>

        <p className="text-xs text-muted-foreground mt-1.5">
          {dateFilter.since === dateFilter.until
            ? dateFilter.since
            : `${dateFilter.since} → ${dateFilter.until}`}
        </p>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* KPI Bar */}
        <ReportKPIBar
          compact
          items={[
            {
              label: "Выручка",
              value: fmtRub(data.totalRevenue),
              icon: <DollarSign className="w-4 h-4" />,
            },
            {
              label: "Валовая прибыль",
              value: fmtRub(data.totalGrossProfit),
              icon: <TrendingUp className="w-4 h-4" />,
              emphasis: data.totalGrossProfit >= 0 ? "positive" : "negative",
            },
            {
              label: "Маржа",
              value: `${data.totalMargin.toFixed(1)}%`,
              icon: <Percent className="w-4 h-4" />,
            },
            {
              label: "Групп",
              value: String(data.groups.length),
              icon: <Package className="w-4 h-4" />,
            },
          ]}
        />

        {/* Горизонтальные бары: распределение прибыли по группам */}
        {barData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Распределение прибыли по группам</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {barData.map((g, i) => {
                  const maxAbs = Math.max(1, ...barData.map((b) => Math.abs(b.profit)));
                  const widthPct = Math.max(g.profit !== 0 ? 2 : 0, (Math.abs(g.profit) / maxAbs) * 100);
                  return (
                    <div key={g.groupName} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                        />
                        <span className="text-sm text-foreground leading-snug break-words min-w-0 flex-1">
                          {g.groupName}
                        </span>
                        <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">
                          {fmtRub(g.profit)}
                        </span>
                        <span
                          className={`text-xs tabular-nums shrink-0 w-12 text-right ${
                            g.share >= 0 ? "text-muted-foreground" : "text-red-500"
                          }`}
                        >
                          {g.share.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${widthPct}%`,
                            backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Список групп */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Детализация по группам ({visibleGroups.length})
            </h2>
            {data.groups.length > visibleGroups.length && (
              <button
                type="button"
                onClick={() => setShowAllGroups(!showAllGroups)}
                className="text-xs text-primary hover:underline"
              >
                {showAllGroups ? "Скрыть мелкие" : "Показать все"}
              </button>
            )}
          </div>

          <AnimatePresence>
            {visibleGroups.map((group) => {
              const isExpanded = expandedGroups.has(group.groupUuid);

              return (
                <motion.div
                  key={group.groupUuid}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-xl border border-border bg-card overflow-hidden"
                >
                  {/* Заголовок группы */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.groupUuid)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors text-left"
                  >
                    {/* Индикатор цвета */}
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          CHART_COLORS[
                            data.groups.findIndex((g) => g.groupUuid === group.groupUuid) %
                              CHART_COLORS.length
                          ],
                      }}
                    />

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground leading-snug whitespace-normal break-words">
                        {group.groupName}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>Выручка: {fmtRub(group.revenue)}</span>
                        <span
                          className={
                            group.profit >= 0 ? "text-emerald-600" : "text-red-500"
                          }
                        >
                          Прибыль: {fmtRub(group.profit)}
                        </span>
                        <span>Маржа: {fmtPct(group.margin)}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p
                        className={`text-sm font-bold tabular-nums ${
                          group.margin >= 0 ? "text-emerald-600" : "text-red-500"
                        }`}
                      >
                        {fmtPct(group.margin)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {group.share.toFixed(1)}% доля
                      </p>
                    </div>

                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                  </button>

                  {/* Раскрытая таблица товаров */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-border">
                          <div className="max-h-[400px] overflow-y-auto">
                            {/* Sticky шапка колонок (подписи второй линии) */}
                            <div className="sticky top-0 z-[1] bg-muted/95 backdrop-blur-sm border-b border-border
                                            px-3 py-1.5 grid gap-1 grid-cols-[minmax(0,1fr)_2.75rem_4.75rem_4.75rem_2.75rem]
                                            text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              <span>Товар</span>
                              <span className="text-right">Шт</span>
                              <span className="text-right">Выручка</span>
                              <span className="text-right">Прибыль</span>
                              <span className="text-right">%</span>
                            </div>

                            {/* Строки товаров */}
                            <div className="divide-y divide-border">
                              {group.items.map((item, i) => (
                                <div
                                  key={item.article || i}
                                  className={`px-3 py-2.5 ${
                                    i % 2 === 0 ? "bg-transparent" : "bg-muted/10"
                                  }`}
                                >
                                  {/* Линия 1: полное название на всю ширину */}
                                  <p className="text-sm font-medium text-foreground leading-snug break-words mb-1.5">
                                    {item.name}
                                  </p>
                                  {/* Линия 2: та же сетка, что у шапки; 1-я ячейка пустая */}
                                  <div className="grid gap-1 grid-cols-[minmax(0,1fr)_2.75rem_4.75rem_4.75rem_2.75rem]
                                                  items-baseline text-sm tabular-nums">
                                    <span aria-hidden className="min-w-0" />
                                    <span className="text-right text-muted-foreground">
                                      {item.quantity}
                                    </span>
                                    <span className="text-right text-foreground">
                                      {fmtRub(item.revenue)}
                                    </span>
                                    <span
                                      className={`text-right ${
                                        item.profit >= 0 ? "text-emerald-600" : "text-red-500"
                                      }`}
                                    >
                                      {fmtRub(item.profit)}
                                    </span>
                                    <span
                                      className={`text-right ${
                                        item.margin >= 0 ? "text-emerald-600" : "text-red-500"
                                      }`}
                                    >
                                      {item.margin.toFixed(0)}%
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {visibleGroups.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Нет данных за выбранный период
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
