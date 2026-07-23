import { useEffect, useState, useCallback, useRef } from "react";
import { useMe } from "../../hooks/useApi";
import { motion } from "framer-motion";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { telegram, isTelegramMiniApp } from "../../helpers/telegram";
import { client } from "../../helpers/api";
import type { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger, Calendar } from "../../components/ui";
import { ErrorState, LoadingState } from "@shared/ui/states";
import { DeadStockGrid, type DeadStockTileItem } from "@widgets/deadstock/ui/DeadStockGrid";
import type { PlannedAction } from "@widgets/deadstock/ui/DeadStockDetailModal";
import { GroupSelector } from "@widgets/reports";
import { ShopFilter } from "@widgets/filters";
import { FileDown } from "lucide-react";

interface GroupOption {
  name: string;
  uuid: string;
}

interface ReportDataItem {
  itemId: string;
  name: string;
  article: string;
  quantity: number;
  sold: number;
  lastSaleDate: string | null;
  daysWithoutSales: number;
  shopId: string;
  shopName: string;
}

interface ReportData {
  salesData: ReportDataItem[];
  shopName: string;
  startDate: string;
  endDate: string;
}

/** Генерация Excel-совместимого CSV с запланированными действиями */
function downloadActionsCsv(actions: PlannedAction[]) {
  const BOM = "\uFEFF";
  const header = "Товар;Артикул;Действие;Количество;Магазин;Куда;Причина";
  const actionLabels: Record<string, string> = {
    move: "Переместить", writeoff: "Списать", promo: "Промо", keep: "Оставить",
  };
  const rows = actions.map(a => {
    const targets = a.targetShops?.map(t => `${t.shopName}:${t.qty}`).join(" | ") || "";
    return [
      a.name, a.article,
      actionLabels[a.action] || a.action,
      String(a.quantity), a.shopName,
      targets, a.reason || "",
    ]
    .map(v => `"${String(v).replace(/"/g, '""')}"`)
    .join(";");
  });
  const moveCount = actions.filter(a => a.action === "move").length;
  const writeoffCount = actions.filter(a => a.action === "writeoff").length;
  const promoCount = actions.filter(a => a.action === "promo").length;
  const keepCount = actions.filter(a => a.action === "keep").length;
  const totalQty = actions.reduce((s, a) => s + a.quantity, 0);
  const summary = [
    "",
    `"Дата: ${new Date().toISOString().slice(0, 10)}";;;;;;`,
    `"Всего: ${actions.length} товаров, ${totalQty} шт.";;;;;;`,
    `"Переместить: ${moveCount}";;;;;;`,
    `"Списать: ${writeoffCount}";;;;;;`,
    `"Промо: ${promoCount}";;;;;;`,
    `"Оставить: ${keepCount}";;;;;;`,
  ];

  const csv = BOM + [header, ...rows, ...summary].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dead-stock-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const PRESETS = [
  { key: "month1", label: "Месяц назад" },
  { key: "month2", label: "2 месяца назад" },
  { key: "month3", label: "3 месяца назад" },
  { key: "month6", label: "6 месяцев назад" },
  { key: "alltime", label: "Всё время" },
];

export default function DeadSt() {
  const [shopOptions, setShopOptions] = useState<Record<string, string>>({});
  const [selectedShops, setSelectedShops] = useState<string[]>([]);
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [plannedActions, setPlannedActions] = useState<PlannedAction[]>([]);
  const [isLoadingShops, setIsLoadingShops] = useState(false);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);

  // Кэш себестоимостей (itemId|shopId → { unitCost, totalFrozenCost })
  const [costMap, setCostMap] = useState<Map<string, { unitCost: number | null; totalFrozenCost: number | null }>>(new Map());

  // Date picker state (Calendar for "period" mode)
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);
  const [period, setPeriod] = useState<DateRange | undefined>(undefined);
  const [tempPeriod, setTempPeriod] = useState<DateRange | undefined>(undefined);
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // Отслеживание открытых модальных окон
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isGroupSelectorOpen, setIsGroupSelectorOpen] = useState(false);

  // Ref для предотвращения двойной загрузки
  const autoSubmitLock = useRef(false);
  // Ref: пользователь вручную вернулся к фильтрам — не авто-отправлять
  const manualReturnToFilters = useRef(false);

  const isMiniApp = isTelegramMiniApp();

  useTelegramBackButton();

  const { data } = useMe();
  const userId = data?.id?.toString() || "";

  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Применение календарного периода
  useEffect(() => {
    if (!period?.from || !period?.to) return;
    setStartDate(formatLocalDate(period.from));
    setEndDate(formatLocalDate(period.to));
  }, [period]);

  // Обработчик быстрых пресетов периода
  const applyPreset = (preset: string) => {
    const now = new Date();
    const end = formatLocalDate(now);
    let start = end;
    switch (preset) {
      case "month1":
        start = formatLocalDate(new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()));
        break;
      case "month2":
        start = formatLocalDate(new Date(now.getFullYear(), now.getMonth() - 2, now.getDate()));
        break;
      case "month3":
        start = formatLocalDate(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()));
        break;
      case "month6":
        start = formatLocalDate(new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()));
        break;
      case "alltime":
        start = "2020-01-01";
        break;
    }
    setStartDate(start);
    setEndDate(end);
    setPeriod(undefined);
    setActivePreset(preset);
    setShowPresetDropdown(false);
  };

  const isFormValid =
    !!startDate && !!endDate &&
    (selectedGroups.length > 0 || selectedShops.length === 0);

  // Модальные окна закрыты?
  const areAllModalsClosed =
    !isDatePickerOpen && !isGroupSelectorOpen && !showPeriodPicker;

  // 🔹 Подгрузка себестоимостей после получения отчёта
  useEffect(() => {
    if (!reportData || reportData.salesData.length === 0) return;
    const fetchCosts = async () => {
      try {
        const res = await fetch(`/api/analytics/dead-stock?daysWithoutSales=0&shopId=all`);
        if (!res.ok) return;
        const json = await res.json();
        const items = json.items ?? [];
        const map = new Map<string, { unitCost: number | null; totalFrozenCost: number | null }>();
        for (const item of items) {
          const key = `${item.itemId}|${item.shopId}`;
          map.set(key, { unitCost: item.unitCost ?? null, totalFrozenCost: item.totalFrozenCost ?? null });
        }
        setCostMap(map);
      } catch { /* не критично */ }
    };
    fetchCosts();
  }, [reportData]);

  // 🔹 Функция генерации отчёта с useCallback
  const submitForecast = useCallback(async () => {
    if (!isFormValid) return;

    // Блокировка повторного вызова
    if (autoSubmitLock.current) return;
    autoSubmitLock.current = true;

    setIsLoadingReport(true);
    setError(null);
    if (isMiniApp) {
      telegram.WebApp.MainButton.showProgress(true);
    }
    try {
      const response = await client.api["dead-stocks"].data.$post({
        json: {
          startDate: startDate!,
          endDate: endDate!,
          shopIds: selectedShops.length === 0 ? null : selectedShops,
          groups: selectedGroups,
        },
      });

      if (!response.ok) throw new Error(`Ошибка: ${response.status}`);

      const result = await response.json();

      if (
        "salesData" in result &&
        "shopName" in result &&
        "startDate" in result &&
        "endDate" in result
      ) {
        setReportData(result as ReportData);
        setError(null);
      } else {
        setReportData(null);
        setError("Не удалось получить корректные данные отчёта");
      }
    } catch (err) {
      console.error(err);
      setError("Не удалось получить отчёт");
      if (isMiniApp) {
        telegram.WebApp.HapticFeedback.impactOccurred("light");
      }
    } finally {
      setIsLoadingReport(false);
      autoSubmitLock.current = false;
      if (isMiniApp) {
        telegram.WebApp.MainButton.showProgress(false);
      }
    }
  }, [startDate, endDate, selectedShops, selectedGroups, isFormValid, isMiniApp]);

  // 🔹 Авто-отправка при изменении фильтров (кроме ручного возврата)
  useEffect(() => {
    if (manualReturnToFilters.current) {
      manualReturnToFilters.current = false;
      return;
    }
    if (!reportData && isFormValid) {
      submitForecast();
    }
  }, [isFormValid, reportData, submitForecast]);

  // 🔹 Инициализация Telegram Mini App
  useEffect(() => {
    if (!isMiniApp) return;

    telegram.WebApp.MainButton.setText("Сгенерировать отчёт");
    telegram.WebApp.MainButton.setParams({
      color: "#0088cc",
      text_color: "#ffffff",
    });

    const handleGenerate = () => {
      telegram.WebApp.HapticFeedback.impactOccurred("light");
      submitForecast();
    };

    telegram.WebApp.MainButton.onClick(handleGenerate);

    return () => {
      telegram.WebApp.MainButton.offClick(handleGenerate);
    };
  }, [isMiniApp, submitForecast]);

  // 🔹 Управление видимостью MainButton с учётом модальных окон
  useEffect(() => {
    if (!isMiniApp) return;

    if (
      isFormValid &&
      !error &&
      !isLoadingReport &&
      !reportData &&
      areAllModalsClosed
    ) {
      telegram.WebApp.MainButton.show();
    } else {
      telegram.WebApp.MainButton.hide();
    }
  }, [
    isMiniApp,
    isFormValid,
    error,
    isLoadingReport,
    reportData,
    areAllModalsClosed,
  ]);

  // 🔹 Загрузка магазинов
  useEffect(() => {
    const fetchSalesData = async () => {
      setIsLoadingShops(true);
      try {
        const response = await client.api.evotor.shops.$post({
          json: { userId },
        });

        if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
        const data = await response.json();
        setShopOptions(data.shopOptions);
        // По умолчанию — все магазины. Грузим группы от первого магазина.
        const firstUuid = Object.keys(data.shopOptions)[0] ?? null;
        if (firstUuid) await fetchGroups(firstUuid);
      } catch (err) {
        console.error(err);
        setError("Не удалось загрузить магазины");
      } finally {
        setIsLoadingShops(false);
      }
    };
    if (userId) fetchSalesData();
  }, [userId]);

  // 🔹 Загрузка групп
  const fetchGroups = async (shopUuid: string | null) => {
    // Для «Все магазины» — грузим группы от первого магазина
    const targetUuid = shopUuid ?? Object.keys(shopOptions)[0] ?? null;
    if (!targetUuid) {
      setGroupOptions([]);
      setSelectedGroups([]);
      return;
    }
    setIsLoadingGroups(true);
    try {
      const response = await client.api.evotor["groups-by-shop"].$post({
        json: { shopUuid: targetUuid },
      });

      if (!response.ok)
        throw new Error(`Ошибка загрузки групп: ${response.status}`);
      const data = (await response.json()) as
        | { groups: GroupOption[] }
        | { code: string; message: string; details?: unknown };
      if (!("groups" in data)) {
        throw new Error(data.message || "Не удалось загрузить группы");
      }
      setGroupOptions(data.groups || []);
      setSelectedGroups([]);
    } catch (err) {
      console.error(err);
      setError("Не удалось загрузить группы для выбранного магазина");
    } finally {
      setIsLoadingGroups(false);
    }
  };

  // 🔹 Форматирование дат
  const formatDate = (date: Date) =>
    `${date.getDate().toString().padStart(2, "0")} ${date.toLocaleString(
      "default",
      {
        month: "short",
      }
    )}`;

  const formatPeriod = (
    shopName: string,
    startDate: string,
    endDate: string
  ): string => {
    const formattedStartDate = formatDate(new Date(startDate));
    const formattedEndDate = formatDate(new Date(endDate));
    return `${shopName}, ${formattedStartDate} → ${formattedEndDate}`;
  };

  // 🔹 Состояния загрузки / ошибки
  if (isLoadingReport) return <LoadingState />;
  if (error) return <ErrorState error={error} />;

  // 🔹 Нет магазинов
  if (!Object.keys(shopOptions).length) {
    return (
      <div className="app-page flex items-center justify-center bg-background">
        <LoadingState />
      </div>
    );
  }

  // 🔹 Отчёт готов
  if (reportData) {
    const { salesData, startDate, endDate, shopName } = reportData;
    const gridData: DeadStockTileItem[] = salesData.map((item) => {
      const costKey = `${item.itemId}|${item.shopId}`;
      const costs = costMap.get(costKey);
      return {
        itemId: item.itemId,
        name: item.name,
        article: item.article,
        quantity: item.quantity,
        sold: item.sold,
        lastSaleDate: item.lastSaleDate,
        daysWithoutSales: item.daysWithoutSales,
        shopId: item.shopId,
        shopName: item.shopName,
        unitCost: costs?.unitCost ?? null,
        totalFrozenCost: costs?.totalFrozenCost ?? null,
      };
    });

    const totalItems = gridData.length;
    const avgDays = totalItems > 0
      ? Math.round(gridData.reduce((s, i) => s + (i.daysWithoutSales >= 999 ? 0 : i.daysWithoutSales), 0) / totalItems)
      : 0;
    const critical = gridData.filter(i => i.daysWithoutSales >= 180).length;

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="app-page w-full bg-background text-foreground flex flex-col items-center"
      >
        <div className="w-full max-w-4xl px-3 sm:px-4 pt-2 pb-6 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-base sm:text-lg font-semibold">
                {formatPeriod(shopName, startDate, endDate)}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {totalItems} товаров без продаж
                {avgDays > 0 && ` · в среднем ${avgDays} дн.`}
                {critical > 0 && ` · ${critical} критичных`}
                {plannedActions.length > 0 && ` · ${plannedActions.length} запланировано`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {plannedActions.length > 0 && (
                <button
                  type="button"
                  onClick={() => downloadActionsCsv(plannedActions)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  Документ ({plannedActions.length})
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  manualReturnToFilters.current = true;
                  setReportData(null);
                  setPlannedActions([]);
                }}
                className="rounded-lg px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition"
              >
                Фильтры
              </button>
            </div>
          </div>

          {/* Grid tiles */}
          <DeadStockGrid
            data={gridData}
            shopUuid={selectedShops[0] ?? ""}
            onAction={(action) => setPlannedActions(prev => {
              // Replace if same item+shop already planned
              const key = `${action.itemId}|${action.shopId}`;
              const filtered = prev.filter(a => `${a.itemId}|${a.shopId}` !== key);
              return [...filtered, action];
            })}
            plannedActions={plannedActions}
          />
        </div>
      </motion.div>
    );
  }

  // 🔹 Основной экран — фильтры
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="app-page w-full px-4 sm:px-6 py-6 bg-background text-foreground flex flex-col items-center"
    >
      <motion.h1
        className="text-xl sm:text-2xl font-semibold mb-2"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        Мёртвые остатки
      </motion.h1>
      <p className="text-sm text-muted-foreground mb-6">
        Выберите период, магазин и группы товаров
      </p>
      <motion.div
        className="bg-card rounded-2xl shadow-sm p-4 sm:p-6 w-full max-w-3xl space-y-4 border border-border"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        {/* Выбор периода: две кнопки в стиле Сегодня/Вчера */}
        <div className="grid grid-cols-2 gap-2">
          {/* Кнопка 1: Выбрать период (календарь) */}
          <Popover
            open={showPeriodPicker}
            onOpenChange={(open) => {
              setShowPeriodPicker(open);
              setIsDatePickerOpen(open);
              if (!open) setTempPeriod(undefined);
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  setTempPeriod(period);
                  setShowPeriodPicker(true);
                  setIsDatePickerOpen(true);
                  setActivePreset(null);
                }}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  period?.from && period?.to
                    ? "border-primary bg-primary text-primary-foreground"
                    : startDate && endDate && !activePreset
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground"
                }`}
              >
                {period?.from && period?.to
                  ? `${formatDate(period.from)} → ${formatDate(period.to)}`
                  : startDate && endDate && !activePreset
                  ? `${formatDate(new Date(startDate))} → ${formatDate(new Date(endDate))}`
                  : "Выбрать период"}
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
                  className="px-3 py-1 rounded bg-primary text-primary-foreground text-sm"
                  disabled={!(tempPeriod?.from && tempPeriod?.to)}
                  onClick={() => {
                    setPeriod(tempPeriod);
                    setShowPeriodPicker(false);
                    setIsDatePickerOpen(false);
                    setActivePreset(null);
                  }}
                >
                  Применить
                </button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Кнопка 2: По месяцам (dropdown) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowPresetDropdown(!showPresetDropdown); setShowPeriodPicker(false); }}
              className={`w-full rounded-lg border px-3 py-2 text-sm transition ${
                activePreset
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground"
              }`}
            >
              {activePreset
                ? PRESETS.find(p => p.key === activePreset)?.label
                : "По месяцам"}
            </button>
            {showPresetDropdown && (
              <div
                className="absolute top-full mt-1 left-0 right-0 z-20 bg-card border border-border rounded-xl shadow-lg overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {PRESETS.map(p => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); applyPreset(p.key); }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition ${
                      activePreset === p.key
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-foreground hover:bg-secondary"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* Закрыть dropdown при клике вне */}
        {showPresetDropdown && (
          <div className="fixed inset-0 z-10" onClick={() => setShowPresetDropdown(false)} />
        )}

        <ShopFilter
          shops={shopOptions}
          selectedIds={selectedShops}
          onChange={(ids) => {
            setSelectedShops(ids);
            void fetchGroups(ids.length === 0 ? null : ids[0]);
          }}
          isLoading={isLoadingShops}
        />
        <GroupSelector
          groupOptions={groupOptions}
          selectedGroups={selectedGroups}
          setSelectedGroups={setSelectedGroups}
          isLoadingGroups={isLoadingGroups}
          onOpenChange={setIsGroupSelectorOpen}
        />
        {!isMiniApp && (
          <motion.button
            onClick={submitForecast}
            className={`w-full py-3 rounded-xl font-medium text-white transition ${
              isFormValid
                ? "bg-primary hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
            disabled={!isFormValid}
            whileHover={{ scale: isFormValid ? 1.03 : 1 }}
            whileTap={{ scale: isFormValid ? 0.97 : 1 }}
          >
            Сгенерировать отчёт
          </motion.button>
        )}
      </motion.div>
    </motion.div>
  );
}
