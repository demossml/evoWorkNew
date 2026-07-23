import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, LabelList } from "recharts";
import {
  ChevronDown, ChevronUp, TrendingUp, DollarSign,
  PieChartIcon, Package, Percent,
} from "lucide-react";
import { DateFilter, type DateFilterValue } from "@widgets/home/DateFilter";
import { Card, CardContent, CardHeader, CardTitle, ReportKPIBar } from "@shared/ui";
import { LoadingState, ErrorState } from "@shared/ui/states";
import { useTelegramBackButton } from "../hooks/useSimpleTelegramBackButton";
import { useEmployeeRole } from "../hooks/useApi";

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

const COLORS = [
  "#10b981", "#f59e0b", "#ef4444", "#3b82f6",
  "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16",
  "#f97316", "#6366f1", "#14b8a6", "#e11d48",
];

function fmtRub(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ₽`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1000)}k ₽`;
  return `${Math.round(n)} ₽`;
}

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function getTodayRange(): DateFilterValue {
  const d = new Date();
  const s = d.toISOString().slice(0, 10);
  return { since: s, until: s, dateMode: "today" };
}

// ─── Pie Chart Tooltip ────────────────────────────────────────────────

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

// ─── Main Component ───────────────────────────────────────────────────

export default function GrossProfitReport() {
  useTelegramBackButton();

  // Проверка роли — только ADMIN / SUPERADMIN
  const { data: roleData, isLoading: roleLoading } = useEmployeeRole();
  const isAdmin = roleData?.employeeRole === "ADMIN" || roleData?.employeeRole === "SUPERADMIN";

  const [dateFilter, setDateFilter] = useState<DateFilterValue>(getTodayRange);
  const [shopId, setShopId] = useState<string>("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showAllGroups, setShowAllGroups] = useState(false);

  // Загружаем список магазинов
  const { data: shopsData } = useQuery({
    queryKey: ["shops", "list"],
    queryFn: async () => {
      const res = await fetch("/api/evotor/shops", {
        headers: {
          initData: "guest",
          "telegram-id": localStorage.getItem("telegramId") || "",
        },
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
        headers: {
          initData: "guest",
          "telegram-id": localStorage.getItem("telegramId") || "",
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any)?.error || `Ошибка ${res.status}`);
      }
      return res.json();
    },
    enabled: !!dateFilter.since && !!dateFilter.until,
  });

  // Данные для круговой диаграммы: группы с положительной прибылью
  const pieData = useMemo(() => {
    if (!data?.groups) return [];
    return data.groups
      .filter(g => g.revenue > 0)
      .map(g => ({
        groupName: g.groupName,
        profit: g.profit,
        revenue: g.revenue,
        margin: g.margin,
        share: g.share,
      }));
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
  if (!isAdmin) {
    return (
      <div className="app-page min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground">Доступ запрещён</h2>
          <p className="text-sm text-muted-foreground mt-1">Требуется роль ADMIN или SUPERADMIN</p>
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
        <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <PieChartIcon className="w-5 h-5 text-primary" />
          Валовая прибыль
        </h1>

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

        {/* Круговая диаграмма */}
        {pieData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Распределение прибыли по группам</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="profit"
                    nameKey="groupName"
                    cx="50%"
                    cy="50%"
                    outerRadius={110}
                    innerRadius={55}
                    paddingAngle={2}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                    <LabelList
                      dataKey="share"
                      position="outside"
                      formatter={(v: number) => `${v.toFixed(0)}%`}
                      className="text-[11px] fill-muted-foreground"
                    />
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>

              {/* Легенда */}
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                {pieData.map((g, i) => (
                  <div key={g.groupName} className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    />
                    <span className="max-w-[120px] truncate">{g.groupName}</span>
                    <span className="font-mono tabular-nums">{fmtRub(g.profit)}</span>
                  </div>
                ))}
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
                          COLORS[
                            data.groups.findIndex((g) => g.groupUuid === group.groupUuid) %
                              COLORS.length
                          ],
                      }}
                    />

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {group.groupName}
                      </p>
                      <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>Выручка: {fmtRub(group.revenue)}</span>
                        <span
                          className={
                            group.profit >= 0 ? "text-emerald-600" : "text-red-500"
                          }
                        >
                          Прибыль: {fmtRub(group.profit)}
                        </span>
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
                          {/* Заголовок таблицы */}
                          <div className="px-4 py-1.5 flex gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
                            <span className="flex-1">Товар</span>
                            <span className="w-12 text-right">Кол-во</span>
                            <span className="w-20 text-right">Выручка</span>
                            <span className="w-20 text-right">Прибыль</span>
                            <span className="w-12 text-right">%</span>
                          </div>

                          <div className="max-h-[400px] overflow-y-auto divide-y divide-border">
                            {group.items.map((item, i) => (
                              <div
                                key={item.article || i}
                                className={`px-4 py-2 flex gap-2 items-center text-xs ${
                                  i % 2 === 0 ? "bg-transparent" : "bg-muted/10"
                                }`}
                              >
                                <span className="flex-1 truncate text-foreground">
                                  {item.name}
                                </span>
                                <span className="w-12 text-right tabular-nums text-muted-foreground">
                                  {item.quantity}
                                </span>
                                <span className="w-20 text-right tabular-nums font-mono text-foreground">
                                  {fmtRub(item.revenue)}
                                </span>
                                <span
                                  className={`w-20 text-right tabular-nums font-mono ${
                                    item.profit >= 0
                                      ? "text-emerald-600"
                                      : "text-red-500"
                                  }`}
                                >
                                  {fmtRub(item.profit)}
                                </span>
                                <span
                                  className={`w-12 text-right tabular-nums ${
                                    item.margin >= 0
                                      ? "text-emerald-600"
                                      : "text-red-500"
                                  }`}
                                >
                                  {item.margin.toFixed(0)}%
                                </span>
                              </div>
                            ))}
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
