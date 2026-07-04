import { useQuery } from "@tanstack/react-query";
import {
  fetchReportAndPlanForToday,
  queryKeys,
} from "@shared/api";

export const useGetReportAndPlan = (enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.reports.reportAndPlanToday(),
    queryFn: fetchReportAndPlanForToday,
    enabled,
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
    retry: 2,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
