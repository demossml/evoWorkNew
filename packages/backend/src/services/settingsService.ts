/**
 * settingsService.ts — универсальный слой для работы с настройками приложения.
 *
 * Все захардкоженные значения (VAPE_GROUP_UUIDS, проценты бонусов, пороги и т.д.)
 * должны читаться через этот сервис, а не из констант в коде.
 */

import type { D1Database } from "@cloudflare/workers-types";

export interface AppSetting {
	key: string;
	value: string;
	type: string;
	category: string;
	label: string;
	description: string;
	updated_at: string;
}

/**
 * Получить одну настройку как строку (scope по tenant; fallback на 'default').
 */
export async function getSetting(
	db: D1Database,
	key: string,
	fallback: string,
	tenantId = "default",
): Promise<string> {
	try {
		const row = await db
			.prepare("SELECT value FROM app_settings WHERE key = ? AND tenant_id = ?")
			.bind(key, tenantId)
			.first<{ value: string }>();
		return row?.value ?? fallback;
	} catch {
		return fallback;
	}
}

/**
 * Получить одну настройку как число.
 */
export async function getNumberSetting(
	db: D1Database,
	key: string,
	fallback: number,
	tenantId = "default",
): Promise<number> {
	const str = await getSetting(db, key, String(fallback), tenantId);
	const n = Number(str);
	return Number.isFinite(n) ? n : fallback;
}

/**
 * Получить одну настройку как JSON.
 */
export async function getJsonSetting<T>(
	db: D1Database,
	key: string,
	fallback: T,
	tenantId = "default",
): Promise<T> {
	try {
		const str = await getSetting(db, key, "", tenantId);
		return JSON.parse(str) as T;
	} catch {
		return fallback;
	}
}

/**
 * Получить все настройки tenant'а.
 */
export async function getAllSettings(
	db: D1Database,
	tenantId = "default",
): Promise<AppSetting[]> {
	try {
		const result = await db
			.prepare("SELECT * FROM app_settings WHERE tenant_id = ? ORDER BY category, key")
			.bind(tenantId)
			.all<AppSetting>();
		return result.results ?? [];
	} catch {
		return [];
	}
}

/**
 * Обновить одну настройку tenant'а.
 */
export async function updateSetting(
	db: D1Database,
	key: string,
	value: string,
	tenantId = "default",
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO app_settings (tenant_id, key, value, type, category, label, description, updated_at)
			 VALUES (?, ?, ?, 'string', 'general', ?, '', datetime('now'))
			 ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
		)
		.bind(tenantId, key, value, key)
		.run();
}

/**
 * Пакетное обновление нескольких настроек tenant'а.
 */
export async function batchUpdateSettings(
	db: D1Database,
	updates: Array<{ key: string; value: string }>,
	tenantId = "default",
): Promise<void> {
	const stmt = await db.prepare(
		`INSERT INTO app_settings (tenant_id, key, value, type, category, label, description, updated_at)
		 VALUES (?, ?, ?, 'string', 'general', ?, '', datetime('now'))
		 ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
	);
	for (const { key, value } of updates) {
		await stmt.bind(tenantId, key, value, key).run();
	}
}

// ─── VAPE_GROUP_UUIDS (замена хардкода) ──────────────────────────────

const VAPE_GROUP_UUIDS_FALLBACK = [
	"78ddfd78-dc52-11e8-b970-ccb0da458b5a",
	"bc9e7e4c-fdac-11ea-aaf2-2cf05d04be1d",
	"0627db0b-4e39-11ec-ab27-2cf05d04be1d",
	"2b8eb6b4-92ea-11ee-ab93-2cf05d04be1d",
	"8a8fcb5f-9582-11ee-ab93-2cf05d04be1d",
	"97d6fa81-84b1-11ea-b9bb-70c94e4ebe6a",
	"ad8afa41-737d-11ea-b9b9-70c94e4ebe6a",
	"568905bd-9460-11ee-9ef4-be8fe126e7b9",
	"568905be-9460-11ee-9ef4-be8fe126e7b9",
];

export async function getVapeGroupUuids(db: D1Database): Promise<string[]> {
	return getJsonSetting<string[]>(db, "vape_group_uuids", VAPE_GROUP_UUIDS_FALLBACK);
}
