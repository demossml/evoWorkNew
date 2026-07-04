import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Cherry } from "lucide-react";
import { useAccessoriesSales, type AccessoriesSalesData } from "@/hooks/dashboard/useAccessoriesSales";
import { useEmployeeRole, useMe } from "@/hooks/useApi";
import { SkeletonCard } from "./widgetUtils";
import { TileWrapper } from "./TileWrapper";
import { buildAccessoriesSummaryStats } from "@features/dashboard/model/dashboardSummaryModel";

interface Props { since: string; until: string; expanded: boolean; onToggle: () => void }

function AccCard({ value }: { value: number }) {
  return (
    <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.98 }}
      className="bg-blue-100 dark:bg-blue-900 rounded-lg p-4 h-[120px] flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-gray-600 dark:text-gray-300">Аксессуары</div>
        <Cherry className="w-6 h-6 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="text-2xl font-bold text-blue-800 dark:text-blue-200">{value.toLocaleString()} ₽</div>
    </motion.div>
  );
}

function AccessoriesSummaryStats({ data, scope }: { data: AccessoriesSalesData; scope: "accessories" | "nonAccessories" }) {
  const { totalQty, avgPrice, totalProducts, topShare, byShop } =
    buildAccessoriesSummaryStats(data, scope);

  return (
    <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
      <div className="bg-blue-100 dark:bg-blue-900 rounded-lg p-4 flex flex-col items-center justify-center min-h-[92px] col-span-1">
        <div className="text-xs text-gray-700 dark:text-gray-300 mb-2">
          Суммы по магазинам
        </div>
        <div className="flex flex-col gap-1 w-full items-center">
          {byShop.map((shop) => (
            <div
              key={shop.shopName}
              className="flex flex-row items-center justify-between w-full text-xs font-semibold text-blue-800 dark:text-blue-200"
            >
              <span className="truncate max-w-[60%] text-gray-800 dark:text-gray-200">
                {shop.shopName}
              </span>
              <span className="ml-2 whitespace-nowrap">
                {shop.sum.toLocaleString()} ₽
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-gray-800 dark:bg-gray-700 rounded-lg p-4 flex flex-col items-center justify-center min-h-[92px]">
        <div className="text-white text-2xl font-bold mb-1">
          {totalProducts}
        </div>
        <div className="text-xs text-gray-300 dark:text-gray-400">
          Всего товаров
        </div>
      </div>
      <div className="bg-gray-800 dark:bg-gray-700 rounded-lg p-4 flex flex-col items-center justify-center min-h-[92px]">
        <div className="text-white text-2xl font-bold mb-1">{topShare}%</div>
        <div className="text-xs text-gray-300 dark:text-gray-400">
          Доля топ-3
        </div>
      </div>
      <div className="bg-gray-800 dark:bg-gray-700 rounded-lg p-4 flex flex-col items-center justify-center min-h-[92px]">
        <div className="text-white text-2xl font-bold mb-1">{avgPrice}</div>
        <div className="text-xs text-gray-300 dark:text-gray-400">Ср. цена</div>
      </div>
      <div className="bg-gray-800 dark:bg-gray-700 rounded-lg p-4 flex flex-col items-center justify-center min-h-[92px]">
        <div className="text-white text-2xl font-bold mb-1">{totalQty}</div>
        <div className="text-xs text-gray-300 dark:text-gray-400">
          Продано шт
        </div>
      </div>
    </div>
  );
}

function AccDetails({ data, fullData, shopFilter, onShopFilterChange, shopOptions, productScope, onProductScopeChange }: {
  data: AccessoriesSalesData; fullData: AccessoriesSalesData;
  shopFilter: string; onShopFilterChange: (v: string) => void;
  shopOptions: string[]; productScope: "accessories" | "nonAccessories"; onProductScopeChange: (v: "accessories" | "nonAccessories") => void;
}) {
  const sourceList = productScope === "nonAccessories" ? (data.nonAccessoriesTotal || []) : data.total;
  const sorted = [...sourceList].sort((a, b) => b.sum - a.sum);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Продажи</h2>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5 text-xs dark:border-gray-600 dark:bg-gray-700">
            <button className={`rounded px-2 py-1 ${productScope === "accessories" ? "bg-slate-700 text-white" : "text-gray-600 dark:text-gray-300"}`} onClick={() => onProductScopeChange("accessories")}>Акс.</button>
            <button className={`rounded px-2 py-1 ${productScope === "nonAccessories" ? "bg-slate-700 text-white" : "text-gray-600 dark:text-gray-300"}`} onClick={() => onProductScopeChange("nonAccessories")}>Не акс.</button>
          </div>
          {shopOptions.length > 1 && (
            <select className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200" value={shopFilter} onChange={(e) => onShopFilterChange(e.target.value)}>
              <option value="all">Все магазины</option>
              {shopOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
        </div>
      </div>
      <ul>
        {sorted.map((sale, idx) => (
          <li key={sale.name} className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-gray-800 dark:text-gray-300">{idx + 1}.</span>
              <span className="font-bold text-sm text-gray-900 dark:text-white">{sale.name}</span>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-blue-700 dark:text-blue-400">{sale.sum.toLocaleString()} ₽</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">{sale.quantity} шт</div>
            </div>
          </li>
        ))}
      </ul>
      <AccessoriesSummaryStats data={fullData} scope={productScope} />
    </div>
  );
}

export function AccessoriesWidget({ since, until, expanded, onToggle }: Props) {
  const [shopFilter, setShopFilter] = useState("all");
  const [scope, setScope] = useState<"accessories" | "nonAccessories">("accessories");
  const { data: role } = useEmployeeRole();
  const me = useMe();
  const { data, loading, error } = useAccessoriesSales({ role: role?.employeeRole || "CASHIER", userId: me.data?.id ?? "", since, until, enabled: true });

  const shopOptions = useMemo(() => {
    const names = new Set<string>();
    data?.total?.forEach((i: any) => { if (i.shopName) names.add(i.shopName); });
    return Array.from(names);
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return null;
    if (shopFilter === "all") return data;
    return {
      ...data,
      total: data.total.filter((i: any) => i.shopName === shopFilter),
      nonAccessoriesTotal: (data.nonAccessoriesTotal || []).filter((i: any) => i.shopName === shopFilter),
    };
  }, [data, shopFilter]);

  const tileValue = useMemo(() => {
    if (!filtered) return 0;
    const list = scope === "nonAccessories" ? (filtered.nonAccessoriesTotal || []) : filtered.total;
    return list.reduce((s: number, i: any) => s + i.sum, 0);
  }, [filtered, scope]);

  if (loading) return <SkeletonCard tone="cyan" />;
  if (error) return <div className="text-red-500 text-sm p-2">Ошибка: {error}</div>;
  if (!data?.total?.length) {
    return (
      <div className="rounded-xl hover:-translate-y-0.5 cursor-pointer transition-all duration-300">
        <AccCard value={0} />
      </div>
    );
  }

  return (
    <TileWrapper
      expanded={expanded}
      onToggle={onToggle}
      ringTone="cyan"
      card={<AccCard value={tileValue} />}
      detail={filtered && (
        <AccDetails data={filtered} fullData={data} shopFilter={shopFilter} onShopFilterChange={setShopFilter}
          shopOptions={shopOptions} productScope={scope} onProductScopeChange={setScope} />
      )}
    />
  );
}
