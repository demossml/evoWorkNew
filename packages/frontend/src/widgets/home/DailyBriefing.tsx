import { useMemo } from "react";
import { motion } from "framer-motion";
import { MapPin, Target, TrendingUp, TrendingDown } from "lucide-react";
import { useEmployeeNameAndUuid } from "@/hooks/useApi";
import { useGetReportAndPlan } from "@/hooks/useReportData";
import { useWorkingByShops } from "@/hooks/useApi";
import { useSellerEffectiveness } from "@/hooks/dashboard/useSellerEffectiveness";
import { isTelegramMiniApp, telegram } from "@/helpers/telegram";

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return "Доброе утро";
  if (h >= 12 && h < 18) return "Добрый день";
  if (h >= 18 && h < 24) return "Добрый вечер";
  return "Доброй ночи";
}

function fmtRub(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}k`;
  return `${Math.round(n)}`;
}

// ====== Skeleton ======

function BriefingSkeleton() {
  return (
    <div className="mb-4 animate-pulse">
      <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-4 shadow-lg">
        <div className="h-4 w-32 bg-white/20 rounded mb-2" />
        <div className="h-6 w-48 bg-white/20 rounded mb-3" />
        <div className="flex gap-3">
          <div className="h-8 w-24 bg-white/10 rounded-lg" />
          <div className="h-8 w-24 bg-white/10 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

// ====== Main widget ======

export function DailyBriefing() {
  const { data: emp } = useEmployeeNameAndUuid();
  const { data: reportData } = useGetReportAndPlan(true);
  const { data: workingData } = useWorkingByShops();
  const { data: effData } = useSellerEffectiveness({ period: 30 });
  const isMiniApp = isTelegramMiniApp();

  const name = emp?.employeeNameAndUuid?.[0]?.name ?? null;
  const uuid = emp?.employeeNameAndUuid?.[0]?.uuid ?? null;

  // Find seller's metrics
  const seller = useMemo(() => {
    if (!uuid || !effData || !effData.sellers) return null;
    return effData.sellers.find(s => s.uuid === uuid) || null;
  }, [uuid, effData]);

  // Find which store the employee is at today
  const todayShop = useMemo(() => {
    if (!name || !workingData) return null;
    const byShop = (workingData as any)?.byShop as Record<string, { employeeName?: string }> | undefined;
    if (!byShop) return null;
    for (const [shop, info] of Object.entries(byShop)) {
      if (info.employeeName === name) return shop;
    }
    return null;
  }, [name, workingData]);

  // Today's plan for the shop they're at
  const todayPlan = useMemo(() => {
    if (!todayShop || !reportData?.planData) return null;
    const plan = (reportData.planData as Record<string, any>)[todayShop];
    return plan?.plan ?? null;
  }, [todayShop, reportData]);

  // Loading state
  if (!name) return <BriefingSkeleton />;

  const greeting = timeGreeting();

  // Build stat chips
  const chips: { label: string; value: string; icon: JSX.Element; color: string }[] = [];

  if (todayShop) {
    chips.push({
      label: "Сегодня",
      value: todayShop,
      icon: <MapPin className="w-3 h-3" />,
      color: "bg-white/15",
    });
  }

  if (todayPlan) {
    chips.push({
      label: "План",
      value: `${fmtRub(todayPlan)} ₽`,
      icon: <Target className="w-3 h-3" />,
      color: "bg-white/15",
    });
  }

  if (seller) {
    const delta = seller.trendDirection;
    if (delta === "↑") {
      chips.push({
        label: "vs 30 дн",
        value: `+${fmtRub(Math.abs(seller.trendSlope))}/д`,
        icon: <TrendingUp className="w-3 h-3" />,
        color: "bg-emerald-500/30",
      });
    } else if (delta === "↓") {
      chips.push({
        label: "vs 30 дн",
        value: `${fmtRub(seller.trendSlope)}/д`,
        icon: <TrendingDown className="w-3 h-3" />,
        color: "bg-red-500/30",
      });
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4"
      onClick={() => {
        if (isMiniApp) telegram.WebApp.HapticFeedback.impactOccurred("light");
      }}
    >
      <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-4 shadow-lg text-white">
        <div className="text-white/70 text-xs font-medium mb-0.5">
          {greeting}
        </div>
        <h2 className="text-lg font-bold mb-3 leading-tight">
          {name.split(" ")[0]}
          {seller && (
            <span className="text-white/60 text-sm font-normal ml-1">
              · #{seller.rank} в рейтинге
            </span>
          )}
        </h2>

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {chips.map((chip, i) => (
              <div
                key={i}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${chip.color}`}
              >
                {chip.icon}
                <span className="text-white/60">{chip.label}</span>
                <span className="text-white">{chip.value}</span>
              </div>
            ))}
          </div>
        )}

        {!todayShop && (
          <div className="mt-2 text-white/50 text-xs">
            Нет данных о сегодняшней смене
          </div>
        )}
      </div>
    </motion.div>
  );
}
