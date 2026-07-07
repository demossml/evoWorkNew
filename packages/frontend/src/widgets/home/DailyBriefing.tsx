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
      <div className="bg-primary rounded-xl p-4 shadow-lg">
        <div className="h-4 w-32 bg-primary-foreground/20 rounded mb-2" />
        <div className="h-6 w-48 bg-primary-foreground/20 rounded mb-3" />
        <div className="flex gap-3">
          <div className="h-8 w-24 bg-primary-foreground/10 rounded-lg" />
          <div className="h-8 w-24 bg-primary-foreground/10 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

function PlanRing({ percent, size = 44 }: { percent: number; size?: number }) {
  const r = (size - 6) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(Math.max(percent, 0), 1));
  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={4}
        className="stroke-primary-foreground/25"
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={4}
        className="stroke-primary-foreground transition-[stroke-dashoffset] duration-700 ease-out"
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
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

  // Today's plan and fact for the shop they're at.
  // NB: the API returns { datePlan, dataSales, dataQuantity } per shop name —
  // this previously read `.plan`, a field that doesn't exist in that shape,
  // so the "План" chip was silently never rendering.
  const { todayPlan, todayFact } = useMemo(() => {
    if (!todayShop || !reportData?.planData) return { todayPlan: null, todayFact: null };
    const plan = (reportData.planData as Record<string, any>)[todayShop];
    return {
      todayPlan: typeof plan?.datePlan === "number" ? plan.datePlan : null,
      todayFact: typeof plan?.dataSales === "number" ? plan.dataSales : null,
    };
  }, [todayShop, reportData]);

  const planProgress =
    todayPlan && todayPlan > 0 && todayFact != null
      ? Math.min(todayFact / todayPlan, 1)
      : null;

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
      color: "bg-primary-foreground/15",
    });
  }

  if (todayPlan) {
    chips.push({
      label: "План",
      value: todayFact != null ? `${fmtRub(todayFact)} / ${fmtRub(todayPlan)} ₽` : `${fmtRub(todayPlan)} ₽`,
      icon: <Target className="w-3 h-3" />,
      color: "bg-primary-foreground/15",
    });
  }

  if (seller) {
    const delta = seller.trendDirection;
    if (delta === "↑") {
      chips.push({
        label: "vs 30 дн",
        value: `+${fmtRub(Math.abs(seller.trendSlope))}/д`,
        icon: <TrendingUp className="w-3 h-3" />,
        color: "bg-success/30",
      });
    } else if (delta === "↓") {
      chips.push({
        label: "vs 30 дн",
        value: `${fmtRub(seller.trendSlope)}/д`,
        icon: <TrendingDown className="w-3 h-3" />,
        color: "bg-destructive/30",
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
      <div className="bg-primary rounded-xl p-4 shadow-lg text-primary-foreground">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-primary-foreground/70 text-xs font-medium mb-0.5">
              {greeting}
            </div>
            <h2 className="text-lg font-bold mb-3 leading-tight truncate">
              {name.split(" ")[0]}
              {seller && (
                <span className="text-primary-foreground/60 text-sm font-normal ml-1">
                  · #{seller.rank} в рейтинге
                </span>
              )}
            </h2>
          </div>

          {planProgress != null && (
            <div className="relative shrink-0">
              <PlanRing percent={planProgress} />
              <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold">
                {Math.round(planProgress * 100)}%
              </span>
            </div>
          )}
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {chips.map((chip, i) => (
              <div
                key={i}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${chip.color}`}
              >
                {chip.icon}
                <span className="text-primary-foreground/60">{chip.label}</span>
                <span className="text-primary-foreground">{chip.value}</span>
              </div>
            ))}
          </div>
        )}

        {!todayShop && (
          <div className="mt-2 text-primary-foreground/50 text-xs">
            Нет данных о сегодняшней смене
          </div>
        )}
      </div>
    </motion.div>
  );
}
