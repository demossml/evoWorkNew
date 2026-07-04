// hooks/usePlanData.ts
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { buildPlanDomainModel, type PlanDomainModel } from '@/features/plan/planService';
import { fetchPlanForToday } from '@shared/api';

/** Основной хук плана. Принимает date, передаёт в API как ?date=. */
export function usePlanData(date: string) {
  const { data: raw, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['plan', date],
    queryFn: async () => {
      // Вызываем fetchPlanForToday, но добавляем date в URL
      // (fetchPlanForToday использует hono client, обходим через fetch)
      const res = await fetch(`/api/evotor/plan-for-today?date=${date}`);
      if (!res.ok) throw new Error('Ошибка загрузки плана');
      return res.json() as Promise<{
        salesData: Record<string, { datePlan: number; dataSales: number; dataQuantity: Record<string, { qty: number; sum: number }> }>;
      }>;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const model: PlanDomainModel | null = useMemo(() => {
    if (!raw?.salesData) return null;
    return buildPlanDomainModel(raw.salesData, date);
  }, [raw, date]);

  return { data: model, isLoading, isError, error, refetch };
}

/** Ленивая загрузка плана за прошлую дату (WeekComparison). */
export function usePlanWeekAgo(date: string) {
  const prevDate = shiftDate(date, -7);
  const enabled = !!date;

  const { data: raw, isLoading } = useQuery({
    queryKey: ['plan', prevDate],
    queryFn: async () => {
      const res = await fetch(`/api/evotor/plan-for-today?date=${prevDate}`);
      if (!res.ok) return null;
      return res.json() as Promise<{
        salesData: Record<string, { datePlan: number; dataSales: number; dataQuantity: Record<string, { qty: number; sum: number }> }>;
      }>;
    },
    enabled,
    staleTime: 5 * 60_000,
  });

  const model: PlanDomainModel | null = useMemo(() => {
    if (!raw?.salesData) return null;
    return buildPlanDomainModel(raw.salesData, prevDate);
  }, [raw, prevDate]);

  return { data: model, isLoading };
}

/** Сдвиг даты на N дней. */
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00+03:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
