// Salary widget for Home dashboard — shows month bonus + today's plan status
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { HandCoins, TrendingUp, TrendingDown, Info } from "lucide-react";
import { client } from "../../helpers/api";

interface ShopPlan {
  shop: string;
  vape: number;
  plan: number;
  met: boolean;
  bonus: number;
}

interface DashboardSalary {
  monthBonus: number;
  monthOklad: number;
  todayPlans: ShopPlan[];
}

// Карина Боброва UUID для теста SUPERADMIN
const TEST_EMPLOYEE_UUID = "20260103-4CEE-4059-806C-F1B34712692E";

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 2).toISOString().slice(0, 10);
  const end = now.toISOString().slice(0, 10);
  return { start, end };
}

export function SalaryWidget() {
  const [data, setData] = useState<DashboardSalary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        setError(null);
        const { start, end } = getMonthRange();
        const response = await client.api.evotor.salary.$post({
          json: {
            employee: TEST_EMPLOYEE_UUID,
            startDate: start,
            endDate: end,
          },
        });
        if (response.ok) {
          const json = await response.json() as any;
          // Adapt the response to DashboardSalary format
          const today = new Date();
          const todayStr = `${String(today.getDate()).padStart(2,'0')}-${String(today.getMonth()+1).padStart(2,'0')}-${today.getFullYear()}`;
          setData({
            monthBonus: json.totalReport?.totalBonus || 0,
            monthOklad: 30000,
            todayPlans: (json.result || []).filter((r: any) => r.date === todayStr).map((r: any) => ({
              shop: r.shopName || "—",
              vape: r.salesDataVape || 0,
              plan: r.dataPlan || 0,
              met: (r.salesDataVape || 0) >= (r.dataPlan || 1),
              bonus: r.bonusPlan || 0,
            })),
          });
        } else {
          setError("Ошибка загрузки");
        }
      } catch (err) {
        console.error("SalaryWidget error:", err);
        setError("Сервис недоступен");
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  if (loading) {
    return (
      <div className="w-full mt-3 mb-3 animate-pulse">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 shadow-sm p-4">
          <div className="h-5 w-24 bg-slate-200 dark:bg-slate-800 rounded mb-3" />
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-3 space-y-2">
              <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-6 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
            </div>
            <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-3 space-y-2">
              <div className="h-3 w-12 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-6 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="w-full mt-3 mb-3">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 shadow-sm p-4">
          <div className="text-center text-slate-400 dark:text-slate-500 py-2">
            <Info className="w-5 h-5 mx-auto mb-1 opacity-50" />
            <div className="text-xs">{error || "Нет данных о зарплате"}</div>
          </div>
        </div>
      </div>
    );
  }

  const totalPlans = data.todayPlans.length;
  const metPlans = data.todayPlans.filter(p => p.met).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full mt-3 mb-3"
    >
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <HandCoins className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">Зарплата · Карина Боброва</h3>
        </div>

        {/* Month total */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3">
            <div className="text-xs text-amber-600 dark:text-amber-400">Бонус за месяц</div>
            <div className="text-xl font-bold text-amber-700 dark:text-amber-300">{data.monthBonus.toLocaleString()} ₽</div>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
            <div className="text-xs text-blue-600 dark:text-blue-400">Оклад</div>
            <div className="text-xl font-bold text-blue-700 dark:text-blue-300">{data.monthOklad.toLocaleString()} ₽</div>
          </div>
        </div>

        {/* Today's plan status */}
        {data.todayPlans.length > 0 && (
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-2">
              План по вейпам сегодня
              <span className={`text-xs px-2 py-0.5 rounded-full ${metPlans === totalPlans ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                {metPlans}/{totalPlans}
              </span>
            </div>
            {data.todayPlans.map((p, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <span className="text-sm text-slate-700 dark:text-slate-300">{p.shop}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{p.vape.toLocaleString()} / {p.plan.toLocaleString()}</span>
                  {p.met ? (
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
