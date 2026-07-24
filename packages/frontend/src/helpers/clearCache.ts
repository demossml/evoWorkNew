/**
 * clearCache.ts — очистка всех кешей при logout / смене пользователя.
 * Предотвращает утечку данных между пользователями на общих устройствах.
 */

export async function clearAllCaches(): Promise<void> {
  // Очистка через Service Worker
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "CLEAR_CACHE" });
  }

  // Очистка Cache Storage напрямую (если SW ещё не готов)
  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((n) => n.includes("api-cache") || n.includes("dashboard-cache"))
        .map((n) => caches.delete(n)),
    );
  }
}
