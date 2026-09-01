import { ErrorState } from "@shared/ui/states";
import { ErrorBoundary } from "@shared/ui/states/ErrorBoundary";
import { RegisterUserCard } from "@features/employees";
import { useEmployeeRole } from "../hooks/useApi";
import { useFeaturePermissions } from "../hooks/useFeaturePermissions";
import { useProductProfile } from "../hooks/useProductProfile";
import { useIsFetching, useQuery } from "@tanstack/react-query";
import {
  PlanStatusWidget,
  QuickActionsWidget,
  TodayAlertsWidget,
  StockHealthWidget,
  SyncStatusWidget,
} from "@widgets/home";
import { buildHomeAccessModel } from "@features/dashboard/model/homePageModel";
import { DailyBriefing } from "@widgets/home/DailyBriefing";
import { DateFilter, type DateFilterValue } from "@widgets/home/DateFilter";
import { ShareReportButton } from "@shared/ui";
import { RevenueWidget } from "@widgets/home/RevenueWidget";
import { SalesTempoWidget } from "@widgets/home/SalesTempoWidget";
import { FinanceWidget } from "@widgets/home/FinanceWidget";
import { BestShopWidget } from "@widgets/home/BestShopWidget";
import { TopProductWidget } from "@widgets/home/TopProductWidget";
import { HighMarginProductsWidget } from "@widgets/home/HighMarginProductsWidget";
import { PromoEarningsWidget } from "@widgets/home/PromoEarningsWidget";
import { FocusCategoryWidget } from "@widgets/home/FocusCategoryWidget";
import { isTelegramMiniApp } from "../helpers/telegram";
import { useState, useEffect, useCallback } from "react";
import { Wifi, WifiOff, RefreshCw, LogOut } from "lucide-react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getAuthHeaders } from "@shared/api";
import { AuthCard } from "../components/AuthCard";

type WidgetKey = "revenue" | "tempo" | "finance" | "best" | "products" | "accessories" | "sync";

function getTodayRange(): DateFilterValue {
  const d = new Date();
  const s = d.toISOString().slice(0, 10);
  return { since: s, until: s, dateMode: "today" };
}

export default function Home() {
  const { data, error, isPending } = useEmployeeRole();
  const { can } = useFeaturePermissions();
  const { isUniversal } = useProductProfile();
  const miniApp = isTelegramMiniApp();
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(getTodayRange);
  const [expanded, setExpanded] = useState<WidgetKey | null>(null);
  const queryClient = useQueryClient();
  const isFetching = useIsFetching() > 0;

  const toggle = useCallback((key: WidgetKey) => {
    setExpanded((prev) => (prev === key ? null : key));
  }, []);

  // Полный skeleton только когда ещё нет данных (в т.ч. из persist).
  // При наличии кэша — сразу рисуем UI, фоновый refetch обновит на месте.
  if (isPending && !data) {
    return (
      <div className="flex flex-col items-center w-full min-h-screen bg-background pt-[calc(var(--tg-app-top-offset,var(--tg-safe-top,0px))+3.5rem)] px-4 sm:px-6 pb-24">
        <div className="w-full max-w-7xl space-y-4">
          <SkeletonHome />
        </div>
      </div>
    );
  }

  // Auth error (401) or no role → show login form
  if (error || !data?.employeeRole || data.employeeRole === "null") {
    // Вход доступен двумя путями: login/password (новый) и legacy Telegram ID.
    // Telegram-контекст может давать initData другого бота, поэтому форма входа
    // показывается всегда, когда роли нет.
    const shouldShowManualIdInput = true;
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 sm:p-6 space-y-4">
        <AuthCard />
        {shouldShowManualIdInput && (
          <>
            <div className="flex items-center gap-3 w-full max-w-sm text-[11px] text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              или legacy
              <span className="h-px flex-1 bg-border" />
            </div>
            <RegisterUserCard onRegister={(id) => console.log("Новый пользователь Telegram ID:", id)} />
          </>
        )}
      </div>
    );
  }

  const { isCashier, isAdmin, isSuperAdmin } = buildHomeAccessModel(data.employeeRole);
  const { since, until, dateMode } = dateFilter;

  const isExpanded = (key: WidgetKey) => expanded === key;

  return (
    <div className="flex flex-col items-center w-full min-h-screen bg-background pt-[calc(var(--tg-app-top-offset,var(--tg-safe-top,0px))+3.5rem)] px-4 sm:px-6 pb-24">
      <HomeTopBar queryClient={queryClient} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} />
      <div className="w-full max-w-7xl space-y-4">
        {isFetching && (
          <p className="text-[10px] text-muted-foreground text-center -mb-1">Обновление…</p>
        )}

        <ErrorBoundary variant="widget" name="Ежедневный брифинг">
          <DailyBriefing />
        </ErrorBoundary>
        {isUniversal && (
          <p className="text-[10px] text-muted-foreground px-1 -mt-1">
            Режим: универсальная розница
          </p>
        )}

        <ErrorBoundary variant="widget" name="Фокус">
          {can("home.focus") && <FocusCategoryWidget />}
        </ErrorBoundary>
        <div className="flex items-center gap-2">
          <DateFilter value={dateFilter} onChange={setDateFilter} />
          <ShareReportButton since={since} until={until} reportType="revenue" />
        </div>
        {!isUniversal && can("home.plan") && (
          <ErrorBoundary variant="widget" name="План по магазинам">
            <PlanStatusWidget date={since} />
          </ErrorBoundary>
        )}

        {can("home.sync_status") && (
          <ErrorBoundary variant="widget" name="Синхронизация">
            <SyncStatusWidget
              expanded={isExpanded("sync")}
              onToggle={() => toggle("sync")}
            />
          </ErrorBoundary>
        )}

        {can("home.promo") && (
          <ErrorBoundary variant="widget" name="Акционные товары">
            <PromoEarningsWidget />
          </ErrorBoundary>
        )}

        <div className="grid grid-cols-2 gap-4">
          {can("home.revenue") && (
            <div className={isExpanded("revenue") ? "col-span-2" : ""}>
              <ErrorBoundary variant="widget" name="Выручка">
                <RevenueWidget since={since} until={until} expanded={isExpanded("revenue")} onToggle={() => toggle("revenue")} />
              </ErrorBoundary>
            </div>
          )}

          {can("home.tempo") && (
            <div className={isExpanded("tempo") ? "col-span-2" : ""}>
              <ErrorBoundary variant="widget" name="Темп продаж">
                <SalesTempoWidget since={since} until={until} expanded={isExpanded("tempo")} onToggle={() => toggle("tempo")} />
              </ErrorBoundary>
            </div>
          )}

          {can("home.finance") && (
            <div className={isExpanded("finance") ? "col-span-2" : ""}>
              <ErrorBoundary variant="widget" name="Финансы">
                <FinanceWidget since={since} until={until} expanded={isExpanded("finance")} onToggle={() => toggle("finance")} />
              </ErrorBoundary>
            </div>
          )}

          {can("home.best_shop") && (
            <div className={isExpanded("best") ? "col-span-2" : ""}>
            <ErrorBoundary variant="widget" name="Эффективность">
                <BestShopWidget since={since} until={until} dateMode={dateMode} expanded={isExpanded("best")} onToggle={() => toggle("best")} />
              </ErrorBoundary>
            </div>
          )}

          {can("home.top_products") && (
            <div className={isExpanded("products") ? "col-span-2" : ""}>
              <ErrorBoundary variant="widget" name="Топ продуктов">
                <TopProductWidget since={since} until={until} expanded={isExpanded("products")} onToggle={() => toggle("products")} />
              </ErrorBoundary>
            </div>
          )}

          {can(isUniversal ? "home.high_margin" : "home.accessories") && (
            <div className={isExpanded("accessories") ? "col-span-2" : ""}>
              <ErrorBoundary variant="widget" name="Высокомаржинальные товары">
                <HighMarginProductsWidget since={since} until={until} expanded={isExpanded("accessories")} onToggle={() => toggle("accessories")} />
              </ErrorBoundary>
            </div>
          )}
        </div>

        {can("home.alerts") && (
          <ErrorBoundary variant="widget" name="Алерты">
            <TodayAlertsWidget />
          </ErrorBoundary>
        )}
        {can("home.stock") && (
          <ErrorBoundary variant="widget" name="Состояние склада">
            <StockHealthWidget />
          </ErrorBoundary>
        )}
        {can("home.quick_actions") && (
          <ErrorBoundary variant="widget" name="Быстрые действия">
            <QuickActionsWidget employeeRole={data.employeeRole} />
          </ErrorBoundary>
        )}
        <LastUpdated />
        <SyncStatusLine />
      </div>
    </div>
  );
}

