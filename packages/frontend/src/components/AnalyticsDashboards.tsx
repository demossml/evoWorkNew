import {
	useAnalyticsShops,
	useBusinessDashboard,
	useProductDashboard,
	useReliabilityDashboard,
} from "../hooks/useAnalyticsDashboards";
import { useMemo, useState } from "react";

function pct(value: number) {
	return `${(value * 100).toFixed(1)}%`;
}

function money(value: number) {
	return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

interface AnalyticsDashboardsProps {
	readOnly?: boolean;
}

export default function AnalyticsDashboards({
	readOnly = false,
}: AnalyticsDashboardsProps) {
	const shopsQuery = useAnalyticsShops();
	const [selectedShopUuid, setSelectedShopUuid] = useState<string>("all");
	const selectedShop = useMemo(
		() =>
			(shopsQuery.data || []).find((shop) => shop.uuid === selectedShopUuid) || null,
		[shopsQuery.data, selectedShopUuid],
	);
	const filter = useMemo(
		() =>
			selectedShop
				? { shopUuid: selectedShop.uuid, shopName: selectedShop.name }
				: undefined,
		[selectedShop],
	);
	const product = useProductDashboard();
	const reliability = useReliabilityDashboard();
	const business = useBusinessDashboard(filter);

	if (
		shopsQuery.isLoading ||
		product.isLoading ||
		reliability.isLoading ||
		business.isLoading
	) {
		return (
			<div className="mb-6 rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
				Загрузка аналитических дашбордов...
			</div>
		);
	}

	if (
		shopsQuery.isError ||
		product.isError ||
		reliability.isError ||
		business.isError
	) {
		return (
			<div className="mb-6 rounded-lg bg-red-50 dark:bg-red-900/30 p-4 text-red-700 dark:text-red-200">
				Не удалось загрузить аналитические дашборды.
			</div>
		);
	}

	const productData = product.data as any;
	const reliabilityData = reliability.data as any;
	const businessData = business.data as any;

	return (
		<div className="mb-6 space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
					Аналитика
				</h2>
				<div className="flex items-center gap-2">
					<label
						htmlFor="analytics-shop-filter"
						className="text-xs text-gray-500 dark:text-gray-400"
					>
						Магазин
					</label>
					<select
						id="analytics-shop-filter"
						className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
						value={selectedShopUuid}
						onChange={(event) => setSelectedShopUuid(event.target.value)}
					>
						<option value="all">Все магазины</option>
						{(shopsQuery.data || []).map((shop) => (
							<option key={shop.uuid} value={shop.uuid}>
								{shop.name}
							</option>
						))}
					</select>
				</div>
			</div>
			<div className="text-xs text-gray-500 dark:text-gray-400">
				Фильтр магазина применяется к разделу Business.
			</div>
			{readOnly && (
				<div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
					Analytics dashboard включен в режиме только чтения (read-only).
				</div>
			)}
			<div className="rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
				<h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
					Product
				</h2>
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
					<div className="rounded bg-gray-100 dark:bg-gray-700 p-3">
						<div className="text-xs text-gray-500">DAU</div>
						<div className="text-lg font-semibold">{productData?.dau ?? 0}</div>
					</div>
					<div className="rounded bg-gray-100 dark:bg-gray-700 p-3">
						<div className="text-xs text-gray-500">WAU</div>
						<div className="text-lg font-semibold">{productData?.wau ?? 0}</div>
					</div>
					<div className="rounded bg-gray-100 dark:bg-gray-700 p-3">
						<div className="text-xs text-gray-500">Конверсия в отчет</div>
						<div className="text-lg font-semibold">
							{pct(productData?.conversionToReport ?? 0)}
						</div>
					</div>
					<div className="rounded bg-gray-100 dark:bg-gray-700 p-3">
						<div className="text-xs text-gray-500">До первого отчета</div>
						<div className="text-lg font-semibold">
							{productData?.timeToFirstReport?.avgMinutes ??
								productData?.avgTimeToFirstReportMinutes ??
								0}{" "}
							мин
						</div>
					</div>
				</div>
				<div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
					<div className="rounded bg-gray-100 dark:bg-gray-700 p-3">
						<div className="text-xs text-gray-500">TTFReport p50</div>
						<div className="text-lg font-semibold">
							{productData?.timeToFirstReport?.p50Minutes ?? 0} мин
						</div>
					</div>
					<div className="rounded bg-gray-100 dark:bg-gray-700 p-3">
						<div className="text-xs text-gray-500">TTFReport p95</div>
						<div className="text-lg font-semibold">
							{productData?.timeToFirstReport?.p95Minutes ?? 0} мин
						</div>
					</div>
					<div className="rounded bg-gray-100 dark:bg-gray-700 p-3">
						<div className="text-xs text-gray-500">Retention D1</div>
						<div className="text-lg font-semibold">
							{pct(productData?.retention?.weightedAverage?.d1 ?? 0)}
						</div>
					</div>
					<div className="rounded bg-gray-100 dark:bg-gray-700 p-3">
						<div className="text-xs text-gray-500">Retention D7</div>
						<div className="text-lg font-semibold">
							{pct(productData?.retention?.weightedAverage?.d7 ?? 0)}
						</div>
					</div>
				</div>
				<div className="mt-4 grid gap-4 sm:grid-cols-2">
					<div className="overflow-x-auto rounded bg-gray-50 p-3 dark:bg-gray-700/50">
						<div className="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
							Conversion by role
						</div>
						<table className="w-full text-xs">
							<thead>
								<tr className="text-left text-gray-500">
									<th className="py-1">Role</th>
									<th className="py-1">Started</th>
									<th className="py-1">Success</th>
									<th className="py-1">Conv</th>
								</tr>
							</thead>
							<tbody>
								{(productData?.conversionByRole ?? []).slice(0, 6).map((row: any) => (
									<tr key={row.role}>
										<td className="py-1">{row.role}</td>
										<td className="py-1">{row.startedUsers || 0}</td>
										<td className="py-1">{row.successUsers || 0}</td>
										<td className="py-1">{pct(row.conversion || 0)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<div className="overflow-x-auto rounded bg-gray-50 p-3 dark:bg-gray-700/50">
						<div className="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
							Top shops by conversion
						</div>
						<table className="w-full text-xs">
							<thead>
								<tr className="text-left text-gray-500">
									<th className="py-1">Магазин</th>
									<th className="py-1">Started</th>
									<th className="py-1">Success</th>
									<th className="py-1">Conv</th>
								</tr>
							</thead>
							<tbody>
								{(productData?.conversionByShop ?? []).slice(0, 6).map((row: any) => (
									<tr key={row.shopUuid}>
										<td
											className="py-1 max-w-[140px] truncate"
											title={row.shopName || row.shopUuid}
										>
											{row.shopName || row.shopUuid}
										</td>
										<td className="py-1">{row.startedUsers || 0}</td>
										<td className="py-1">{row.successUsers || 0}</td>
										<td className="py-1">{pct(row.conversion || 0)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
				<div className="mt-4 overflow-x-auto rounded bg-gray-50 p-3 dark:bg-gray-700/50">
					<div className="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
						Cohort retention
					</div>
					<table className="w-full text-xs">
						<thead>
							<tr className="text-left text-gray-500">
								<th className="py-1">Cohort</th>
								<th className="py-1">Users</th>
								<th className="py-1">D1</th>
								<th className="py-1">D7</th>
								<th className="py-1">D14</th>
								<th className="py-1">D30</th>
							</tr>
						</thead>
						<tbody>
							{(productData?.retention?.cohorts ?? []).slice(-8).map((row: any) => (
								<tr key={row.cohortDate}>
									<td className="py-1">{row.cohortDate}</td>
									<td className="py-1">{row.users || 0}</td>
									<td className="py-1">{pct(row.d1 || 0)}</td>
									<td className="py-1">{pct(row.d7 || 0)}</td>
									<td className="py-1">{pct(row.d14 || 0)}</td>
									<td className="py-1">{pct(row.d30 || 0)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>

			<div className="rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
				<h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
					Reliability
				</h2>
				<div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
					<div className="rounded bg-gray-100 dark:bg-gray-700 p-3">
						<div className="text-xs text-gray-500">Error rate</div>
						<div className="text-lg font-semibold">
							{pct(reliabilityData?.errorRateOverall ?? 0)}
						</div>
					</div>
					<div className="rounded bg-gray-100 dark:bg-gray-700 p-3">
						<div className="text-xs text-gray-500">p50 latency</div>
						<div className="text-lg font-semibold">
							{Math.round(reliabilityData?.p50LatencyMs ?? 0)} ms
						</div>
					</div>
					<div className="rounded bg-gray-100 dark:bg-gray-700 p-3">
						<div className="text-xs text-gray-500">p95 latency</div>
						<div className="text-lg font-semibold">
							{Math.round(reliabilityData?.p95LatencyMs ?? 0)} ms
						</div>
					</div>
					<div className="rounded bg-gray-100 dark:bg-gray-700 p-3">
						<div className="text-xs text-gray-500">Top error code</div>
						<div className="text-sm font-semibold">
							{reliabilityData?.topErrorCodes?.[0]?.code ?? "N/A"}
						</div>
					</div>
				</div>
				<div className="overflow-x-auto">
					<table className="w-full text-xs">
						<thead>
							<tr className="text-left text-gray-500">
								<th className="py-1">Endpoint</th>
								<th className="py-1">Error rate</th>
								<th className="py-1">Avg ms</th>
							</tr>
						</thead>
						<tbody>
							{(reliabilityData?.byEndpoint ?? []).slice(0, 5).map((row: any) => (
								<tr key={row.endpoint}>
									<td className="py-1">{row.endpoint}</td>
									<td className="py-1">{pct(row.errorRate || 0)}</td>
									<td className="py-1">{Math.round(row.avgLatencyMs || 0)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>

			<div className="rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
				<h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
					Business
				</h2>
				<div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
					<div className="rounded bg-gray-100 dark:bg-gray-700 p-3">
						<div className="text-xs text-gray-500">Выручка</div>
						<div className="text-sm font-semibold">
							{money(businessData?.totals?.revenue ?? 0)}
						</div>
					</div>
					<div className="rounded bg-gray-100 dark:bg-gray-700 p-3">
						<div className="text-xs text-gray-500">Возвраты</div>
						<div className="text-sm font-semibold">
							{money(businessData?.totals?.refunds ?? 0)}
						</div>
					</div>
					<div className="rounded bg-gray-100 dark:bg-gray-700 p-3">
						<div className="text-xs text-gray-500">Средний чек</div>
						<div className="text-sm font-semibold">
							{money(businessData?.totals?.avgCheck ?? 0)}
						</div>
					</div>
					<div className="rounded bg-gray-100 dark:bg-gray-700 p-3">
						<div className="text-xs text-gray-500">Net sales</div>
						<div className="text-sm font-semibold">
							{money(businessData?.totals?.netSales ?? 0)}
						</div>
					</div>
				</div>
				<div className="overflow-x-auto">
					<table className="w-full text-xs">
						<thead>
							<tr className="text-left text-gray-500">
								<th className="py-1">Магазин</th>
								<th className="py-1">Выручка</th>
								<th className="py-1">План/факт</th>
							</tr>
						</thead>
						<tbody>
							{(businessData?.stores ?? []).slice(0, 7).map((store: any) => (
								<tr key={store.shopUuid}>
									<td className="py-1">{store.shopName}</td>
									<td className="py-1">{money(store.revenue || 0)}</td>
									<td className="py-1">
										{store.planFactPercent != null
											? `${store.planFactPercent.toFixed(1)}%`
											: "N/A"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
