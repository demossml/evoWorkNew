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

export function getTempoSettingsChangedEventName() {
  return SETTINGS_CHANGED_EVENT;
}