/**
 * Одна muted-строка статуса синхронизации (read-only, /api/sync/status).
 * Если API недоступен — блок просто не показывается (home не ломается).
 */
function SyncStatusLine() {
  const { data } = useQuery<{
    states?: { resource: string; last_success_at: string | null; status: string | null }[];
  }>({
    queryKey: ["sync-status-line"],
    queryFn: async () => {
      const res = await fetch("/api/sync/status");
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  });

  const states = data?.states ?? [];
  if (states.length === 0) return null;

  const hasError = states.some((s) => s.status === "error");
  const lastOk = states
    .map((s) => s.last_success_at)
    .filter(Boolean)
    .sort()
    .pop();

  if (hasError) {
    return (
      <div className="text-center mt-1">
        <span className="text-xs text-destructive">Синхронизация: ошибка</span>
      </div>
    );
  }

  if (lastOk) {
    const t = new Date(lastOk.includes(" ") ? `${lastOk.replace(" ", "T")}Z` : lastOk);
    const timeStr = Number.isNaN(t.getTime())
      ? ""
      : t.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    return (
      <div className="text-center mt-1">
        <span className="text-xs text-muted-foreground">
          Данные: обновлено {timeStr}
        </span>
      </div>
    );
  }

  return null;
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

function HomeTopBar({ queryClient, isAdmin, isSuperAdmin }: { queryClient: QueryClient; isAdmin: boolean; isSuperAdmin: boolean }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();

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

  const [loggingOut, setLoggingOut] = useState(false);
  const handleLogout = useCallback(async () => {
    if (!window.confirm("Выйти из аккаунта?")) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", headers: getAuthHeaders() });
    } catch {
      /* ignore */
    }
    localStorage.removeItem("sessionId");
    localStorage.removeItem("telegramId");
    localStorage.setItem("evo_logged_out", "1");
    try {
      queryClient.clear();
      localStorage.removeItem("evo-rq-cache-v1");
    } catch {
      /* ignore */
    }
    window.location.assign("/");
  }, [queryClient]);

  return (
    <div
      className="app-safe-top fixed top-0 left-0 right-0 z-50 bg-card/85 backdrop-blur-sm border-b border-border"
    >
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
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            title="Выйти"
            aria-label="Выйти"
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-muted-foreground bg-secondary rounded-md hover:bg-destructive/10 hover:text-destructive active:scale-95 transition-all disabled:opacity-50"
          >
            <LogOut className="w-3 h-3" />
            Выйти
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
