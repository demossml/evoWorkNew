import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

export function PWAInstall() {
  // Не регистрируем Service Worker в dev-режиме
  if (import.meta.env.DEV) return null;

  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW();

  useEffect(() => {
    if (offlineReady) {
      console.log("✅ Приложение готово к офлайн-работе");
    }
    if (needRefresh) {
      console.log("♻️ Доступна новая версия, обновляем…");
      updateServiceWorker();
    }
  }, [offlineReady, needRefresh, updateServiceWorker]);

  return null;
}
