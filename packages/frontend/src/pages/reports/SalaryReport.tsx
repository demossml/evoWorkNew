import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import { Button } from "../../components/ui/button";
import type { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger, Calendar } from "../../components/ui";
import { SaveAsJpegButton } from "@widgets/reports";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { client } from "../../helpers/api";

interface EmployeeOption {
  uuid: string;
  name: string;
}

interface DayResult {
  date: string;
  shopName: string;
  bonusAccessories: number;
  dataPlan: number;
  salesDataVape: number;
  bonusPlan: number;
  totalBonus: number;
  okladDaily?: number;
}

interface TotalReport {
  employeeName: string | null;
  startDate: string;
  endDate: string;
  workingDays?: number;
  totalOklad?: number;
  totalBonusAccessories: number;
  totalBonusPlan: number;
  totalBonus: number;
  totalPayout?: number;
}

interface ResponseData {
  result?: DayResult[];
  totalReport?: TotalReport;
}

export default function SalaryReport() {
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);

  const formatLocalDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  const getLastWeekRange = () => {
    const today = new Date();
    const day = today.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const thisWeekMonday = new Date(today);
    thisWeekMonday.setDate(today.getDate() + mondayOffset);
    const start = new Date(thisWeekMonday);
    start.setDate(thisWeekMonday.getDate() - 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { startDate: formatLocalDate(start), endDate: formatLocalDate(end) };
  };

  const initialRange = getLastWeekRange();
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [dateMode, setDateMode] = useState<"lastWeek" | "period">("lastWeek");
  const [period, setPeriod] = useState<DateRange | undefined>(undefined);
  const [tempPeriod, setTempPeriod] = useState<DateRange | undefined>(undefined);
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseData, setResponseData] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState(false);

  useTelegramBackButton();

  const formatDate = (date: Date) =>
    date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });

  useEffect(() => {
    if (dateMode === "lastWeek") {
      const lastWeek = getLastWeekRange();
      setStartDate(lastWeek.startDate);
      setEndDate(lastWeek.endDate);
      setPeriod(undefined);
      setTempPeriod(undefined);
      setShowPeriodPicker(false);
    }
  }, [dateMode]);

  useEffect(() => {
    if (dateMode !== "period" || !period?.from || !period?.to) return;
    setStartDate(formatLocalDate(period.from));
    setEndDate(formatLocalDate(period.to));
  }, [dateMode, period]);

  // Load employees
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const response = await client.api.employees.nameUuid.$get();
        if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
        const data = await response.json();
        if (data.employeeNameAndUuid) {
          setEmployeeOptions(data.employeeNameAndUuid);
            if (data.employeeNameAndUuid.length === 1) {
            setSelectedEmployee(data.employeeNameAndUuid[0].uuid);
          }
        }
      } catch (err) {
        console.error("Ошибка загрузки сотрудников:", err);
      }
    };
    fetchEmployees();
  }, []);

  // Auto-select first employee if in simple mode (CASHIER role)
  useEffect(() => {
    if (employeeOptions.length > 0 && !selectedEmployee) {
      setSelectedEmployee(employeeOptions[0].uuid);
    }
  }, [employeeOptions, selectedEmployee]);

  const showEmployeeSelect = employeeOptions.length > 1;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const employee = selectedEmployee || employeeOptions[0]?.uuid;
    if (!employee) {
      setError("Сотрудник не найден");
      return;
    }
    setLoading(true);
    setError(null);
    setResponseData(null);
    try {
      const response = await client.api.evotor.salary.$post({
        json: { employee, startDate, endDate },
      });
      if (response.ok) {
        const result = (await response.json()) as ResponseData;
        setResponseData(result);
      } else {
        const err = (await response.json().catch(() => null)) as Record<string, unknown> | null;
        setError(
          (typeof err?.error === "string" ? err.error : undefined) ||
            (typeof err?.message === "string" ? err.message : undefined) ||
            "Не удалось загрузить отчёт",
        );
      }
    } catch {
      setError("Не удалось отправить данные");
    } finally {
      setLoading(false);
    }
  };

  // Progress bar component
  const ProgressBar = ({ value, max, label }: { value: number; max: number; label?: string }) => {
    const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
    const color = pct >= 100
      ? "bg-emerald-500"
      : pct >= 70
        ? "bg-blue-500"
        : pct >= 40
          ? "bg-amber-500"
          : "bg-red-400";
    return (
      <div className="w-full">
        {label && <div className="text-xs text-slate-500 mb-1">{label}: {pct}%</div>}
        <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700">
          <div className={`h-2 rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="app-page w-full px-4 sm:px-6 py-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col items-center"
      style={{
        paddingTop: "calc(var(--app-top-clearance) + 0.5rem)",
        paddingBottom: "calc(var(--app-bottom-clearance) + 0.5rem)",
      }}
    >
      <h2 className="text-xl sm:text-2xl font-semibold text-center mb-2">
        💰 Отчёт по зарплате
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 text-center">
        Выберите период и получите детализацию начислений
      </p>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-red-500 text-center mb-4"
        >
          {error}
        </motion.div>
      )}

      {loading ? (
        <div className="flex justify-center items-center min-h-[60vh]">
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-24 h-24 border-8 border-t-transparent border-blue-500 rounded-full animate-spin"
          />
        </div>
      ) : responseData ? (
        <SaveAsJpegButton fileName="salary-report.jpeg">
          <div className="w-full max-w-3xl space-y-4">
            {/* Total summary card */}
            {responseData.totalReport && (
              <Card className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-2xl shadow-lg border-0">
                <CardContent className="space-y-3 py-5">
                  <div className="text-lg font-semibold">
                    {responseData.totalReport.employeeName || "Сотрудник"}
                  </div>
                  <div className="text-sm opacity-80">
                    {responseData.totalReport.startDate} → {responseData.totalReport.endDate}
                    {" · "}
                    {responseData.totalReport.workingDays ?? 0} дн.
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="opacity-70">Оклад: </span>
                      <span className="font-bold">{responseData.totalReport.totalOklad ?? 0} ₽</span>
                    </div>
                    <div>
                      <span className="opacity-70">Бонус аксессуары: </span>
                      <span className="font-bold">{responseData.totalReport.totalBonusAccessories} ₽</span>
                    </div>
                    <div>
                      <span className="opacity-70">Бонус план: </span>
                      <span className="font-bold">{responseData.totalReport.totalBonusPlan} ₽</span>
                    </div>
                    <div>
                      <span className="opacity-70">Итого бонус: </span>
                      <span className="font-bold">{responseData.totalReport.totalBonus} ₽</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-white/20 text-2xl font-bold">
                    К выплате: {responseData.totalReport.totalPayout ?? 0} ₽
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Daily details */}
            {responseData.result?.map((item, idx) => (
              <Card
                key={idx}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex justify-between">
                    <span>{item.date}</span>
                    <span className="text-slate-500">{item.shopName}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 dark:text-gray-300">
                  {/* Vape plan progress */}
                  <ProgressBar
                    value={item.salesDataVape}
                    max={item.dataPlan}
                    label={`План по вейпам: ${item.salesDataVape} ₽ / ${item.dataPlan} ₽`}
                  />

                  <div className="grid grid-cols-2 gap-1 text-sm pt-1">
                    <div>
                      <span className="text-slate-500">Бонус аксессуары: </span>
                      <span className="font-semibold">{item.bonusAccessories} ₽</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Бонус план: </span>
                      <span className={`font-semibold ${item.bonusPlan > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                        {item.bonusPlan > 0 ? "✓" : "✗"} {item.bonusPlan} ₽
                      </span>
                    </div>
                    {item.okladDaily ? (
                      <div>
                        <span className="text-slate-500">Оклад/день: </span>
                        <span className="font-semibold">{item.okladDaily} ₽</span>
                      </div>
                    ) : null}
                    <div>
                      <span className="text-slate-500">Итого: </span>
                      <span className="font-bold text-blue-600">{item.totalBonus + (item.okladDaily || 0)} ₽</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </SaveAsJpegButton>
      ) : (
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-3xl space-y-4 bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm"
        >
          {/* Period selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                dateMode === "lastWeek"
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              }`}
              onClick={() => setDateMode("lastWeek")}
            >
              Прошлая неделя
            </button>
            <Popover open={showPeriodPicker} onOpenChange={(open) => { setShowPeriodPicker(open); if (!open) setTempPeriod(undefined); }}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`rounded-lg border px-3 py-2 text-sm transition ${
                    dateMode === "period"
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-300 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  }`}
                  onClick={() => { setDateMode("period"); setTempPeriod(period); setShowPeriodPicker(true); }}
                >
                  Период
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="range"
                  selected={tempPeriod?.from ? tempPeriod : undefined}
                  onSelect={setTempPeriod}
                  numberOfMonths={1}
                  disabled={(date) => date > new Date()}
                  initialFocus
                />
                <div className="flex justify-end p-2">
                  <button
                    className="px-3 py-1 rounded bg-blue-600 text-white"
                    disabled={!(tempPeriod?.from && tempPeriod?.to)}
                    onClick={() => { setPeriod(tempPeriod); setShowPeriodPicker(false); }}
                  >
                    Применить
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          {dateMode === "period" && period?.from && period?.to && (
            <div className="text-sm text-slate-600 dark:text-slate-300">
              {formatDate(period.from)} → {formatDate(period.to)}
            </div>
          )}

          {/* Employee selector (only if multiple) */}
          {showEmployeeSelect && (
            <div>
              <Label htmlFor="employee" className="dark:text-gray-300">Сотрудник:</Label>
              <Select onValueChange={setSelectedEmployee} value={selectedEmployee || ""}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Выберите сотрудника" />
                </SelectTrigger>
                <SelectContent>
                  {employeeOptions.map((opt) => (
                    <SelectItem key={opt.uuid} value={opt.uuid}>{opt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            type="submit"
            className="w-full mt-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white border-0 shadow-sm"
          >
            Получить отчёт
          </Button>
        </motion.form>
      )}
    </motion.div>
  );
}
