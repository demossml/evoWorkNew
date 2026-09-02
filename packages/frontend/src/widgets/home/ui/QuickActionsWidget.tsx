import { useNavigate } from "react-router-dom";
import {
  DoorOpen,
  Package,
  FileText,
  TrendingUp,
  Store,
  Calculator,
  Sparkles,
  Upload,
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
        return <DoorOpen className="w-5 h-5" />;
      case "package":
        return <Package className="w-5 h-5" />;
      case "file_text":
        return <FileText className="w-5 h-5" />;
      case "trending_up":
        return <TrendingUp className="w-5 h-5" />;
      case "store":
        return <Store className="w-5 h-5" />;
      case "calculator":
        return <Calculator className="w-5 h-5" />;
      case "sparkles":
        return <Sparkles className="w-5 h-5" />;
      case "upload":
        return <Upload className="w-5 h-5" />;
      default:
        return <Store className="w-5 h-5" />;
    }
  };

  if (availableActions.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-foreground mb-2">
        Быстрые действия
      </h2>
      <div className="grid grid-cols-4 gap-2">
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
              title={action.description}
              className={`relative bg-gradient-to-br ${action.color} text-white p-2.5 rounded-xl flex flex-col items-center justify-center gap-1.5 min-h-[72px] shadow-md transition-all duration-200 ${
                isDisabled
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:shadow-lg hover:scale-105 active:scale-95"
              }`}
            >
              {/* Badge */}
              {badge && (
                <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold shadow-md ring-2 ring-white dark:ring-gray-800">
                  {badge}
                </span>
              )}

              {getActionIcon(action)}
              <span className="text-[10px] sm:text-xs font-medium leading-tight text-center line-clamp-2">
                {action.title}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
