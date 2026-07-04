import { useNavigate } from "react-router-dom";
import {
  DoorOpen,
  Package,
  FileText,
  TrendingUp,
  Store,
  Calculator,
  Sparkles,
} from "lucide-react";
import {
  getAvailableQuickActions,
  type QuickActionModel,
} from "@features/dashboard/model/quickActionsModel";
import { useStockHealth } from "@/hooks/dashboard/useStockHealth";
import { isTelegramMiniApp, telegram } from "@/helpers/telegram";

interface QuickActionsWidgetProps {
  employeeRole: string;
}

export function QuickActionsWidget({ employeeRole }: QuickActionsWidgetProps) {
  const navigate = useNavigate();
  const isMiniApp = isTelegramMiniApp();

  const availableActions = getAvailableQuickActions(employeeRole);

  // Загружаем данные для бейджей
  const needsStockBadge = availableActions.some(a => a.badgeKey === "deadStock" || a.badgeKey === "lowStock");
  const { data: stockData } = useStockHealth(14, { enabled: needsStockBadge });

  const getBadgeValue = (action: QuickActionModel): string | null => {
    if (action.badgeKey === "deadStock" && stockData?.deadStockCount) {
      return String(stockData.deadStockCount);
    }
    if (action.badgeKey === "lowStock" && stockData?.lowStockCount) {
      return String(stockData.lowStockCount);
    }
    return null;
  };

  const getActionIcon = (action: QuickActionModel) => {
    switch (action.iconKey) {
      case "door_open":
        return <DoorOpen className="w-6 h-6" />;
      case "package":
        return <Package className="w-6 h-6" />;
      case "file_text":
        return <FileText className="w-6 h-6" />;
      case "trending_up":
        return <TrendingUp className="w-6 h-6" />;
      case "store":
        return <Store className="w-6 h-6" />;
      case "calculator":
        return <Calculator className="w-6 h-6" />;
      case "sparkles":
        return <Sparkles className="w-6 h-6" />;
      default:
        return <Store className="w-6 h-6" />;
    }
  };

  if (availableActions.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        Быстрые действия
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {availableActions.map((action) => {
          const badge = getBadgeValue(action);
          const isDisabled = false; // AI Director removed — all actions available

          return (
            <button
              key={action.path}
              onClick={() => {
                if (isMiniApp) {
                  telegram.WebApp.HapticFeedback.impactOccurred("light");
                }
                navigate(action.path);
              }}
              disabled={isDisabled}
              title={
                isDisabled ? "Недоступно при работе через Elvator" : undefined
              }
              className={`relative bg-gradient-to-br ${action.color} text-white p-4 rounded-lg shadow-lg transition-all duration-200 ${
                isDisabled
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:shadow-xl hover:scale-105 active:scale-95"
              }`}
            >
              {/* Badge */}
              {badge && (
                <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold shadow-md ring-2 ring-white dark:ring-gray-800">
                  {badge}
                </span>
              )}

              <div className="flex flex-col items-center text-center gap-2">
                {getActionIcon(action)}
                <div>
                  <div className="font-semibold text-sm">{action.title}</div>
                  <div className="text-xs opacity-80 mt-1">
                    {action.description}
                  </div>
                  {isDisabled && (
                    <div className="text-xs mt-1 opacity-90">
                      Недоступно при работе через Elvator
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
