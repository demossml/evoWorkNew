import { useEffect, useState } from "react";
import { useMe } from "../../hooks/useApi";
import { ErrorState, LoadingState } from "@shared/ui/states";
import { DynamicTable, GroupSelector, ShopSelector } from "@widgets/reports";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { client } from "../../helpers/api";

interface GroupOption {
  name: string;
  uuid: string;
}

interface ReportData {
  stockData: Record<string, { sum: number; quantity: number }>;
  shopName: string;
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
    // Проверяем, что все необходимые данные выбраны
    if (!selectedShop || selectedGroups.length === 0) {
      alert("Пожалуйста, выберите все параметры для формирования прогноза.");
      return;
    }
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
        throw new Error(`Ошибка: ${response.status}`);
      }

      const report: ReportData = await response.json();
      setReportData(report);
    } catch (err) {
      console.error(err);
      setError("Не удалось получить отчёт");
    } finally {
      setIsLoadingReport(false);
    }
  };

  if (isLoadingReport) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  if (!Object.keys(shopOptions).length) {
    return (
      <div className="app-page flex flex-col items-center justify-center bg-custom-gray p-4">
        <div className="flex items-center mb-4">
          <div className="w-24 h-24 border-8 border-t-transparent border-blue-500 border-solid rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (reportData) {
    const { stockData, shopName } = reportData;

    const tableData = Object.entries(stockData).map(
      ([productName, { sum, quantity }]) => ({
        productName,
        quantity,
        sum,
      })
    );
    return (
      <div className="p-4 flex flex-col items-start bg-custom-gray dark:bg-gray-900 gap-4 max-w-md mx-auto">
        {/* Заголовок с информацией */}
        <div className="text-sm text-gray-700 dark:text-gray-400">
          <p className="font-semibold">{shopName}</p>
        </div>
        {/* Таблица */}
        <DynamicTable data={tableData} /> {/* Передаем данные в DynamicTable */}
      </div>
    );
  }

  return (
    <div className="app-page-scroll px-4 bg-custom-gray dark:text-gray-400 dark:bg-gray-900">
      <h1 className="text-xl font-bold"> Товарные остатки</h1>

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

      {/* Кнопка "Сформировать прогноз" */}
      <button
        onClick={submitForecast} // Вызываем функцию отправки данных
        className={`w-full p-2 rounded-md text-white mt-8 ${
          selectedShop && selectedGroups.length
            ? "bg-blue-500 hover:bg-blue-600 dark:bg-blue-400 dark:hover:bg-blue-500"
            : "bg-gray-300 dark:bg-gray-700"
        }`}
        disabled={
          !(selectedShop && selectedGroups.length) // Блокируем кнопку, если не выбраны все параметры
        }
      >
        Сгенерировать отчет
      </button>
    </div>
  );
}
