import { useEffect, useState } from "react";
import { useMe } from "../../hooks/useApi";
import { LoadingState } from "@shared/ui/states";
import { GroupSelector, ShopSelector } from "@widgets/reports";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { client } from "../../helpers/api";
import { HelpButton } from "@shared/help/HelpSheet";

const fmtQty = (n: number) =>
  Math.round(Number(n) || 0).toLocaleString("ru-RU");
const fmtSum = (n: number) =>
  (Number(n) || 0).toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

interface GroupOption {
  name: string;
  uuid: string;
}

interface StockItem {
  name: string;
  quantity: number;
  sum: number;
  groupName?: string;
  article?: string;
}

interface ReportData {
  shopName: string;
  items: StockItem[];
  totals: { skuCount: number; quantity: number; sum: number };
  stockData?: Record<string, { sum: number; quantity: number }>;
}

export default function QuantityTableProps() {
  const [shopOptions, setShopOptions] = useState<Record<string, string>>({});
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState<boolean>(false);

  const [isLoadingShops, setIsLoadingShops] = useState<boolean>(false);
  const [selectedShop, setSelectedShop] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"quantity" | "sum">("quantity");

  const { data } = useMe();
  const userId = data?.id.toString();

  useTelegramBackButton();

  useEffect(() => {
    const fetchSalesData = async () => {
      setIsLoadingShops(true); // Начало загрузки групп

      try {
        const response = await client.api.evotor.shops.$post({
          json: {
            userId: userId || "",
          },
        });

        if (!response.ok) {
          throw new Error(`Ошибка: ${response.status}`);
        }

        const data = await response.json();
        setShopOptions(data.shopOptions);

        // Если магазины есть, устанавливаем первый магазин как выбранный
        if (Object.keys(data.shopOptions).length > 0) {
          const defaultShopUuid = Object.keys(data.shopOptions)[0];
          setSelectedShop(defaultShopUuid); // Устанавливаем первый магазин как выбранный
          await fetchGroups(defaultShopUuid); // Получаем группы для первого магазина
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoadingShops(false); // Завершение загрузки групп
      }
    };

    if (userId) {
      fetchSalesData();
    }
  }, [userId]);

  const fetchGroups = async (shopUuid: string) => {
    setIsLoadingGroups(true); // Начало загрузки групп
    try {
      const dataGroups = {
        shopUuid: shopUuid,
      };
      const response = await client.api.evotor["groups-by-shop"].$post({
        json: dataGroups,
      });

      if (!response.ok) {
        throw new Error(`Ошибка загрузки групп: ${response.status}`);
      }

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
      setIsLoadingGroups(false); // Завершение загрузки групп
    }
  };

  const submitForecast = async () => {
    if (!selectedShop || selectedGroups.length === 0) {
      setError("Выберите магазин и хотя бы одну группу товаров.");
      return;
    }
    setError(null);

    const data = {
      shopUuid: selectedShop,
      groups: selectedGroups,
    };

    setIsLoadingReport(true);

    try {
      const response = await client.api.evotor["stock-report"].$post({
        json: data,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(
          (errData as any)?.error ||
            (errData as any)?.message ||
            `Ошибка: ${response.status}`
        );
      }

      const report: ReportData = await response.json();
      setReportData(report);
    } catch (err) {
      console.error(err);
      setError((err as Error)?.message || "Не удалось получить отчёт");
    } finally {
      setIsLoadingReport(false);
    }
  };

  if (isLoadingReport) {
    return <LoadingState />;
  }

  if (!Object.keys(shopOptions).length) {
    return (
      <div className="app-page flex flex-col items-center justify-center bg-custom-gray p-4">
        <div className="flex items-center mb-4">
          <div className="w-24 h-24 border-8 border-t-transparent border-primary border-solid rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (reportData) {
    const { shopName, items, totals } = reportData;
    const q = search.trim().toLowerCase();
    const filtered = (items || [])
      .filter((it) => !q || it.name.toLowerCase().includes(q))
      .sort((a, b) =>
        sortBy === "sum" ? b.sum - a.sum : b.quantity - a.quantity
      );

    return (
      <div className="app-page w-full px-4 sm:px-6 py-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{shopName}</h1>
            <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
              {totals?.skuCount ?? filtered.length} SKU · {fmtQty(totals?.quantity ?? 0)} шт · {fmtSum(totals?.sum ?? 0)} ₽
            </p>
          </div>
          <button
            onClick={() => {
              setReportData(null);
              setSearch("");
            }}
            className="shrink-0 text-sm text-blue-600 dark:text-blue-400"
          >
            Новый отчёт
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию"
            className="flex-1 min-w-0 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "quantity" | "sum")}
            className="shrink-0 rounded-lg border border-border bg-card px-2 py-2 text-sm text-foreground"
          >
            <option value="quantity">По кол-ву</option>
            <option value="sum">По сумме</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Нет остатков по выбранным группам
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((it, idx) => (
              <div
                key={`${it.name}-${idx}`}
                className="rounded-xl border border-border bg-card p-3"
              >
                <div className="text-sm text-foreground break-words leading-snug">
                  {it.name}
                  {it.groupName ? (
                    <span className="text-xs text-muted-foreground ml-1">
                      · {it.groupName}
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                  {fmtQty(it.quantity)} шт · {fmtSum(it.sum)} ₽
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-page-scroll px-4 bg-custom-gray dark:text-muted-foreground dark:bg-background">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold"> Товарные остатки</h1>
        <HelpButton helpId="stock-report" />
      </div>

      <div className="w-full">
        {/* Передаем userId как строку, даже если он пустой */}
        <ShopSelector
          shopOptions={shopOptions}
          isLoadingShops={isLoadingShops}
          fetchGroups={fetchGroups}
          selectedShop={selectedShop} // Передаем текущее состояние выбранного магазина
          setSelectedShop={setSelectedShop} // Передаем функцию для обновления выбранного магазина
        />
      </div>
      {/* Выбор группы */}
      <div className="w-full">
        <GroupSelector
          groupOptions={groupOptions} // Передаем данные групп
          selectedGroups={selectedGroups} // Передаем выбранные группы
          setSelectedGroups={setSelectedGroups} // Функция для обновления выбранных групп
          isLoadingGroups={isLoadingGroups} // Флаг загрузки
        />
      </div>

      {/* Кнопка формирования отчёта по остаткам */}
      <button
        onClick={submitForecast}
        className={`w-full p-2 rounded-md text-white mt-8 ${
          selectedShop && selectedGroups.length
            ? "bg-blue-500 hover:bg-primary dark:bg-blue-400 dark:hover:bg-blue-500"
            : "bg-muted"
        }`}
        disabled={!(selectedShop && selectedGroups.length)}
      >
        Сгенерировать отчёт
      </button>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300 mt-3">
          {error}
        </div>
      )}
    </div>
  );
}
