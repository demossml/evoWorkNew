import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WidgetErrorBoundary } from "@/widgets/home/WidgetErrorBoundary";
import type { DateFilterValue } from "@/widgets/home/DateFilter";
import type { SellerDNAProfile } from "./types";
import { SellerList } from "./SellerList";
import { SellerDetailView } from "./SellerDetailView";
import { SellerComparisonView } from "./SellerComparisonView";
import { useSellerStats } from "@/hooks/useSellerStats";
import { useSellerInsights } from "@/hooks/useSellerInsights";
import { useWeekdayCompare } from "@/hooks/useWeekdayCompare";

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
}: {
  dateFilter?: DateFilterValue;
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

  // Show only today's sellers by default, allow expanding to all
  const [showAllSellers, setShowAllSellers] = useState(false);

  // Weekday comparison mode
  const [compareMode, setCompareMode] = useState<"auto" | "weekday">("auto");
  const [compareWeekday, setCompareWeekday] = useState<number | undefined>(undefined);

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
    benchmarkWeekday,
    weekday: compareMode === "weekday" ? compareWeekday : undefined,
  });
  const { insights } = useSellerInsights(selectedSellerUuid, dateFilter.since, dateFilter.until);

  // Multi-week weekday comparison data
  const { data: weekdayCompareData } = useWeekdayCompare(
    dateFilter.since,
    4,
  );

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
