import { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,           // данные «свежие» 30с
      gcTime: 24 * 60 * 60_000,    // держать в памяти/диске до 24ч
      retry: 1,
      refetchOnWindowFocus: true,  // при возврате в PWA — обновить
      refetchOnReconnect: true,
      refetchOnMount: true,        // mount = показать cache + refetch если stale
    },
  },
});

// Persist React Query cache в localStorage (instant shell для PWA).
// Не роняет app при превышении quota.
const PERSIST_KEY = "evo-rq-cache-v1";

try {
  if (typeof window !== "undefined" && window.localStorage) {
    const persister = createSyncStoragePersister({
      storage: window.localStorage,
      key: PERSIST_KEY,
      throttleTime: 1_000,
    });

    persistQueryClient({
      queryClient,
      persister,
      maxAge: 24 * 60 * 60_000,
      buster: "v1",
      dehydrateOptions: {
        shouldDehydrateQuery: (query) => {
          if (query.state.status !== "success") return false;
          // не персистить чувствительные/тяжёлые ключи
          const key0 = String(query.queryKey[0] ?? "");
          if (key0 === "product-profile" || key0 === "focus-category-sales") return false;
          return true;
        },
      },
    });
  }
} catch (error) {
  console.warn("[queryClient] persist init failed:", error);
}
