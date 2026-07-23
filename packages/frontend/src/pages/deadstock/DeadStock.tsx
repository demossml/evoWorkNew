import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useMe } from "../../hooks/useApi";
import { motion, AnimatePresence } from "framer-motion";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { telegram, isTelegramMiniApp } from "../../helpers/telegram";
import { client } from "../../helpers/api";
import { ErrorState, LoadingState } from "@shared/ui/states";
import { DateFilter, type DateFilterValue } from "@widgets/home/DateFilter";
import { ShopFilter } from "@widgets/filters";
import { GroupSelector } from "@widgets/reports";
import {
  FileDown, Package, ChevronDown, ChevronUp,
} from "lucide-react";
import { DeadStockDetailModal, type PlannedAction } from "@widgets/deadstock/ui/DeadStockDetailModal";
import type { DeadStockTileItem } from "@widgets/deadstock/ui/DeadStockGrid";

// ─── Types ───────────────────────────────────────────────────────────

interface GroupOption { name: string; uuid: string; }

interface ReportDataItem {
  itemId: string; name: string; article: string; quantity: number;
  sold: number; lastSaleDate: string | null; daysWithoutSales: number;
  shopId: string; shopName: string;
}

interface ReportData {
  salesData: ReportDataItem[];
  shopName: string; startDate: string; endDate: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function getTodayRange(): DateFilterValue {
  const d = new Date();
  const s = d.toISOString().slice(0, 10);
  return { since: s, until: s, dateMode: "today" };
}

function getRecommendation(item: DeadStockTileItem): {
  action: "move" | "writeoff" | "promo" | "keep";
  text: string; color: string;
} {
  if (item.daysWithoutSales >= 999) return { action: "writeoff", text: "Никогда не продавался", color: "border-l-red-500 bg-red-50 dark:bg-red-950/30" };
  if (item.daysWithoutSales >= 365) return { action: "writeoff", text: "Год без продаж — списать", color: "border-l-red-500 bg-red-50 dark:bg-red-950/30" };
  if (item.daysWithoutSales >= 180) return { action: "writeoff", text: "Полгода без продаж", color: "border-l-red-400 bg-red-50/50 dark:bg-red-950/20" };
  if (item.daysWithoutSales >= 90) return { action: "promo", text: "3 мес. — нужна акция", color: "border-l-amber-500 bg-amber-50 dark:bg-amber-950/30" };
  if (item.daysWithoutSales >= 30) return { action: "promo", text: "Месяц без продаж", color: "border-l-amber-400 bg-amber-50/50 dark:bg-amber-950/20" };
  return { action: "keep", text: "Под наблюдением", color: "border-l-blue-400 bg-blue-50/50 dark:bg-blue-950/20" };
}

function getDaysBadge(days: number): { label: string; cls: string } {
  if (days >= 999) return { label: "∞", cls: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" };
  if (days >= 365) return { label: ">1г", cls: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" };
  if (days >= 180) return { label: `${days}д`, cls: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400" };
  if (days >= 90) return { label: `${days}д`, cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" };
  if (days >= 30) return { label: `${days}д`, cls: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" };
  return { label: `${days}д`, cls: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" };
}

function downloadActionsXlsx(actions: PlannedAction[]) {
  const BOM = "\uFEFF";
  const header = "Товар;Артикул;Действие;Количество;Магазин;Куда;Причина";
  const actionLabels: Record<string, string> = {
    move: "Переместить", writeoff: "Списать", promo: "Промо", keep: "Оставить",
  };
  const rows = actions.map(a => {
    const targets = a.targetShops?.map(t => `${t.shopName}:${t.qty}`).join(" | ") || "";
    return [a.name, a.article, actionLabels[a.action] || a.action,
      String(a.quantity), a.shopName, targets, a.reason || ""]
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(";");
  });
  const summary = [
    "", `"Дата: ${new Date().toISOString().slice(0, 10)}";;;;;;`,
    `"Всего: ${actions.length} товаров";;;;;;`,
  ];
  const csv = BOM + [header, ...rows, ...summary].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dead-stock-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main ─────────────────────────────────────────────────────────────

export default function DeadSt() {
  useTelegramBackButton();

  const [shopOptions, setShopOptions] = useState<Record<string, string>>({});
  const [selectedShops, setSelectedShops] = useState<string[]>([]);
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [plannedActions, setPlannedActions] = useState<PlannedAction[]>([]);
  const [isLoadingShops, setIsLoadingShops] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dateFilter, setDateFilter] = useState<DateFilterValue>(getTodayRange);
  const [selectedTile, setSelectedTile] = useState<DeadStockTileItem | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    critical: true, warning: true, attention: false,
  });

  const isMiniApp = isTelegramMiniApp();
  const { data: meData } = useMe();
  const userId = meData?.id?.toString() || "";

  // ── Fetch shops ─────────────────────────────────────────────────────

  useEffect(() => {
    const fetchShops = async () => {
      setIsLoadingShops(true);
      try {
        const res = await client.api.evotor.shops.$post({ json: { userId } });
        if (!res.ok) throw new Error(`Ошибка ${res.status}`);
        const data = await res.json() as { shopOptions: Record<string, string> };
        setShopOptions(data.shopOptions);
        const firstUuid = Object.keys(data.shopOptions)[0] ?? null;
        if (firstUuid) fetchGroups(firstUuid);
      } catch (err) {
        setError("Не удалось загрузить магазины");
      } finally { setIsLoadingShops(false); }
    };
    if (userId) fetchShops();
  }, [userId]);

  // ── Fetch groups ─────────────────────────────────────────────────────

  const fetchGroups = async (shopUuid: string | null) => {
    const targetUuid = shopUuid ?? Object.keys(shopOptions)[0] ?? null;
    if (!targetUuid) { setGroupOptions([]); setSelectedGroups([]); return; }
    setIsLoadingGroups(true);
    try {
      const res = await client.api.evotor["groups-by-shop"].$post({
        json: { shopUuid: targetUuid },
      });
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      const data = await res.json() as { groups: GroupOption[] } | { code: string; message: string };
      if ("groups" in data) setGroupOptions(data.groups || []);
      setSelectedGroups([]);
    } catch { /* silent */ }
    finally { setIsLoadingGroups(false); }
  };

  // ── Submit ───────────────────────────────────────────────────────────

  const isFormValid = !!dateFilter.since && !!dateFilter.until;

  const submitForecast = useCallback(async () => {
    if (!isFormValid) return;
    setIsLoadingReport(true);
    setError(null);
    try {
      const res = await client.api["dead-stocks"].data.$post({
        json: {
          startDate: dateFilter.since,
          endDate: dateFilter.until,
          shopIds: selectedShops.length === 0 ? null : selectedShops,
          groups: selectedGroups,
        },
      });
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      const result = await res.json();
      if ("salesData" in result) {
        setReportData(result as ReportData);
      } else {
        setError("Не удалось получить данные");
      }
    } catch (err) {
      setError("Не удалось получить отчёт");
    } finally { setIsLoadingReport(false); }
  }, [dateFilter, selectedShops, selectedGroups, isFormValid]);

  // ── Grid data ────────────────────────────────────────────────────────

  const gridData: DeadStockTileItem[] = useMemo(() => {
    if (!reportData) return [];
    return reportData.salesData.map(item => ({
      itemId: item.itemId, name: item.name, article: item.article,
      quantity: item.quantity, sold: item.sold,
      lastSaleDate: item.lastSaleDate, daysWithoutSales: item.daysWithoutSales,
      shopId: item.shopId, shopName: item.shopName,
    }));
  }, [reportData]);

  const plannedMap = useMemo(
    () => new Map(plannedActions.map(a => [`${a.itemId}|${a.shopId}`, a])),
    [plannedActions],
  );

  const sections = useMemo(() => {
    const critical = gridData.filter(i => i.daysWithoutSales >= 180);
    const warning = gridData.filter(i => i.daysWithoutSales >= 30 && i.daysWithoutSales < 180);
    const attention = gridData.filter(i => i.daysWithoutSales < 30);
    return [
      { key: "critical", label: "Критичные", items: critical, show: critical.length > 0 },
      { key: "warning", label: "Внимание", items: warning, show: warning.length > 0 },
      { key: "attention", label: "Наблюдение", items: attention, show: attention.length > 0 },
    ].filter(s => s.show);
  }, [gridData]);

  // ── Render: loading ──────────────────────────────────────────────────

  if (isLoadingReport) return <LoadingState />;
  if (error && !reportData) return <ErrorState error={error} onRetry={submitForecast} />;

  // ── Render: filters ──────────────────────────────────────────────────

  if (!reportData) {
    return (
      <div className="app-page min-h-screen bg-background">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3 app-safe-top">
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Мёртвые остатки
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Товары без продаж за выбранный период
          </p>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <DateFilter value={dateFilter} onChange={setDateFilter} />

            {Object.keys(shopOptions).length > 0 && (
              <ShopFilter
                shops={shopOptions}
                selectedIds={selectedShops}
                onChange={(ids) => {
                  setSelectedShops(ids);
                  fetchGroups(ids.length === 0 ? null : ids[0]);
                }}
                isLoading={isLoadingShops}
              />
            )}

            {groupOptions.length > 0 && (
              <GroupSelector
                groupOptions={groupOptions}
                selectedGroups={selectedGroups}
                setSelectedGroups={setSelectedGroups}
                isLoadingGroups={isLoadingGroups}
              />
            )}

            <button
              onClick={submitForecast}
              disabled={!isFormValid}
              className={`w-full py-3 rounded-xl font-medium text-sm transition ${
                isFormValid
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              Сформировать отчёт
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: report ───────────────────────────────────────────────────

  const totalItems = gridData.length;
  const criticalCount = gridData.filter(i => i.daysWithoutSales >= 180).length;

  return (
    <div className="app-page min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3 app-safe-top">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              Мёртвые остатки
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {dateFilter.since === dateFilter.until ? dateFilter.since : `${dateFilter.since} → ${dateFilter.until}`}
              {" · "}{totalItems} товаров{criticalCount > 0 && ` · ${criticalCount} критичных`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {plannedActions.length > 0 && (
              <button
                onClick={() => downloadActionsXlsx(plannedActions)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition"
              >
                <FileDown className="w-3.5 h-3.5" />
                Документ ({plannedActions.length})
              </button>
            )}
            <button
              onClick={() => { setReportData(null); setPlannedActions([]); }}
              className="rounded-lg px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition"
            >
              Фильтры
            </button>
          </div>
        </div>
        <div className="mt-2 flex gap-3 text-xs">
          <span className="text-red-500 font-semibold">{criticalCount} критичных</span>
          <span className="text-muted-foreground">{totalItems - criticalCount} остальных</span>
          {plannedActions.length > 0 && (
            <span className="text-green-600 font-semibold">{plannedActions.length} запланировано</span>
          )}
        </div>
      </div>

      {/* Grid tiles */}
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {sections.map(section => (
          <div key={section.key}>
            <button
              onClick={() => setExpandedSections(prev => ({
                ...prev, [section.key]: !prev[section.key],
              }))}
              className="w-full flex items-center gap-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              {expandedSections[section.key]
                ? <ChevronDown className="w-3.5 h-3.5" />
                : <ChevronUp className="w-3.5 h-3.5 rotate-90" />}
              {section.label} · {section.items.length}
            </button>

            <AnimatePresence>
              {expandedSections[section.key] && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="space-y-1.5 overflow-hidden"
                >
                  {section.items.map((item) => {
                    const planned = plannedMap.get(`${item.itemId}|${item.shopId}`);
                    const rec = getRecommendation(item);
                    const badge = getDaysBadge(item.daysWithoutSales);

                    return (
                      <motion.button
                        key={`${item.itemId}|${item.shopId}`}
                        onClick={() => setSelectedTile(item)}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`w-full text-left rounded-lg border border-l-4 ${rec.color} bg-card hover:shadow-sm transition-shadow overflow-hidden`}
                      >
                        <div className="px-3 py-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-medium text-foreground truncate leading-tight">
                                {item.name}
                              </p>
                              {item.article && (
                                <p className="text-[10px] text-muted-foreground mt-0.5 font-mono truncate">
                                  {item.article}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badge.cls}`}>
                                {badge.label}
                              </span>
                              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground rotate-[270deg]" />
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 text-[11px]">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Package className="w-3 h-3" />
                              {item.quantity} шт.
                            </span>
                            <span className="text-muted-foreground/50">·</span>
                            <span className="text-muted-foreground truncate">{item.shopName}</span>
                            <span className="text-muted-foreground/50">·</span>
                            <span className={`truncate ${
                              planned ? "text-green-600 font-medium" :
                              rec.action === "writeoff" ? "text-red-600" :
                              rec.action === "promo" ? "text-amber-600" : "text-blue-600"
                            }`}>
                              {planned ? "✓ Запланировано" : rec.text}
                            </span>
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}

        {gridData.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Нет мёртвых остатков за выбранный период
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedTile && (
          <DeadStockDetailModal
            item={selectedTile}
            onClose={() => setSelectedTile(null)}
            onAction={(action) => {
              setPlannedActions(prev => {
                const key = `${action.itemId}|${action.shopId}`;
                const filtered = prev.filter(a => `${a.itemId}|${a.shopId}` !== key);
                return [...filtered, action];
              });
              setSelectedTile(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
