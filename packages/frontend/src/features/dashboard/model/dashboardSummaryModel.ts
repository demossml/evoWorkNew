import type { ShopLeaderCardData, LeaderReason } from "../../../widgets/dashboard/cards/BestShopCard";
import type { ShopKpiRow } from "../../../widgets/dashboard/cards/BestShopDetails";
import type { SalesData } from "../../../widgets/dashboard/type";
import type { AccessoriesSalesData } from "../../../hooks/dashboard/useAccessoriesSales";

export const formatDashboardMoney = (value: number) => {
  if (value == null || !Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
};

export const formatDashboardPct = (value: number | null) => {
  if (value == null || !Number.isFinite(value)) return "н/д";
  return `${(value * 100).toFixed(1)}%`;
};

export const clampRange = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const shiftIsoDate = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  date.setDate(date.getDate() + days);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const getDiffDaysInclusive = (since: string, until: string) => {
  const from = new Date(`${since}T00:00:00`);
  const to = new Date(`${until}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 1;
  const diffMs = to.getTime() - from.getTime();
  return Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1);
};

export const sumRecordValues = (record?: Record<string, number>) =>
  Object.values(record || {}).reduce((sum, value) => sum + Number(value || 0), 0);

export const buildShopKpiRows = (data: SalesData | null): ShopKpiRow[] => {
  if (!data) return [];
  return Object.entries(data.salesDataByShopName).map(([name, shop]) => {
    const refunds = sumRecordValues(shop.refund);
    const expenses = sumRecordValues(data.cashOutcomeData?.[name]);
    const netRevenue = shop.totalSell - refunds - expenses;
    const averageCheck = shop.checksCount > 0 ? shop.totalSell / shop.checksCount : 0;
    const refundRate = shop.totalSell > 0 ? (refunds / shop.totalSell) * 100 : 0;
    return {
      name,
      revenue: shop.totalSell,
      averageCheck,
      refunds,
      expenses,
      netRevenue,
      checks: shop.checksCount,
      refundRate,
    };
  });
};

export const getLeaderReason = (leader: ShopKpiRow, rows: ShopKpiRow[]): LeaderReason => {
  if (rows.length === 0) return "чек";
  const avgCheck =
    rows.reduce((sum, item) => sum + item.averageCheck, 0) / Math.max(1, rows.length);
  const avgTraffic =
    rows.reduce((sum, item) => sum + item.checks, 0) / Math.max(1, rows.length);
  const avgRefundRate =
    rows.reduce((sum, item) => sum + item.refundRate, 0) / Math.max(1, rows.length);

  const checkScore = avgCheck > 0 ? leader.averageCheck / avgCheck : 0;
  const trafficScore = avgTraffic > 0 ? leader.checks / avgTraffic : 0;
  const conversionScore =
    avgRefundRate > 0 ? (avgRefundRate - leader.refundRate) / avgRefundRate + 1 : 1;

  if (checkScore >= trafficScore && checkScore >= conversionScore) return "чек";
  if (trafficScore >= checkScore && trafficScore >= conversionScore) return "трафик";
  return "конверсия";
};

export const buildLeaderCardData = (rows: ShopKpiRow[]): ShopLeaderCardData | null => {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => b.netRevenue - a.netRevenue);
  const leader = sorted[0];
  const second = sorted[1];
  return {
    name: leader.name,
    netRevenue: leader.netRevenue,
    gapToSecond: second ? leader.netRevenue - second.netRevenue : leader.netRevenue,
    reason: getLeaderReason(leader, rows),
  };
};

export function buildAccessoriesSummaryStats(
	data: AccessoriesSalesData,
	productScope: "accessories" | "nonAccessories" = "accessories",
) {
	const byShopSource = productScope === "nonAccessories"
		? (data.nonAccessoriesByShop || [])
		: data.byShop;
	const totalSource = productScope === "nonAccessories"
		? (data.nonAccessoriesTotal || [])
		: data.total;

	const totalSum = totalSource.reduce((sum, item) => sum + item.sum, 0);
	const totalsQty = totalSource.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
	const avgPrice = totalSource.length > 0 ? Math.round(totalSum / totalSource.length) : 0;
	const totalProducts = totalSource.length;
	const sorted = [...totalSource].sort((a, b) => b.sum - a.sum);
	const top3Sum = sorted.slice(0, 3).reduce((sum, item) => sum + item.sum, 0);
	const topShare = totalSum > 0 ? Math.round((top3Sum / totalSum) * 100) : 0;
	const byShop = byShopSource.map((shop) => ({
		shopName: shop.shopName,
		sum: shop.sales.reduce((s, item) => s + item.sum, 0),
	}));

	return {
		totalSum,
		totalQty: totalsQty,
		avgPrice,
		totalProducts,
		topShare,
		byShop,
	};
}
