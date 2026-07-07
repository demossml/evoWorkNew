import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Store, Users } from "lucide-react";
import { WidgetErrorBoundary } from "@/widgets/home/WidgetErrorBoundary";
import type { DateFilterValue } from "@/widgets/home/DateFilter";
import type { SellerDNAProfile } from "./types";
import { SellerList } from "./SellerList";
import { SellerDetailView } from "./SellerDetailView";
import { SellerComparisonView } from "./SellerComparisonView";
import { useSellerStats } from "@/hooks/useSellerStats";
import { useSellerInsights } from "@/hooks/useSellerInsights";
import { useWeekdayCompare } from "@/hooks/useWeekdayCompare";
import { fetchStoreList } from "@shared/api";

// ===================== Tab type =====================
type Tab = "rating" | "compare" | "detail";

const TABS: { key: Tab; label: string }[] = [
  { key: "rating", label: "Рейтинг" },
  { key: "compare", label: "Сравнение" },
  { key: "detail", label: "Детали" },
];

// ===================== Skeleton =====================

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-10 bg-muted rounded-lg" />
      <div className="h-8 bg-muted rounded-lg w-48" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-muted rounded-xl" />
        ))}
      </div>
    </div>
  );
}

// ===================== Helpers =====================

function getWeekday(dateStr: string): number {
  return new Date(dateStr + "T12:00:00+03:00").getDay(); // 0=Sun..6=Sat
}

function isSingleDay(df: DateFilterValue): boolean {
  return df.since === df.until;
}

// ===================== Main widget =====================

