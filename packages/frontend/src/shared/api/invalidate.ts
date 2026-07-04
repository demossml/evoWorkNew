import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";

export async function invalidateDashboardQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.reports.reportAndPlanToday() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.evotor.workingByShops() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.stores.shops() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.stores.shopNames() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.alerts.todayFinancial() }),
  ]);
}

export async function invalidateScheduleQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.evotor.workingByShops() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.stores.shops() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.stores.shopNames() }),
  ]);
}

export async function invalidateUserQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.employee.me() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.employee.role() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.employee.uuidAndName() }),
  ]);
}
