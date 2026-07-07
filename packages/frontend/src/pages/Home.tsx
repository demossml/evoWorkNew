import { ErrorState } from "@shared/ui/states";
import { ErrorBoundary } from "@shared/ui/states/ErrorBoundary";
import { RegisterUserCard } from "@features/employees";
import { useEmployeeRole } from "../hooks/useApi";
import { useIsFetching } from "@tanstack/react-query";
import {
  PlanStatusWidget,
  QuickActionsWidget,
  TodayAlertsWidget,
  StockHealthWidget,
} from "@widgets/home";
import { SellerDNAWidget } from "@widgets/sellers";
import { buildHomeAccessModel } from "@features/dashboard/model/homePageModel";
import { SellerPerformanceWidget } from "@widgets/home/SellerPerformanceWidget";
import { DailyBriefing } from "@widgets/home/DailyBriefing";
import { DateFilter, type DateFilterValue } from "@widgets/home/DateFilter";
import { RevenueWidget } from "@widgets/home/RevenueWidget";
import { SalesTempoWidget } from "@widgets/home/SalesTempoWidget";
import { FinanceWidget } from "@widgets/home/FinanceWidget";
import { BestShopWidget } from "@widgets/home/BestShopWidget";
import { TopProductWidget } from "@widgets/home/TopProductWidget";
import { AccessoriesWidget } from "@widgets/home/AccessoriesWidget";
import { isTelegramMiniApp } from "../helpers/telegram";
import { useState, useEffect, useCallback } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

type WidgetKey = "revenue" | "tempo" | "finance" | "best" | "products" | "accessories";

function getTodayRange(): DateFilterValue {
  const d = new Date();
  const s = d.toISOString().slice(0, 10);
  return { since: s, until: s, dateMode: "today" };
}

export default function Home() {
  const { data, error, isLoading } = useEmployeeRole();
  const miniApp = isTelegramMiniApp();
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(getTodayRange);
  const [expanded, setExpanded] = useState<WidgetKey | null>(null);
  const queryClient = useQueryClient();

  const toggle = useCallback((key: WidgetKey) => {
    setExpanded((prev) => (prev === key ? null : key));
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center w-full min-h-screen bg-background pt-20 sm:pt-24 px-4 sm:px-6 pb-24">
        <div className="w-full max-w-7xl space-y-4">
          <SkeletonHome />
        </div>
      </div>
    );
  }

  // Auth error (401) or no role → show login form
  if (error || !data?.employeeRole || data.employeeRole === "null") {
    // Always show manual login when unauthenticated — even in Telegram
    // context, because initData may be from a different bot than the one
    // configured for backend validation.
    const shouldShowManualIdInput = true;
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 sm:p-6">
        <h1 className="mb-4 text-lg sm:text-xl md:text-2xl text-foreground font-bold">
          {shouldShowManualIdInput ? "Введите Telegram ID для входа" : "У вас нет прав доступа."}
        </h1>
        {shouldShowManualIdInput && <RegisterUserCard onRegister={(id) => console.log("Новый пользователь Telegram ID:", id)} />}
      </div>
    );
  }

  const { isCashier, isAdmin, isSuperAdmin } = buildHomeAccessModel(data.employeeRole);
  const { since, until, dateMode } = dateFilter;

  const isExpanded = (key: WidgetKey) => expanded === key;

  return (
    <div className="flex flex-col items-center w-full min-h-screen bg-background pt-20 sm:pt-24 px-4 sm:px-6 pb-24">
      <HomeTopBar queryClient={queryClient} />
      <div className="w-full max-w-7xl space-y-4">

        <ErrorBoundary variant="widget" name="Ежедневный брифинг">
          <DailyBriefing />
        </ErrorBoundary>
        {isSuperAdmin && (
          <ErrorBoundary variant="widget" name="Продавцы дня">
            <SellerPerformanceWidget />
          </ErrorBoundary>
        )}
        <DateFilter value={dateFilter} onChange={setDateFilter} />
        <ErrorBoundary variant="widget" name="План по магазинам">
          <PlanStatusWidget date={since} />
        </ErrorBoundary>

        <div className="grid grid-cols-2 gap-4">
          <div className={isExpanded("revenue") ? "col-span-2" : ""}>
            <ErrorBoundary variant="widget" name="Выручка">
              <RevenueWidget since={since} until={until} expanded={isExpanded("revenue")} onToggle={() => toggle("revenue")} />
            </ErrorBoundary>
          </div>

          {(isSuperAdmin || isAdmin) && (
            <div className={isExpanded("tempo") ? "col-span-2" : ""}>
              <ErrorBoundary variant="widget" name="Темп продаж">
                <SalesTempoWidget since={since} until={until} expanded={isExpanded("tempo")} onToggle={() => toggle("tempo")} />
              </ErrorBoundary>
            </div>
          )}

          {(isSuperAdmin || isAdmin) && (
            <div className={isExpanded("finance") ? "col-span-2" : ""}>
              <ErrorBoundary variant="widget" name="Финансы">
                <FinanceWidget since={since} until={until} expanded={isExpanded("finance")} onToggle={() => toggle("finance")} />
              </ErrorBoundary>
            </div>
          )}

          {(isSuperAdmin || isAdmin) && (
            <div className={isExpanded("best") ? "col-span-2" : ""}>
              <ErrorBoundary variant="widget" name="Лучший магазин">
                <BestShopWidget since={since} until={until} dateMode={dateMode} expanded={isExpanded("best")} onToggle={() => toggle("best")} />
              </ErrorBoundary>
            </div>
          )}

          <div className={isExpanded("products") ? "col-span-2" : ""}>
            <ErrorBoundary variant="widget" name="Топ продуктов">
              <TopProductWidget since={since} until={until} expanded={isExpanded("products")} onToggle={() => toggle("products")} />
            </ErrorBoundary>
          </div>

          <div className={isExpanded("accessories") ? "col-span-2" : ""}>
            <ErrorBoundary variant="widget" name="Аксессуары">
              <AccessoriesWidget since={since} until={until} expanded={isExpanded("accessories")} onToggle={() => toggle("accessories")} />
            </ErrorBoundary>
          </div>
        </div>

        {isSuperAdmin && (
          <ErrorBoundary variant="widget" name="Алерты">
            <TodayAlertsWidget />
          </ErrorBoundary>
        )}
        {(isSuperAdmin || isAdmin) && (
          <ErrorBoundary variant="widget" name="Состояние склада">
            <StockHealthWidget />
          </ErrorBoundary>
        )}
        {(isSuperAdmin || isAdmin) && (
          <ErrorBoundary variant="widget" name="Seller DNA">
            <SellerDNAWidget dateFilter={dateFilter} />
          </ErrorBoundary>
        )}
        <ErrorBoundary variant="widget" name="Быстрые действия">
          <QuickActionsWidget employeeRole={data.employeeRole} />
        </ErrorBoundary>
        <LastUpdated />
      </div>
    </div>
  );
}

