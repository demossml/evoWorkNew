export type StoreOpeningStep = "shop" | "initial" | "photos" | "cash_check";

interface OpeningProgress {
  step: StoreOpeningStep;
  date: string; // YYYY-MM-DD
  shopUuid?: string;
  shopName?: string;
}

/**
 * Сохраняем шаг на сегодня
 */
export function saveProgress(
  step: StoreOpeningStep,
  shopUuid?: string,
  shopName?: string,
) {
  const today = new Date().toISOString().slice(0, 10);

  const data: OpeningProgress = {
    step,
    date: today,
    shopUuid,
    shopName,
  };

  localStorage.setItem("openingProgress", JSON.stringify(data));
}

/**
 * Загружаем шаг
 */
export function loadProgress(): OpeningProgress | null {
  try {
    const raw = localStorage.getItem("openingProgress");
    if (!raw) return null;

    return JSON.parse(raw) as OpeningProgress;
  } catch {
    return null;
  }
}

/**
 * Очистить прогресс (если нужен сброс)
 */
export function clearProgress() {
  localStorage.removeItem("openingProgress");
}
