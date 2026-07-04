import { useMemo } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Trophy, Medal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSellerEffectiveness } from "@/hooks/dashboard/useSellerEffectiveness";

function formatRev(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return `${n}`;
}

const sumRev = (n: number) =>
  n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;

// ====== Skeleton ======

function Skeleton() {
  return (
    <div className="w-full mb-3 animate-pulse">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="px-3 py-2 flex items-center gap-1.5">
          <div className="w-3 h-3 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-3 w-28 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
        <div className="px-3 py-2 space-y-1.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded-full" />
              <div className="h-2.5 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="flex-1" />
              <div className="h-2.5 w-10 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ====== Main widget ======

export function SellerPerformanceWidget() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useSellerEffectiveness({ period: 1 });

  const sellers = useMemo(() => {
    if (!data?.sellers?.length) return [];
    const active = data.sellers.filter((s) => s.daysWorked >= 1);
    return active.slice(0, 3);
  }, [data]);

  if (isLoading) return <Skeleton />;

  if (isError || sellers.length === 0) {
    return (
      <div className="w-full mb-3">
        <div
          onClick={() => navigate("/evotor/seller-performance")}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-3 cursor-pointer active:scale-[0.98] transition-transform"
        >
          <div className="text-center text-gray-400 dark:text-gray-500">
            <Trophy className="w-4 h-4 mx-auto mb-0.5 opacity-30" />
            <div className="text-xs">Нет данных за сегодня</div>
          </div>
        </div>
      </div>
    );
  }

  const medalBg = ["#fef3c7", "#f1f5f9", "#fef3c7"];
  const medalIcon = [
    <Trophy className="w-2.5 h-2.5 text-amber-500" />,
    <Medal className="w-2.5 h-2.5 text-slate-400" />,
    <Medal className="w-2.5 h-2.5 text-amber-700" />,
  ];

  return (
    <div className="w-full mb-3">
      <motion.div
        initial={{ opacity: 0, y: 2 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div
          onClick={() => navigate("/evotor/seller-performance")}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
        >
          {/* Header — compact */}
          <div className="px-3 py-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-300">
              🏆 Продавцы сегодня
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          </div>

          {/* Top 3 — tight rows, name+highlight inline */}
          <div className="px-3 pb-2.5 space-y-1">
            {sellers.map((s, i) => (
              <div key={s.uuid} className="flex items-center gap-1.5 h-7">
                {/* Medal pill */}
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: medalBg[i] }}
                >
                  {medalIcon[i]}
                </div>

                {/* Name · highlight */}
                <span className="text-[13px] font-medium text-gray-800 dark:text-gray-200 truncate flex-1 leading-none">
                  {s.name.split(" ")[0]}
                  <span className="text-xs font-normal text-gray-400 dark:text-gray-500 ml-1.5">
                    ·{" "}
                    {s.avgCheck >= s.targetAvgCheck
                      ? `чек ${s.avgCheck}₽`
                      : s.trendDirection === "↑"
                        ? `+${s.trendSlope.toFixed(0)}/д`
                        : `#${s.rank}`}
                  </span>
                </span>

                {/* Revenue */}
                <span className="text-[13px] font-bold text-gray-800 dark:text-gray-200 shrink-0 tabular-nums">
                  {sumRev(s.totalRevenue)}₽
                </span>

                {/* Rank delta */}
                {s.deltaRank != null && s.deltaRank !== 0 && (
                  <span
                    className={`text-xs font-semibold shrink-0 ${
                      s.deltaRank > 0
                        ? "text-emerald-500"
                        : "text-red-500"
                    }`}
                  >
                    {s.deltaRank > 0 ? "↑" : "↓"}
                    {Math.abs(s.deltaRank)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
