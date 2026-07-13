import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router";
import { useDataSourceStore } from "@shared/model/dataSourceStore";

const Settings = lazy(() => import("@/pages/reports/Settings"));
const Home = lazy(() => import("@/pages/Home"));

const SalesReport = lazy(() => import("@/pages/reports/SaleReport"));
const SalaryReports = lazy(() => import("@/pages/reports/SalaryReport"));
const SalestReportForThePeriod = lazy(() => import("@/pages/reports/SalestReportForThePeriod"));
const Orders = lazy(() => import("@/pages/reports/Orders"));
const QuantityTableProps = lazy(() => import("@/pages/reports/QuantityTable"));
const StoreOpeningReport = lazy(() => import("@/pages/reports/StoreOpeningReport"));
const ProfitReportPage = lazy(() => import("@/pages/reports/ProfitReportPage"));
const StaffRatingsReport = lazy(() => import("@/pages/reports/StaffRatingsReport"));
const SalesTodayReport = lazy(() => import("@/pages/reports/SalesTodayReport"));
const SchedulesReport = lazy(() => import("@/pages/reports/SchedulesReport"));
const StoreOpeningPage = lazy(() => import("@/pages/opening/StoreOpeningPage"));
const DeadStocks = lazy(() => import("@/pages/deadstock/DeadStock"));
const StoreOpeningsAdminReport = lazy(() => import("@/pages/reports/StoreOpeningsAdminReport"));
const PeriodComparison = lazy(() => import("@/pages/reports/PeriodComparison"));
const SellerPerformancePage = lazy(() => import("@/pages/SellerPerformance"));
const SellersAnalytics = lazy(() => import("@/pages/SellersAnalytics"));
const ProductPerformancePage = lazy(() => import("@/pages/reports/ProductPerformance"));
const StorePerformancePage = lazy(() => import("@/pages/reports/StorePerformance"));
const AnalyticsPage = lazy(() => import("@/pages/Analytics"));
const SellerDnaPage = lazy(() => import("@/pages/SellerDna"));
const ProductAnalysisPage = lazy(() => import("@/pages/ProductAnalysis"));
const StoreAnalysisPage = lazy(() => import("@/pages/StoreAnalysis"));

export function AppRouter() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center text-gray-500">
          Загрузка экрана...
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/evotor/settings" element={<Settings />} />
        <Route path="/evotor/plan-for-today" element={<Navigate to="/" replace />} />
        <Route path="/evotor/sales-report" element={<SalesReport />} />
        <Route path="/evotor/salary-report" element={<SalaryReports />} />
        <Route path="/evotor/sales-for-the-period" element={<SalestReportForThePeriod />} />
        <Route path="/evotor/orders" element={<Orders />} />
        <Route path="/evotor/stock-realization-report" element={<QuantityTableProps />} />
        <Route path="/evotor/store-opening-report" element={<StoreOpeningReport />} />
        <Route path="/evotor/store-openings-admin" element={<StoreOpeningsAdminReport />} />
        <Route path="/evotor/profit" element={<ProfitReportPage />} />
        <Route path="/evotor/staff-analysis" element={<StaffRatingsReport />} />
        <Route path="/evotor/salary-user-report" element={<Navigate to="/evotor/salary-report" replace />} />
        <Route path="/evotor/sales-today" element={<SalesTodayReport />} />
        <Route path="/evotor/schedules" element={<SchedulesReport />} />
        <Route path="/evotor/open-store" element={<StoreOpeningPage />} />
        <Route path="/evotor/dead-stock" element={<DeadStocks />} />
        <Route path="/evotor/period-comparison" element={<PeriodComparison />} />
        <Route path="/evotor/seller-performance" element={<Navigate to="/evotor/seller-dna" replace />} />
        <Route path="/evotor/sellers-analytics" element={<SellersAnalytics />} />
        <Route path="/evotor/product-performance" element={<Navigate to="/evotor/product-analysis" replace />} />
        <Route path="/evotor/store-performance" element={<Navigate to="/evotor/store-analysis" replace />} />
        <Route path="/evotor/seller-dna" element={<SellerDnaPage />} />
        <Route path="/evotor/product-analysis" element={<ProductAnalysisPage />} />
        <Route path="/evotor/store-analysis" element={<StoreAnalysisPage />} />
        <Route path="/evotor/analytics" element={<AnalyticsPage />} />
      </Routes>
    </Suspense>
  );
}