function LastUpdated() {
  const fetching = useIsFetching();
  const [lastOk, setLastOk] = useState<Date | null>(null);
  useEffect(() => { if (fetching === 0) setLastOk(new Date()); }, [fetching]);
  const timeStr = lastOk ? lastOk.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--";
  return (
    <div className="text-center mt-6 mb-2">
      <span className="text-xs text-muted-foreground">
        {fetching > 0 ? (
          <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />Обновление...</span>
        ) : `Данные от ${timeStr}`}
      </span>
    </div>
  );
}

function HomeTopBar({ queryClient }: { queryClient: QueryClient }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries();
    // Small delay so user sees the spinner
    setTimeout(() => setRefreshing(false), 600);
  }, [queryClient]);

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-card/85 backdrop-blur-sm border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">🏠 Evo App</span>
          {online ? (
            <Wifi className="w-3.5 h-3.5 text-success" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-destructive" />
          )}
        </div>
        <div className="flex items-center gap-3">
          {!online && (
            <span className="text-xs text-destructive font-medium">⚡ Офлайн</span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-muted-foreground bg-secondary rounded-md hover:bg-secondary/80 active:scale-95 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
            Обновить
          </button>
        </div>
      </div>
    </div>
  );
}

function SkeletonHome() {
  return (
    <>
      {/* DailyBriefing skeleton */}
      <div className="animate-pulse bg-primary/10 rounded-xl p-4 h-24" />
      {/* Spacer */}
      <div className="animate-pulse rounded-xl bg-card border border-border p-4 shadow-sm h-10" />
      {/* Grid of skeleton tiles */}
      <div className="grid grid-cols-2 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="animate-pulse rounded-xl bg-card border border-border p-4 shadow-sm min-h-[120px]" />
        ))}
      </div>
      {/* Bottom widgets */}
      <div className="animate-pulse rounded-xl bg-card border border-border p-4 shadow-sm h-16" />
      <div className="animate-pulse rounded-xl bg-card border border-border p-4 shadow-sm h-24" />
    </>
  );
}