export function SellerDNAWidget({
  dateFilter: externalDateFilter,
  shopId: externalShopId,
  sellerIds: externalSellerIds,
  defaultShowAllSellers = false,
}: {
  dateFilter?: DateFilterValue;
  shopId?: string;
  sellerIds?: string[];
  defaultShowAllSellers?: boolean;
}) {
  const [internalDateFilter, setInternalDateFilter] = useState<DateFilterValue>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return { since: `${y}-${m}-${day}`, until: `${y}-${m}-${day}`, dateMode: "today" };
  });

  const dateFilter = externalDateFilter ?? internalDateFilter;
  const setDateFilter = setInternalDateFilter;

  const [tab, setTab] = useState<Tab>("rating");
  const [selectedSellerUuid, setSelectedSellerUuid] = useState<string | null>(null);

  // Filters
  const [shopId, setShopId] = useState<string>(externalShopId ?? "all");
  const [sellerFilterIds, setSellerFilterIds] = useState<string[]>(externalSellerIds ?? []);
  // If external props are set, use them; otherwise use internal state
  const effectiveShopId = externalShopId !== undefined ? externalShopId : shopId;
  const effectiveSellerIds = externalSellerIds !== undefined ? externalSellerIds : sellerFilterIds;
  const showFilters = externalShopId === undefined; // hide filters if controlled externally

  // Store list
  const [storeList, setStoreList] = useState<{ key: string; name: string }[]>([]);
  useEffect(() => {
    fetchStoreList().then((shops) => {
      const entries = (shops ?? []).map((s) => ({ key: s.name, name: s.name }));
      setStoreList(entries);
    }).catch(() => { /* ignore */ });
  }, []);

  // Show only today's sellers by default, allow expanding to all.
  // When defaultShowAllSellers is true (e.g. on SellersAnalytics page), start with all sellers.
  const [showAllSellers, setShowAllSellers] = useState(defaultShowAllSellers);

  // Weekday comparison mode
  const [compareMode, setCompareMode] = useState<"auto" | "weekday">("auto");
  const [compareWeekday, setCompareWeekday] = useState<number | undefined>(undefined);

  // Resolve shop display name for AI context
  const shopName = useMemo(() => {
    if (effectiveShopId === "all" || !effectiveShopId) return undefined;
    return storeList.find(s => s.key === effectiveShopId)?.name ?? effectiveShopId;
  }, [effectiveShopId, storeList]);

  // Compute benchmarkWeekday for 4-week same-weekday comparison
  const benchmarkWeekday = useMemo(() => {
    if (isSingleDay(dateFilter)) {
      return getWeekday(dateFilter.since);
    }
    return undefined;
  }, [dateFilter.since, dateFilter.until]);

  // In rating tab: if showAllSellers, use full period filter; else today-only
  const effectiveDateFilter = showAllSellers
    ? dateFilter
    : { ...dateFilter, since: dateFilter.since, until: dateFilter.since };

  const { data: sellers = [] } = useSellerStats({
    dateFilter: effectiveDateFilter,
    shopId: effectiveShopId !== "all" ? effectiveShopId : undefined,
    sellerIds: effectiveSellerIds.length > 0 ? effectiveSellerIds : undefined,
    benchmarkWeekday,
    weekday: compareMode === "weekday" ? compareWeekday : undefined,
  });
  const { insights } = useSellerInsights({
    sellerId: selectedSellerUuid,
    since: dateFilter.since,
    until: dateFilter.until,
    shopId: effectiveShopId !== "all" ? effectiveShopId : undefined,
    shopName,
    compareSellerIds: effectiveSellerIds.length >= 2 ? effectiveSellerIds : undefined,
  });

  // Multi-week weekday comparison data
  const { data: weekdayCompareData } = useWeekdayCompare({
    targetDate: dateFilter.since,
    weeksBack: 4,
    shopId: effectiveShopId !== "all" ? effectiveShopId : undefined,
    compareMode: effectiveSellerIds.length >= 2 ? "same-day" : "same-weekday",
    sellerIds: effectiveSellerIds.length >= 2 ? effectiveSellerIds : undefined,
  });

  const handleSellerSelect = (seller: SellerDNAProfile) => {
    setSelectedSellerUuid(seller.uuid);
    setTab("detail");
  };

  return (
    <WidgetErrorBoundary>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">
            🧬 Seller DNA — Анализ продавцов
          </h2>
        </div>

        {/* Filters bar */}
        {showFilters && (
          <div className="flex flex-wrap gap-2 items-center">
            {/* Store dropdown */}
            <div className="flex items-center gap-1.5 bg-muted/60 rounded-lg px-2.5 py-1.5">
              <Store className="w-3.5 h-3.5 text-muted-foreground" />
              <select
                value={shopId}
                onChange={(e) => {
                  setShopId(e.target.value);
                  setSellerFilterIds([]);
                }}
                className="bg-transparent text-xs font-medium text-foreground outline-none cursor-pointer"
              >
                <option value="all">Все магазины</option>
                {storeList.map((s) => (
                  <option key={s.key} value={s.key}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Seller multi-select */}
            {sellers.length > 0 && (
              <div className="flex items-center gap-1.5 bg-muted/60 rounded-lg px-2.5 py-1.5 flex-1 min-w-0">
                <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="flex flex-wrap gap-1 items-center">
                  {/* "All" toggle */}
                  <button
                    onClick={() => setSellerFilterIds([])}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                      sellerFilterIds.length === 0
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Все
                  </button>
                  {sellers.slice(0, 12).map((s) => {
                    const isSelected = sellerFilterIds.includes(s.uuid);
                    return (
                      <button
                        key={s.uuid}
                        onClick={() => {
                          setSellerFilterIds((prev) =>
                            prev.includes(s.uuid)
                              ? prev.filter((id) => id !== s.uuid)
                              : [...prev, s.uuid],
                          );
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition whitespace-nowrap ${
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {s.name.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${
                tab === t.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            {tab === "rating" && (
              <SellerList
                sellers={sellers}
                onSellerSelect={handleSellerSelect}
                dateFilter={dateFilter}
                onDateFilterChange={setDateFilter}
                showAllSellers={showAllSellers}
                onToggleShowAll={() => setShowAllSellers(!showAllSellers)}
                showDateFilter={!externalDateFilter}
              />
            )}
            {tab === "compare" && (
              <SellerComparisonView
                allSellers={sellers}
                weekdayCompare={weekdayCompareData}
                onBack={() => setTab("rating")}
                compareMode={compareMode}
                onCompareModeChange={setCompareMode}
                compareWeekday={compareWeekday}
                onCompareWeekdayChange={setCompareWeekday}
              />
            )}
            {tab === "detail" && (
              <SellerDetailView
                seller={sellers.find((s) => s.uuid === selectedSellerUuid) ?? null}
                onBack={() => setTab("rating")}
                onCompare={() => setTab("compare")}
                insights={insights}
                useBenchmark={benchmarkWeekday !== undefined}
                dateFilter={dateFilter}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </WidgetErrorBoundary>
  );
}

export default SellerDNAWidget;
