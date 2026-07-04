import type React from "react";
import {
  AlertTriangle,
  Target,
  TrendingUp,
  Trophy,
  Medal,
  BarChart3,
} from "lucide-react";
import { formatCurrency } from "../../../utils/formatCurrency";
import type {
  LeaderMode,
  ShopLeaderCardData,
} from "./BestShopCard";

export interface ShopKpiRow {
  name: string;
  revenue: number;
  averageCheck: number;
  refunds: number;
  expenses: number;
  netRevenue: number;
  checks: number;
  refundRate: number;
}

interface BestShopDetailsProps {
  shops: ShopKpiRow[];
  mode: LeaderMode;
  dayLeader: ShopLeaderCardData | null;
  weekLeader: ShopLeaderCardData | null;
  onModeChange: (mode: LeaderMode) => void;
}

function getImprovementHints(shop: ShopKpiRow, avgCheck: number, avgRefundRate: number) {
  const hints: string[] = [];
  if (shop.averageCheck < avgCheck * 0.9) hints.push("поднять средний чек");
  if (shop.refundRate > Math.max(avgRefundRate + 1.5, 3)) hints.push("снизить возвраты");
  if (shop.expenses > shop.revenue * 0.12) hints.push("сократить расходы");
  if (hints.length === 0) hints.push("удерживать текущий темп");
  return hints.slice(0, 2);
}

