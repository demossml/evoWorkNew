import { useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { useEmployeeRole } from "../../hooks/useApi";
import { client } from "../../helpers/api";
import { Calendar, Popover, PopoverContent, PopoverTrigger } from "../../components/ui";

interface OpeningsSummary {
  startDate: string;
  endDate: string;
  totalShops: number;
  openedShops: number;
  notOpenedShops: number;
  avgCompletion: number;
  withCashDiscrepancy: number;
  missingPhotos: number;
}

interface OpeningRecord {
  shopUuid: string;
  shopName: string;
  employeeId: string;
  employeeName: string;
  openedAt: string;
  isLate?: boolean;
  photoCount: number;
  requiredPhotoCount: number;
  hasCashCheck: boolean;
  cashStatus: "not_checked" | "ok" | "surplus" | "shortage";
  cashMessage: string | null;
  completionPercent: number;
}

interface OpeningsReportResponse {
  summary: OpeningsSummary;
  records: OpeningRecord[];
}

interface OpeningPhoto {
  key: string;
  url: string;
  category: string;
}

const cashStatusLabel: Record<OpeningRecord["cashStatus"], string> = {
  not_checked: "Не проверена",
  ok: "Сходится",
  surplus: "Излишек",
  shortage: "Недостача",
};

export default function StoreOpeningsAdminReport() {
  useTelegramBackButton();

  const { data: roleData } = useEmployeeRole();
  const isSuperAdmin = roleData?.employeeRole === "SUPERADMIN";

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [dateMode, setDateMode] = useState<"today" | "yesterday" | "period">(
    "today"
  );
  const [period, setPeriod] = useState<DateRange | undefined>(undefined);
  const [tempPeriod, setTempPeriod] = useState<DateRange | undefined>(undefined);
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);
  const [shopSearch, setShopSearch] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<OpeningsReportResponse | null>(null);
  const [previewRow, setPreviewRow] = useState<OpeningRecord | null>(null);
  const [previewPhotos, setPreviewPhotos] = useState<OpeningPhoto[]>([]);
  const [isPhotosLoading, setIsPhotosLoading] = useState(false);
  const [photosError, setPhotosError] = useState<string | null>(null);

  const categoryTitle: Record<string, string> = {
    area: "Территория",
    stock: "Витрина",
    cash: "Касса",
    mrc: "МРЦ",
    other: "Прочее",
  };

  const categoryOrder = ["area", "stock", "cash", "mrc", "other"];
  const formatDate = (date: Date) =>
    date.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  useEffect(() => {
    const now = new Date();
    const formatDate = (date: Date) => date.toISOString().slice(0, 10);

    if (dateMode === "today") {
      const d = formatDate(now);
      setStartDate(d);
      setEndDate(d);
      return;
    }

    if (dateMode === "yesterday") {
      const date = new Date(now);
      date.setDate(now.getDate() - 1);
      const d = formatDate(date);
      setStartDate(d);
      setEndDate(d);
      setShowPeriodPicker(false);
      setPeriod(undefined);
      setTempPeriod(undefined);
      return;
    }

    if (dateMode !== "period") {
      setShowPeriodPicker(false);
      setPeriod(undefined);
      setTempPeriod(undefined);
    }
  }, [dateMode]);

  useEffect(() => {
    if (dateMode !== "period" || !period?.from || !period?.to) return;
    const formatLocalDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };
    setStartDate(formatLocalDate(period.from));
    setEndDate(formatLocalDate(period.to));
  }, [dateMode, period]);

  const loadReport = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await client.api.stores["openings-report"].$post({
        json: { startDate, endDate },
      });
      if (!response.ok) {
        throw new Error(`Ошибка загрузки отчета: ${response.status}`);
      }
      const data = (await response.json()) as OpeningsReportResponse;
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить отчет");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      void loadReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  const filteredRecords = useMemo(() => {
    const records = report?.records ?? [];
    const search = shopSearch.trim().toLowerCase();

    return records.filter((row) => {
      const matchesSearch =
        !search ||
        row.shopName.toLowerCase().includes(search) ||
        row.employeeName.toLowerCase().includes(search);
      const hasIssue =
        row.completionPercent < 100 ||
        row.photoCount < row.requiredPhotoCount ||
        row.cashStatus === "surplus" ||
        row.cashStatus === "shortage" ||
        row.cashStatus === "not_checked";
      return matchesSearch && (!onlyIssues || hasIssue);
    });
  }, [report?.records, shopSearch, onlyIssues]);

  const loadPhotos = async (row: OpeningRecord) => {
    setPreviewRow(row);
    setIsPhotosLoading(true);
    setPhotosError(null);
    setPreviewPhotos([]);
    try {
      const response = await client.api.stores["opening-photos"].$post({
        json: {
          shopUuid: row.shopUuid,
          userId: row.employeeId,
          openedAt: row.openedAt,
        },
      });
      if (!response.ok) {
        throw new Error(`Ошибка загрузки фото: ${response.status}`);
      }
      const data = (await response.json()) as { photos?: OpeningPhoto[] };
      setPreviewPhotos(Array.isArray(data.photos) ? data.photos : []);
    } catch (err) {
      setPhotosError(err instanceof Error ? err.message : "Не удалось загрузить фото");
    } finally {
      setIsPhotosLoading(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="app-page p-4">
        <div className="max-w-3xl mx-auto rounded-xl bg-red-50 border border-red-200 p-4 text-red-700">
          Доступ только для SUPERADMIN.
        </div>
      </div>
    );
  }

  return (
    <div className="app-page p-4 pb-6 bg-background text-foreground">
      <div className="max-w-6xl mx-auto space-y-4">
        <h1 className="text-xl font-semibold">Отчёт по открытиям магазинов</h1>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-card rounded-xl p-4 border border-border">
          <div className="md:col-span-4 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setDateMode("today")}
              className={`h-10 rounded-lg border text-sm font-semibold ${
                dateMode === "today"
                  ? "bg-primary text-white border-blue-600"
                  : "border-border"
              }`}
            >
              Сегодня
            </button>
            <button
              type="button"
              onClick={() => setDateMode("yesterday")}
              className={`h-10 rounded-lg border text-sm font-semibold ${
                dateMode === "yesterday"
                  ? "bg-primary text-white border-blue-600"
                  : "border-border"
              }`}
            >
              Вчера
            </button>
            <Popover
              open={showPeriodPicker}
              onOpenChange={(open) => {
                setShowPeriodPicker(open);
                if (!open) {
                  setTempPeriod(period);
                }
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    setDateMode("period");
                    setTempPeriod(period);
                    setShowPeriodPicker(true);
                  }}
                  className={`h-10 rounded-lg border text-sm font-semibold ${
                    dateMode === "period"
                      ? "bg-primary text-white border-blue-600"
                      : "border-border"
                  }`}
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
                <div className="flex items-center justify-end gap-2 p-2 border-t border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    className="px-3 py-1 rounded bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100"
                    onClick={() => {
                      setTempPeriod(period);
                      setShowPeriodPicker(false);
                    }}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1 rounded bg-primary text-white disabled:bg-gray-400"
                    disabled={!(tempPeriod?.from && tempPeriod?.to)}
                    onClick={() => {
                      setPeriod(tempPeriod);
                      setShowPeriodPicker(false);
                    }}
                  >
                    Применить
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          {dateMode === "period" && period?.from && period?.to && (
            <div className="md:col-span-4 text-sm text-slate-600 dark:text-slate-300">
              {formatDate(period.from)} → {formatDate(period.to)}
            </div>
          )}
          <div className="md:col-span-4 flex items-end gap-2">
            <button
              onClick={() => void loadReport()}
              disabled={isLoading || endDate < startDate}
              className="w-full md:w-auto px-4 py-2 rounded-lg bg-primary text-white disabled:bg-gray-400"
            >
              {isLoading ? "Загрузка..." : "Обновить отчет"}
            </button>
          </div>
          <div className="md:col-span-3">
            <label className="block text-sm mb-1">Поиск (магазин/сотрудник)</label>
            <input
              type="text"
              value={shopSearch}
              onChange={(e) => setShopSearch(e.target.value)}
              placeholder="Например: Победа или Карина"
              className="w-full rounded-lg border p-2 bg-card"
            />
          </div>
          <label className="md:col-span-1 flex items-center gap-2 text-sm mt-6 md:mt-0">
            <input
              type="checkbox"
              checked={onlyIssues}
              onChange={(e) => setOnlyIssues(e.target.checked)}
            />
            Только проблемные
          </label>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="text-sm text-muted-foreground">
          Показано записей: {filteredRecords.length}
        </div>

        <div className="hidden md:block overflow-x-auto rounded-xl bg-card border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-2">Магазин</th>
                <th className="text-left p-2">Сотрудник</th>
                <th className="text-left p-2">Открыт</th>
                <th className="text-left p-2">Фото</th>
                <th className="text-left p-2">Просмотр</th>
                <th className="text-left p-2">Касса</th>
                <th className="text-left p-2">Выполнение</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length ? (
                filteredRecords.map((row) => (
                  <tr key={`${row.shopUuid}-${row.openedAt}`} className="border-t border-border">
                    <td className="p-2">{row.shopName}</td>
                    <td className="p-2">{row.employeeName}</td>
                    <td className={`p-2${row.isLate ? " text-red-600 dark:text-red-400 font-semibold" : ""}`}>
                      {new Date(row.openedAt).toLocaleString("ru-RU")}
                      {row.isLate ? " ⚠️ опоздание" : ""}
                    </td>
                    <td className="p-2">{row.photoCount}/{row.requiredPhotoCount}</td>
                    <td className="p-2">
                      <button
                        type="button"
                        onClick={() => void loadPhotos(row)}
                        className="px-2 py-1 rounded-md bg-primary text-white text-xs"
                      >
                        Смотреть фото
                      </button>
                    </td>
                    <td className="p-2">{cashStatusLabel[row.cashStatus]}{row.cashMessage ? ` (${row.cashMessage})` : ""}</td>
                    <td className="p-2">{row.completionPercent}%</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-gray-500">
                    Нет данных за выбранный период
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="md:hidden space-y-3">
          {filteredRecords.length ? (
            filteredRecords.map((row) => (
              <div
                key={`${row.shopUuid}-${row.openedAt}`}
                className="rounded-xl bg-card border border-border p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{row.shopName}</div>
                  <div className="text-xs text-gray-500">{row.completionPercent}%</div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {row.employeeName}
                </div>
                <div className={`text-xs${row.isLate ? " text-red-600 dark:text-red-400 font-semibold" : " text-muted-foreground"}`}>
                  {new Date(row.openedAt).toLocaleString("ru-RU")}
                  {row.isLate ? " ⚠️ опоздание" : ""}
                </div>
                <div className="text-sm">
                  Фото: {row.photoCount}/{row.requiredPhotoCount}
                </div>
                <div className="text-sm">
                  Касса: {cashStatusLabel[row.cashStatus]}
                  {row.cashMessage ? ` (${row.cashMessage})` : ""}
                </div>
                <button
                  type="button"
                  onClick={() => void loadPhotos(row)}
                  className="w-full px-2 py-2 rounded-md bg-primary text-white text-sm"
                >
                  Смотреть фото
                </button>
              </div>
            ))
          ) : (
            <div className="rounded-xl bg-card border border-border p-4 text-center text-gray-500">
              Нет данных за выбранный период
            </div>
          )}
        </div>
      </div>

      {previewRow && (
        <div className="fixed inset-0 z-[70] bg-black/50 p-4 overflow-y-auto">
          <div className="max-w-5xl mx-auto bg-card rounded-xl border border-border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Фото открытия: {previewRow.shopName}
              </h2>
              <button
                type="button"
                onClick={() => setPreviewRow(null)}
                className="px-3 py-1 rounded-md bg-muted"
              >
                Закрыть
              </button>
            </div>

            {isPhotosLoading && (
              <div className="text-sm text-gray-500">Загрузка фото...</div>
            )}

            {photosError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {photosError}
              </div>
            )}

            {!isPhotosLoading && !photosError && previewPhotos.length === 0 && (
              <div className="text-sm text-gray-500">Фото не найдены</div>
            )}

            {previewPhotos.length > 0 && (
              <div className="space-y-4">
                {categoryOrder.map((category) => {
                  const categoryPhotos = previewPhotos.filter(
                    (photo) => (photo.category || "other") === category,
                  );
                  if (!categoryPhotos.length) return null;

                  return (
                    <div key={category} className="space-y-2">
                      <h3 className="text-sm font-semibold">
                        {categoryTitle[category] || category}
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {categoryPhotos.map((photo, idx) => {
                          const slotLabel =
                            category === "area"
                              ? `Территория #${idx + 1}`
                              : category === "stock"
                                ? `Витрина #${idx + 1}`
                                : category === "cash"
                                  ? "Касса"
                                  : category === "mrc"
                                    ? "МРЦ"
                                    : `Фото #${idx + 1}`;

                          return (
                            <a
                              key={photo.key}
                              href={photo.url}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded-lg overflow-hidden border border-border bg-background"
                            >
                              <img
                                src={photo.url}
                                alt={slotLabel}
                                className="w-full h-40 object-cover"
                                loading="lazy"
                              />
                              <div className="px-2 py-1 text-xs text-muted-foreground">
                                {slotLabel}
                              </div>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
