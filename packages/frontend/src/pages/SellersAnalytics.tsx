import { useState, useCallback } from "react";
import { ArrowLeft, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DateFilter, type DateFilterValue } from "@widgets/home/DateFilter";
import { SellerDNAWidget } from "@widgets/sellers";
import { ErrorBoundary } from "@shared/ui/states/ErrorBoundary";
import { useEmployeeRole } from "@/hooks/useApi";
import { buildHomeAccessModel } from "@features/dashboard/model/homePageModel";

function getLast30Days(): DateFilterValue {
  const d = new Date();
  const until = d.toISOString().slice(0, 10);
  d.setDate(d.getDate() - 30);
  const since = d.toISOString().slice(0, 10);
  return { since, until, dateMode: "today" };
}

export default function SellersAnalytics() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useEmployeeRole();
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(getLast30Days);

  // Auth guard
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-pulse text-muted-foreground">Загрузка...</div>
      </div>
    );
  }

  if (error || !data?.employeeRole || data.employeeRole === "null") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6">
        <h1 className="text-lg font-bold text-foreground mb-2">Нет доступа</h1>
        <p className="text-sm text-muted-foreground mb-4">Войдите как Admin или SuperAdmin</p>
        <button
          onClick={() => navigate("/")}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
        >
          На главную
        </button>
      </div>
    );
  }

  const { isAdmin, isSuperAdmin } = buildHomeAccessModel(data.employeeRole);

  if (!isAdmin && !isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6">
        <h1 className="text-lg font-bold text-foreground mb-2">Недостаточно прав</h1>
        <p className="text-sm text-muted-foreground mb-4">Требуется роль Admin или SuperAdmin</p>
        <button
          onClick={() => navigate("/")}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
        >
          На главную
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-card/85 backdrop-blur-md border-b border-border app-safe-top">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-1 -ml-1 rounded-lg hover:bg-muted transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </button>
            <h1 className="text-base font-bold text-foreground flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Аналитика продавцов
            </h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-3 sm:p-4 max-w-5xl mx-auto w-full pb-24 space-y-4">
        <DateFilter value={dateFilter} onChange={setDateFilter} />
        <ErrorBoundary variant="widget" name="Seller DNA">
          <SellerDNAWidget dateFilter={dateFilter} defaultShowAllSellers />
        </ErrorBoundary>
      </div>
    </div>
  );
}
