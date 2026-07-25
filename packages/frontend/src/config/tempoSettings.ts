/**
 * tempoSettings.ts — настройки темпа продаж.
 *
 * Приоритет: API (/api/settings → ключ accessory_share_target) → localStorage → DEFAULT.
 *
 * Синхронные функции (getAccessoryShareTargetPct) читают localStorage.
 * Для чтения из API используй хук useNumberSetting("accessory_share_target", 12).
 */

export const DEFAULT_ACCESSORY_SHARE_TARGET_PCT = 12;
const ACCESSORY_SHARE_TARGET_KEY = "tempo.accessoryShareTargetPct";
const SETTINGS_CHANGED_EVENT = "tempo-settings-changed";

function clampTarget(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ACCESSORY_SHARE_TARGET_PCT;
  return Math.min(100, Math.max(1, Math.round(value)));
}

export function getAccessoryShareTargetPct(): number {
  if (typeof window === "undefined") return DEFAULT_ACCESSORY_SHARE_TARGET_PCT;
  const raw = window.localStorage.getItem(ACCESSORY_SHARE_TARGET_KEY);
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed)) return DEFAULT_ACCESSORY_SHARE_TARGET_PCT;
  return clampTarget(parsed);
}

export function setAccessoryShareTargetPct(value: number): number {
  if (typeof window === "undefined") return clampTarget(value);
  const next = clampTarget(value);
  window.localStorage.setItem(ACCESSORY_SHARE_TARGET_KEY, String(next));
  window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT));
  return next;
}

/** Синхронизировать localStorage с API-значением (вызывается при загрузке страницы). */
export function syncAccessoryTargetFromApi(apiValue: number): void {
  if (typeof window === "undefined") return;
  const next = clampTarget(apiValue);
  window.localStorage.setItem(ACCESSORY_SHARE_TARGET_KEY, String(next));
  window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT));
}

export function getTempoSettingsChangedEventName() {
  return SETTINGS_CHANGED_EVENT;
}

