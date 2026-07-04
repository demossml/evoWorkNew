import { hc } from "hono/client";
import { telegram } from "../../helpers/telegram";
import { createTraceId, getOrCreateTraceId, trackEvent } from "../../helpers/analytics";

console.log("telegram.WebApp.initData:", telegram.WebApp.initData);

let initData = telegram.WebApp.initData || "";

if (!initData) {
  const storedId = localStorage.getItem("telegramId");
  if (storedId) {
    initData = "guest"; // чтобы пройти auth
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const client = hc<any>("", {
  init: {
    headers: {
      initData: initData || "guest",
      "telegram-id": localStorage.getItem("telegramId") || "",
      "x-trace-id": getOrCreateTraceId(),
    },
  },
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const DEFAULT_TIMEOUT_MS = 15000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const traceId = createTraceId();
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
