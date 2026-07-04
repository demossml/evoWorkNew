import { telegram } from "./telegram";

export const TRACKED_EVENTS = [
	"screen_open",
	"screen_close",
	"report_run_started",
	"report_run_success",
	"report_run_failed",
	"open_store_started",
	"open_store_success",
	"open_store_failed",
	"deadstock_save_started",
	"deadstock_save_success",
	"deadstock_save_failed",
	"api_request_failed",
	"telegram_digest_sent",
	"telegram_digest_failed",
	"auth_guest_login",
	"auth_webapp_verified",
] as const;

export type TrackedEventName = (typeof TRACKED_EVENTS)[number];

export function createTraceId() {
	return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
		? crypto.randomUUID()
		: `${Date.now().toString()}-${Math.random().toString(16).slice(2)}`;
}

function buildAuthHeaders() {
	const initData = telegram?.WebApp?.initData || "guest";
	return {
		initData,
		"telegram-id": localStorage.getItem("telegramId") || "",
	};
}

export function getOrCreateTraceId() {
	const key = "traceId";
	const current = localStorage.getItem(key);
	if (current) return current;
	const created = createTraceId();
	localStorage.setItem(key, created);
	return created;
}

export function trackEvent(
	eventName: TrackedEventName,
	params?: {
		shopUuid?: string;
		role?: string;
		screen?: string;
		traceId?: string;
		props?: Record<string, unknown>;
		appVersion?: string;
	},
) {
	const traceId = params?.traceId || createTraceId();

	return fetch("/api/analytics/event", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-trace-id": traceId,
			...buildAuthHeaders(),
		},
		body: JSON.stringify({
			eventName,
			traceId,
			shopUuid: params?.shopUuid,
			role: params?.role,
			screen: params?.screen,
			props: params?.props,
			appVersion: params?.appVersion,
		}),
		keepalive: true,
	}).catch(() => undefined);
}
