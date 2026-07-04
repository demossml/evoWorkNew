/**
 * @deprecated Используйте features/plan/planService.ts и usePlanData().
 * Этот файл сохранён для обратной совместимости с DailyBriefing и Topbar.
 * Вся новая бизнес-логика — в planService.ts.
 */
export interface PlanInfo {
  datePlan: number;
  dataSales: number;
  dataQuantity?: Record<string, number | string>;
}

export type PlanCard = {
  shopName: string;
  plan: number;
  sales: number;
  progress: number;
  difference: number;
  isPlanMet: boolean | null;
  remainingToPlan: number;
  statusColor: string;
  statusText: string;
  planQuantityArray: Array<{ productName: string; quantity: number | string }>;
};

export const formatPlanAmount = (amount: number): string =>
  new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);

export const calculatePlanProgress = (actual: number, plan: number): number => {
  if (plan === 0) return 0;
  return (actual / plan) * 100;
};

export function getRenderShopNames(
  shopNames: string[],
  planData: Record<string, PlanInfo>,
) {
  if (shopNames.length > 0) return shopNames;
  return Object.keys(planData);
}

export function buildSellerByShop(
  workingByShopsData:
    | {
        byShop?: Record<string, { employeeName?: string | null }>;
      }
    | undefined,
) {
  const byShop = workingByShopsData?.byShop;
  if (!byShop) return {} as Record<string, string | null>;
  const result: Record<string, string | null> = {};
  for (const [shopName, data] of Object.entries(byShop)) {
    result[shopName] = data.employeeName || null;
  }
  return result;
}

export function buildPlanCards(
  renderShopNames: string[],
  planData: Record<string, PlanInfo>,
): PlanCard[] {
  return renderShopNames.map((shopName) => {
    const planInfo = planData[shopName];
    const plan = planInfo?.datePlan || 0;
    const sales = planInfo?.dataSales || 0;
    const planQuantity = planInfo?.dataQuantity ?? null;
    const progress = calculatePlanProgress(sales, plan);
    const difference = sales - plan;
    const isPlanMet = plan > 0 ? sales >= plan : null;
    const remainingToPlan = plan > sales ? plan - sales : 0;

    let statusColor = "gray";
    let statusText = "Нет плана";
    if (plan > 0) {
      if (isPlanMet) {
        statusColor = "green";
        statusText = "Выполнен";
      } else if (progress >= 70) {
        statusColor = "yellow";
        statusText = "Риск";
      } else {
        statusColor = "red";
        statusText = "Критично";
      }
    }

    const planQuantityArray = planQuantity
      ? Object.entries(planQuantity).map(([productName, quantity]) => ({
          productName,
          quantity,
        }))
      : [];

    return {
      shopName,
      plan,
      sales,
      progress,
      difference,
      isPlanMet,
      remainingToPlan,
      statusColor,
      statusText,
      planQuantityArray,
    };
  });
}