export const BestShopDetails: React.FC<BestShopDetailsProps> = ({
  shops,
  mode,
  dayLeader,
  weekLeader,
  onModeChange,
}) => {
  const sorted = [...shops].sort((a, b) => b.netRevenue - a.netRevenue);
  const sortedTop = sorted.slice(0, 5);
  const leader = sorted[0];
  const selectedLeader = mode === "week" ? weekLeader : dayLeader;
  const networkAvgNet =
    sorted.length > 0
      ? sorted.reduce((sum, item) => sum + item.netRevenue, 0) / sorted.length
      : 0;
  const networkAvgCheck =
    sorted.length > 0
      ? sorted.reduce((sum, item) => sum + item.averageCheck, 0) / sorted.length
      : 0;
  const networkAvgRefundRate =
    sorted.length > 0
      ? sorted.reduce((sum, item) => sum + item.refundRate, 0) / sorted.length
      : 0;

  const deltaRub = leader ? leader.netRevenue - networkAvgNet : 0;
  const deltaPct =
    networkAvgNet > 0 ? ((deltaRub / networkAvgNet) * 100).toFixed(1) : "0.0";
  const totalNetSales = sorted.reduce((sum, item) => sum + item.netRevenue, 0);
  const maxSales = sortedTop[0]?.netRevenue || 1;
  const maxChecks = Math.max(1, ...sortedTop.map((item) => item.checks));
  const maxAvgCheck = Math.max(1, ...sortedTop.map((item) => item.averageCheck));

  const lagging = sorted.slice(-2).reverse();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 mt-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">
          🏆 Топ магазин
        </h3>
        <div className="inline-flex rounded-md border border-gray-200 dark:border-gray-700 p-0.5">
          <button
            type="button"
            onClick={() => onModeChange("day")}
            className={`rounded px-2 py-1 text-xs ${
              mode === "day"
                ? "bg-blue-600 text-white"
                : "text-gray-700 dark:text-gray-300"
            }`}
          >
            Лидер дня
          </button>
          <button
            type="button"
            onClick={() => onModeChange("week")}
            className={`rounded px-2 py-1 text-xs ${
              mode === "week"
                ? "bg-blue-600 text-white"
                : "text-gray-700 dark:text-gray-300"
            }`}
          >
            Лидер недели
          </button>
        </div>
      </div>

      {selectedLeader && (
        <div className="mb-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3 text-sm">
          <div className="font-semibold text-blue-900 dark:text-blue-100">
            {mode === "week" ? "Режим: лидер недели" : "Режим: лидер дня"}
          </div>
          <div className="text-blue-800 dark:text-blue-200 mt-1">
            Разрыв с 2-м: +{formatCurrency(Math.max(0, selectedLeader.gapToSecond))} ₽
          </div>
          <div className="text-blue-800 dark:text-blue-200">
            Причина: {selectedLeader.reason}
          </div>
        </div>
      )}

      {leader && (
        <div className="mb-4 rounded-lg bg-gray-50 dark:bg-gray-700/40 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            Лидер vs среднее по сети
          </div>
          <div className="mt-2 text-sm text-gray-700 dark:text-gray-200">
            {leader.name}: {formatCurrency(leader.netRevenue)} ₽
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-200">
            Дельта: {deltaRub >= 0 ? "+" : ""}
            {formatCurrency(deltaRub)} ₽ ({deltaRub >= 0 ? "+" : ""}
            {deltaPct}%)
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 text-center">
            📊 Распределение выручки
          </h4>
          <div className="space-y-2">
            {sortedTop.map((shop, index) => {
              const colors = [
                "bg-yellow-400",
                "bg-gray-300",
                "bg-orange-400",
                "bg-purple-400",
                "bg-blue-400",
              ];
              const percentage =
                totalNetSales > 0 ? (shop.netRevenue / totalNetSales) * 100 : 0;
              return (
                <div key={shop.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={`w-3 h-3 rounded-sm ${colors[index]}`} />
                    <span className="text-gray-900 dark:text-white truncate">{shop.name}</span>
                  </div>
                  <span className="font-semibold text-gray-700 dark:text-gray-300 ml-2">
                    {percentage.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-0">
          <div className="flex items-center gap-2 mb-4 justify-center">
            <BarChart3 className="w-5 h-5 text-purple-500" />
            <h4 className="text-base font-bold text-gray-800 dark:text-gray-100">
              Рейтинг по нетто
            </h4>
          </div>
          <div className="space-y-4">
            {sortedTop.map((shop, index) => {
              const widthPercent = (shop.netRevenue / maxSales) * 100;
              let rankIcon: JSX.Element;
              if (index === 0) rankIcon = <Trophy className="w-5 h-5 text-yellow-500 fill-yellow-500" />;
              else if (index === 1) rankIcon = <Medal className="w-5 h-5 text-gray-400 fill-gray-400" />;
              else if (index === 2) rankIcon = <Medal className="w-5 h-5 text-orange-400 fill-orange-400" />;
              else {
                rankIcon = (
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-bold text-gray-500 dark:text-gray-400">
                    {index + 1}
                  </span>
                );
              }
              return (
                <div key={shop.name} className="group">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                      <div className="flex-shrink-0 w-6 flex justify-center">{rankIcon}</div>
                      <div className="truncate">
                        <div className="font-semibold text-gray-900 dark:text-white truncate" title={shop.name}>
                          {shop.name}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-gray-900 dark:text-white">
                        {formatCurrency(shop.netRevenue)} ₽
                      </div>
                    </div>
                  </div>
                  <div className="relative h-2.5 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`absolute top-0 left-0 h-full rounded-full ${
                        index === 0
                          ? "bg-gradient-to-r from-yellow-400 to-yellow-600"
                          : index === 1
                            ? "bg-gradient-to-r from-gray-300 to-gray-500"
                            : index === 2
                              ? "bg-gradient-to-r from-orange-300 to-orange-500"
                              : "bg-gradient-to-r from-purple-500 to-blue-500"
                      }`}
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mt-6">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 text-center">
          🎯 Сравнение по метрикам
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 text-center mb-3">💰 Нетто</div>
            {sortedTop.map((shop, index) => (
              <div key={`${shop.name}-net`} className="flex items-center gap-2">
                <div className="w-16 text-xs text-gray-600 dark:text-gray-400 truncate">#{index + 1}</div>
                <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500" style={{ width: `${(shop.netRevenue / maxSales) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 text-center mb-3">🎫 Средний чек</div>
            {sortedTop.map((shop) => (
              <div key={`${shop.name}-avg`} className="flex items-center gap-2">
                <div className="w-16 text-xs text-gray-600 dark:text-gray-400">{formatCurrency(shop.averageCheck)}</div>
                <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500" style={{ width: `${(shop.averageCheck / maxAvgCheck) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 text-center mb-3">📋 Кол-во чеков</div>
            {sortedTop.map((shop) => (
              <div key={`${shop.name}-checks`} className="flex items-center gap-2">
                <div className="w-16 text-xs text-gray-600 dark:text-gray-400">{shop.checks}</div>
                <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${(shop.checks / maxChecks) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {lagging.length > 0 && (
        <div className="mt-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
            <Target className="w-4 h-4" />
            Что подтянуть отстающим ТТ
          </div>
          <div className="space-y-2">
            {lagging.map((shop) => (
              <div key={shop.name} className="text-sm text-amber-900 dark:text-amber-100">
                <span className="font-semibold">{shop.name}:</span>{" "}
                {getImprovementHints(shop, networkAvgCheck, networkAvgRefundRate).join(", ")}
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs text-amber-700 dark:text-amber-300 inline-flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Рекомендации сформированы по KPI за выбранный режим.
          </div>
        </div>
      )}
    </div>
  );
};
