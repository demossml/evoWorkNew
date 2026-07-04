import { useMemo, useState } from "react";
import { fetchOpeningPhotoDigest } from "@features/dashboard/api";

type EmployeeRole = "SUPERADMIN" | "ADMIN" | "CASHIER" | "null";

type ShopDigest = {
  shopUuid: string;
  shopName: string;
  openedAt: string;
  openedByName: string | null;
  photoCount: number;
  digest: string;
  photos: Array<{
    key: string;
    category: string;
    description: string;
  }>;
};

type DigestResponse = {
  date: string;
  models?: {
    describe: string;
    summarize: string;
  };
  shops: ShopDigest[];
};

const getTodayIsoDate = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export function OpeningPhotoDigestWidget({ employeeRole }: { employeeRole: EmployeeRole }) {
  const [date, setDate] = useState(getTodayIsoDate());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DigestResponse | null>(null);

  const title = useMemo(
    () =>
      employeeRole === "SUPERADMIN"
        ? "AI-анализ утренних фото (все магазины)"
        : "AI-анализ утренних фото (ваш магазин)",
    [employeeRole]
  );

  const runDigest = async () => {
    setLoading(true);
    setError(null);
    try {
      const body = (await fetchOpeningPhotoDigest(date)) as DigestResponse;
      setResult(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки AI-дайджеста");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-slate-700/50 bg-slate-900/60 p-4 text-slate-100">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-xs text-slate-400">
            Модель 1 описывает каждое фото, модель 2 собирает итоговый дайджест по магазину.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={runDigest}
            disabled={loading}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Анализ..." : "Запустить AI-анализ"}
          </button>
        </div>
      </div>

      {error && <div className="mt-3 rounded-md bg-red-500/15 p-2 text-sm text-red-300">{error}</div>}

      {result && (
        <div className="mt-4 space-y-3">
          {result.models && (
            <div className="text-xs text-slate-400">
              Модели: {result.models.describe} + {result.models.summarize}
            </div>
          )}

          {result.shops.length === 0 && (
            <div className="rounded-md border border-slate-700 p-3 text-sm text-slate-300">
              За выбранную дату фото открытия не найдены.
            </div>
          )}

          {result.shops.map((shop) => (
            <div key={shop.shopUuid} className="rounded-lg border border-slate-700 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{shop.shopName}</span>
                <span className="text-slate-400">Фото: {shop.photoCount}</span>
                <span className="text-slate-400">Открыл: {shop.openedByName || "—"}</span>
              </div>

              <p className="rounded-md bg-slate-800/70 p-2 text-sm leading-relaxed">{shop.digest}</p>

              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-slate-300">Показать описания фото</summary>
                <div className="mt-2 space-y-2">
                  {shop.photos.map((photo) => (
                    <div key={photo.key} className="rounded-md bg-slate-800/50 p-2 text-xs">
                      <div className="mb-1 text-slate-400">[{photo.category}] {photo.key.split("/").pop()}</div>
                      <div>{photo.description}</div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
