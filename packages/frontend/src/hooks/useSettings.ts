/**
 * useSettings.ts — хук для чтения и обновления настроек из API.
 *
 * Позволяет:
 * - Получить все настройки: useSettings()
 * - Получить одну: useSetting("key")
 * - Обновить: updateSetting("key", "value")
 * - Пакетно: batchUpdate([{ key, value }])
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

export interface AppSetting {
  key: string;
  value: string;
  type: string;
  category: string;
  label: string;
  description: string;
  updated_at: string;
}

const SETTINGS_URL = "/api/settings";

// ─── Fetch helpers ────────────────────────────────────────────────────

async function fetchSettings(): Promise<AppSetting[]> {
  const res = await fetch(SETTINGS_URL, { headers: { initData: "guest" } });
  if (!res.ok) throw new Error("Ошибка загрузки настроек");
  return res.json();
}

async function putSetting(key: string, value: string): Promise<void> {
  const res = await fetch(`${SETTINGS_URL}/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", initData: "guest" },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || `Ошибка сохранения: ${res.status}`);
  }
}

async function postBatchSettings(updates: Array<{ key: string; value: string }>): Promise<void> {
  const res = await fetch(`${SETTINGS_URL}/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", initData: "guest" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || `Ошибка сохранения: ${res.status}`);
  }
}

// ─── Query key ────────────────────────────────────────────────────────

export const settingsKeys = {
  all: ["settings"] as const,
  one: (key: string) => ["settings", key] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────

/** Получить все настройки (кешируется) */
export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: fetchSettings,
    staleTime: 60_000,
  });
}

/** Получить одну настройку по ключу */
export function useSetting(key: string) {
  return useQuery({
    queryKey: settingsKeys.one(key),
    queryFn: async () => {
      const all = await fetchSettings();
      return all.find((s) => s.key === key) ?? null;
    },
    staleTime: 60_000,
  });
}

/** Получить значение настройки как число (с fallback) */
export function useNumberSetting(key: string, fallback: number): number {
  const { data: setting } = useSetting(key);
  if (!setting) return fallback;
  const n = Number(setting.value);
  return Number.isFinite(n) ? n : fallback;
}

/** Получить значение настройки как JSON (с fallback) */
export function useJsonSetting<T>(key: string, fallback: T): T {
  const { data: setting } = useSetting(key);
  if (!setting) return fallback;
  try {
    return JSON.parse(setting.value) as T;
  } catch {
    return fallback;
  }
}

// ─── Mutations ────────────────────────────────────────────────────────

export function useUpdateSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => putSetting(key, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}

export function useBatchUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: Array<{ key: string; value: string }>) =>
      postBatchSettings(updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}

// ─── Convenience ──────────────────────────────────────────────────────

/**
 * Возвращает объект со всеми настройками как Map<key, string>.
 * Удобно для рендера: settingsMap.get("margin_green")
 */
export function useSettingsMap(): Map<string, AppSetting> {
  const { data } = useSettings();
  const map = new Map<string, AppSetting>();
  if (data) for (const s of data) map.set(s.key, s);
  return map;
}

/**
 * Горячее обновление настройки без хука (для useCallback / обработчиков).
 */
export function getQuickUpdater() {
  return { putSetting, postBatchSettings };
}
