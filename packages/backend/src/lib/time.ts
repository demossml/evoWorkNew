/**
 * time.ts — часовые пояса сети/магазинов и границы «кассового дня».
 *
 * Без тяжёлых зависимостей: используем Intl. Для России DST отменён,
 * поэтому offset зоны постоянен в течение года (точность достаточна).
 */

export const TIMEZONE_WHITELIST = [
	"Europe/Kaliningrad",
	"Europe/Moscow",
	"Europe/Samara",
	"Asia/Yekaterinburg",
	"Asia/Omsk",
	"Asia/Krasnoyarsk",
	"Asia/Irkutsk",
	"Asia/Yakutsk",
	"Asia/Vladivostok",
	"Asia/Magadan",
	"Asia/Kamchatka",
] as const;

export const DEFAULT_TIMEZONE = "Europe/Moscow";

const TIMEZONE_LABELS: Record<string, string> = {
	"Europe/Kaliningrad": "Калининград (UTC+2)",
	"Europe/Moscow": "Москва (UTC+3)",
	"Europe/Samara": "Самара (UTC+4)",
	"Asia/Yekaterinburg": "Екатеринбург (UTC+5)",
	"Asia/Omsk": "Омск (UTC+6)",
	"Asia/Krasnoyarsk": "Красноярск (UTC+7)",
	"Asia/Irkutsk": "Иркутск (UTC+8)",
	"Asia/Yakutsk": "Якутск (UTC+9)",
	"Asia/Vladivostok": "Владивосток (UTC+10)",
	"Asia/Magadan": "Магадан (UTC+11)",
	"Asia/Kamchatka": "Камчатка (UTC+12)",
};

export function isValidTimezone(tz: string): boolean {
	return (TIMEZONE_WHITELIST as readonly string[]).includes(tz);
}

export function timezoneLabel(tz: string): string {
	return TIMEZONE_LABELS[tz] ?? tz;
}

/** Эффективный пояс магазина: shop.timezone → tenant.default_timezone → Москва. */
export function effectiveShopTimezone(
	shopTz: string | null | undefined,
	tenantDefault: string,
): string {
	if (shopTz && shopTz.trim() && isValidTimezone(shopTz.trim())) {
		return shopTz.trim();
	}
	if (tenantDefault && isValidTimezone(tenantDefault)) return tenantDefault;
	return DEFAULT_TIMEZONE;
}

/** Сдвиг зоны относительно UTC в мс для конкретного момента. */
function getTimezoneOffsetMs(timeZone: string, date: Date): number {
	const dtf = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hour12: false,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
	const map: Record<string, string> = {};
	for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
	const asUtc = Date.UTC(
		Number(map.year),
		Number(map.month) - 1,
		Number(map.day),
		Number(map.hour) % 24,
		Number(map.minute),
		Number(map.second),
	);
	return asUtc - date.getTime();
}

/**
 * Момент начала календарного дня dateStr (YYYY-MM-DD) в IANA-зоне,
 * выраженный как ISO-строка в UTC.
 */
export function startOfDayUtc(dateStr: string, timeZone: string): string {
	const [y, m, d] = dateStr.split("-").map(Number);
	const fakeUtc = Date.UTC(y!, (m ?? 1) - 1, d!, 0, 0, 0);
	const offset = getTimezoneOffsetMs(timeZone, new Date(fakeUtc));
	return new Date(fakeUtc - offset).toISOString();
}

/**
 * Exclusive-конец календарного дня dateStr (YYYY-MM-DD) в IANA-зоне —
 * это начало следующего дня, как ISO-строка в UTC.
 */
export function endOfDayUtc(dateStr: string, timeZone: string): string {
	const [y, m, d] = dateStr.split("-").map(Number);
	const next = new Date(Date.UTC(y!, (m ?? 1) - 1, d!));
	next.setUTCDate(next.getUTCDate() + 1);
	const nextStr = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
	return startOfDayUtc(nextStr, timeZone);
}

/** Сегодняшняя дата YYYY-MM-DD в заданной IANA-зоне (кассовый день). */
export function todayDateStr(timeZone: string = DEFAULT_TIMEZONE): string {
	const fmt = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	return fmt.format(new Date());
}

/** Дата YYYY-MM-DD для конкретного момента в заданной IANA-зоне. */
export function dateStrInZone(d: Date, timeZone: string = DEFAULT_TIMEZONE): string {
	const fmt = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	return fmt.format(d);
}

/** ISO UTC → формат Evotor ".sss+0000" (как close_date в index_documents). */
function toEvotor(iso: string): string {
	return iso.slice(0, 23) + "+0000";
}

/** Начало кассового дня dateStr (YYYY-MM-DD) в IANA-зоне, в формате Evotor UTC. */
export function evotorStartOfDayUtc(dateStr: string, timeZone: string): string {
	return toEvotor(startOfDayUtc(dateStr, timeZone));
}

/** Exclusive-конец кассового дня dateStr (YYYY-MM-DD) в IANA-зоне, Evotor UTC. */
export function evotorEndOfDayUtc(dateStr: string, timeZone: string): string {
	return toEvotor(endOfDayUtc(dateStr, timeZone));
}

/** Границы «сегодня» (YYYY-MM-DD в зоне) как Evotor-совместимые UTC-строки. */
export function evotorDayRangeUtc(timeZone: string): { since: string; until: string } {
	const dateStr = todayDateStr(timeZone);
	return {
		since: evotorStartOfDayUtc(dateStr, timeZone),
		until: evotorEndOfDayUtc(dateStr, timeZone),
	};
}
