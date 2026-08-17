import { hc } from "hono/client";
import { telegram } from "../../helpers/telegram";
import { createTraceId, trackEvent } from "../../helpers/analytics";

if (import.meta.env.DEV) {
  console.log("telegram.WebApp.initData:", telegram.WebApp.initData);
}

// Dev-only: авто-логин под супер-админом, если браузер «чистый»
// (встроенный браузер VS Code не имеет Telegram initData и localStorage).
if (import.meta.env.DEV && window.location.hostname === "localhost") {
  if (!localStorage.getItem("sessionId") && !localStorage.getItem("telegramId")) {
    localStorage.setItem("telegramId", "5700958253"); // SUPERADMIN (legacy)
  }
}

/**
 * Единые auth-заголовки для всех fetch:
 *  1) Bearer-сессия (login/connect-token);
 *  2) legacy Telegram (telegram-id);
 *  3) initData: реальный WebApp initData, иначе "guest".
 * Использовать везде: AuthCard, UsersAccessCard, Settings.
 */
export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const sessionId = localStorage.getItem("sessionId");
  if (sessionId) {
    headers["Authorization"] = `Bearer ${sessionId}`;
  }

  const telegramId = localStorage.getItem("telegramId");
  if (telegramId) {
    headers["telegram-id"] = telegramId;
  }

  const tgInit =
    typeof window !== "undefined" &&
    (window as any).Telegram?.WebApp?.initData;
  headers["initData"] =
    tgInit && String(tgInit).length > 0 ? String(tgInit) : "guest";

  return headers;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const client = hc<any>("", {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const DEFAULT_TIMEOUT_MS = 15000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const traceId = createTraceId();

    // Свежие auth-заголовки на КАЖДЫЙ запрос:
    // после login (sessionId в localStorage) заголовки обновляются без reload.
    const auth = getAuthHeaders();
    const isFormData =
      typeof FormData !== "undefined" && init?.body instanceof FormData;
    if (isFormData) {
      // Для FormData браузер сам выставит multipart boundary
      delete auth["Content-Type"];
    }

    const url = typeof input === "string" ? input : input.toString();
    const endpoint = (() => {
      try {
        return new URL(url, window.location.origin).pathname;
      } catch {
        return url;
      }
    })();
    const isReportEndpoint =
      endpoint.includes("/api/evotor/sales-result") ||
      endpoint.includes("/api/evotor/sales-garden-report") ||
      endpoint.includes("/api/evotor/profit-report") ||
      endpoint.includes("/api/evotor/stock-report") ||
      endpoint.includes("/api/evotor/order") ||
      endpoint.includes("/api/evotor/financial") ||
      endpoint.includes("/api/evotor/sales-report") ||
      endpoint.includes("/api/stores/openings-report");

    if (init?.signal) {
      init.signal.addEventListener("abort", () => controller.abort());
    }

    if (isReportEndpoint) {
      void trackEvent("report_run_started", {
        traceId,
        props: { endpoint },
      });
    }

    const nextInit: RequestInit = {
      ...init,
      headers: {
        ...auth,
        ...(init?.headers || {}),
        "x-trace-id": traceId,
      },
      signal: controller.signal,
    };

    return fetch(input, nextInit)
      .then((response) => {
        if (isReportEndpoint) {
          void trackEvent(response.ok ? "report_run_success" : "report_run_failed", {
            traceId,
            props: {
              endpoint,
              status: response.status,
              error_code: response.headers.get("x-error-code"),
            },
          });
        }

        if (!response.ok && !endpoint.includes("/api/analytics/event")) {
          void trackEvent("api_request_failed", {
            traceId,
            props: {
              endpoint,
              status: response.status,
              error_code: response.headers.get("x-error-code"),
            },
          });
        }
        return response;
      })
      .catch((error) => {
        if (isReportEndpoint) {
          void trackEvent("report_run_failed", {
            traceId,
            props: {
              endpoint,
              error_code: "NETWORK_ERROR",
            },
          });
        }
        void trackEvent("api_request_failed", {
          traceId,
          props: {
            endpoint,
            status: 0,
            error_code: "NETWORK_ERROR",
            message: error instanceof Error ? error.message : "network_error",
          },
        });
        throw error;
      })
      .finally(() => clearTimeout(timeoutId));
  },
});
