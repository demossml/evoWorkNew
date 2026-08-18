/**
 * repo.ts — репозиторий auth/users/sessions/tenants поверх D1.
 * Все функции принимают `db: D1Database`.
 */

import type { D1Database } from "@cloudflare/workers-types";

export type AppUserRow = {
	id: string;
	tenant_id: string;
	login: string;
	password_hash: string;
	display_name: string;
	role: string;
	employee_uuid: string | null;
	is_active: number;
	must_change_password: number;
	last_login_at: string | null;
	created_at: string;
	updated_at: string;
};

export type SessionRow = {
	id: string;
	user_id: string;
	tenant_id: string;
	expires_at: string;
	created_at: string;
	user_agent: string;
};

export type TenantRow = {
	id: string;
	name: string;
	evotor_token: string;
	status: string;
	/** API-ключ DeepSeek тенанта (опционально) */
	deepseek_api_key?: string | null;
	/** Режим приложения: vape | universal */
	product_profile?: string | null;
	/** Фокус-группы товаров (JSON array of uuid strings) */
	focus_group_uuids?: string | null;
};

// --- tenants ---

export async function upsertTenant(
	db: D1Database,
	id: string,
	name: string,
	evotorToken: string,
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO tenants (id, name, evotor_token, status, updated_at)
       VALUES (?, ?, ?, 'active', datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         evotor_token = excluded.evotor_token,
         status = 'active',
         updated_at = datetime('now')`,
		)
		.bind(id, name, evotorToken)
		.run();
}

export async function getTenantById(
	db: D1Database,
	id: string,
): Promise<TenantRow | null> {
	return (
		(await db
			.prepare(`SELECT id, name, evotor_token, status, deepseek_api_key, product_profile, focus_group_uuids FROM tenants WHERE id = ?`)
			.bind(id)
			.first<TenantRow>()) ?? null
	);
}

export async function findTenantByToken(
	db: D1Database,
	token: string,
): Promise<TenantRow | null> {
	return (
		(await db
			.prepare(`SELECT id, name, evotor_token, status, deepseek_api_key, product_profile, focus_group_uuids FROM tenants WHERE evotor_token = ?`)
			.bind(token)
			.first<TenantRow>()) ?? null
	);
}

// --- users ---

export async function findUserByLogin(
	db: D1Database,
	login: string,
): Promise<AppUserRow | null> {
	return (
		(await db
			.prepare(`SELECT * FROM app_users WHERE login = ? COLLATE NOCASE`)
			.bind(login)
			.first<AppUserRow>()) ?? null
	);
}

export async function findUserById(
	db: D1Database,
	id: string,
): Promise<AppUserRow | null> {
	return (
		(await db.prepare(`SELECT * FROM app_users WHERE id = ?`).bind(id).first<AppUserRow>()) ??
		null
	);
}

/** SUPERADMIN тенанта (владелец) */
export async function findSuperAdminByTenant(
	db: D1Database,
	tenantId: string,
): Promise<AppUserRow | null> {
	return (
		(await db
			.prepare(
				`SELECT * FROM app_users WHERE tenant_id = ? AND role = 'SUPERADMIN' LIMIT 1`,
			)
			.bind(tenantId)
			.first<AppUserRow>()) ?? null
	);
}

/** Список пользователей тенанта БЕЗ password_hash. */
export async function listUsersByTenant(
	db: D1Database,
	tenantId: string,
): Promise<
	Array<
		Omit<AppUserRow, "password_hash"> & { password_hash?: never }
	>
> {
	const res = await db
		.prepare(
			`SELECT id, tenant_id, login, display_name, role, employee_uuid,
              is_active, must_change_password, last_login_at, created_at, updated_at
       FROM app_users WHERE tenant_id = ? ORDER BY display_name, login`,
		)
		.bind(tenantId)
		.all<Omit<AppUserRow, "password_hash">>();
	return res.results ?? [];
}

export async function insertUser(
	db: D1Database,
	row: {
		id: string;
		tenant_id: string;
		login: string;
		password_hash: string;
		display_name: string;
		role: string;
		employee_uuid?: string | null;
	},
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO app_users
        (id, tenant_id, login, password_hash, display_name, role, employee_uuid, is_active, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
		)
		.bind(
			row.id,
			row.tenant_id,
			row.login,
			row.password_hash,
			row.display_name,
			row.role,
			row.employee_uuid ?? null,
		)
		.run();
}

export async function updateUserPassword(
	db: D1Database,
	userId: string,
	passwordHash: string,
): Promise<void> {
	await db
		.prepare(
			`UPDATE app_users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?`,
		)
		.bind(passwordHash, userId)
		.run();
}

export async function updateUserLogin(
	db: D1Database,
	userId: string,
	login: string,
): Promise<void> {
	await db
		.prepare(`UPDATE app_users SET login = ?, updated_at = datetime('now') WHERE id = ?`)
		.bind(login, userId)
		.run();
}

export async function updateUserMeta(
	db: D1Database,
	userId: string,
	patch: {
		display_name?: string;
		role?: string;
		employee_uuid?: string | null;
		is_active?: number;
	},
): Promise<void> {
	// Динамический UPDATE только по переданным полям.
	// role нельзя выставить в SUPERADMIN через эту функцию — проверяется в handler.
	const fields: string[] = [];
	const values: unknown[] = [];
	if (patch.display_name !== undefined) {
		fields.push("display_name = ?");
		values.push(patch.display_name);
	}
	if (patch.role !== undefined) {
		fields.push("role = ?");
		values.push(patch.role);
	}
	if (patch.employee_uuid !== undefined) {
		fields.push("employee_uuid = ?");
		values.push(patch.employee_uuid);
	}
	if (patch.is_active !== undefined) {
		fields.push("is_active = ?");
		values.push(patch.is_active);
	}
	if (fields.length === 0) return;
	fields.push("updated_at = datetime('now')");
	values.push(userId);
	await db
		.prepare(`UPDATE app_users SET ${fields.join(", ")} WHERE id = ?`)
		.bind(...values)
		.run();
}

export async function setUserShops(
	db: D1Database,
	userId: string,
	shopIds: string[],
): Promise<void> {
	await db.prepare(`DELETE FROM app_user_shops WHERE user_id = ?`).bind(userId).run();
	const stmt = db.prepare(
		`INSERT INTO app_user_shops (user_id, shop_id) VALUES (?, ?)`,
	);
	for (const shopId of shopIds) {
		await stmt.bind(userId, shopId).run();
	}
}

export async function getUserShopIds(
	db: D1Database,
	userId: string,
): Promise<string[]> {
	const res = await db
		.prepare(`SELECT shop_id FROM app_user_shops WHERE user_id = ?`)
		.bind(userId)
		.all<{ shop_id: string }>();
	return (res.results ?? []).map((r) => r.shop_id);
}

export async function touchLastLogin(
	db: D1Database,
	userId: string,
): Promise<void> {
	await db
		.prepare(`UPDATE app_users SET last_login_at = datetime('now') WHERE id = ?`)
		.bind(userId)
		.run();
}

/** Магазины тенанта, которым принадлежит каждый из shopIds (валидация принадлежности). */
export async function filterTenantShopIds(
	db: D1Database,
	tenantId: string,
	shopIds: string[],
): Promise<string[]> {
	if (shopIds.length === 0) return [];
	const placeholders = shopIds.map(() => "?").join(",");
	const res = await db
		.prepare(
			`SELECT uuid FROM shops WHERE tenant_id = ? AND uuid IN (${placeholders})`,
		)
		.bind(tenantId, ...shopIds)
		.all<{ uuid: string }>();
	return (res.results ?? []).map((r) => r.uuid);
}

// --- employees (Evotor) ---

export type EmployeeRow = {
	uuid: string;
	name: string;
	last_name: string | null;
	role: string | null;
	stores: string | null;
	tenant_id: string | null;
};

export async function findEmployeeByUuid(
	db: D1Database,
	tenantId: string,
	uuid: string,
): Promise<EmployeeRow | null> {
	return (
		(await db
			.prepare(
				`SELECT uuid, name, last_name, role, stores, tenant_id FROM employees
         WHERE uuid = ? AND (tenant_id = ? OR tenant_id = 'default')`,
			)
			.bind(uuid, tenantId)
			.first<EmployeeRow>()) ?? null
	);
}

export async function listEmployeesByTenant(
	db: D1Database,
	tenantId: string,
): Promise<EmployeeRow[]> {
	const res = await db
		.prepare(
			`SELECT uuid, name, last_name, role, stores, tenant_id FROM employees
       WHERE tenant_id = ? ORDER BY name`,
		)
		.bind(tenantId)
		.all<EmployeeRow>();
	return res.results ?? [];
}

/** Любая учётка (active или нет) для сотрудника в рамках tenant. */
export async function findUserByEmployee(
	db: D1Database,
	tenantId: string,
	employeeUuid: string,
): Promise<{ id: string; is_active: number } | null> {
	return (
		(await db
			.prepare(
				`SELECT id, is_active FROM app_users WHERE tenant_id = ? AND employee_uuid = ? LIMIT 1`,
			)
			.bind(tenantId, employeeUuid)
			.first<{ id: string; is_active: number }>()) ?? null
	);
}

/** Активная учётка сотрудника (для запрета дублей). */
export async function findActiveUserByEmployee(
	db: D1Database,
	tenantId: string,
	employeeUuid: string,
): Promise<{ id: string } | null> {
	return (
		(await db
			.prepare(
				`SELECT id FROM app_users WHERE tenant_id = ? AND employee_uuid = ? AND is_active = 1 LIMIT 1`,
			)
			.bind(tenantId, employeeUuid)
			.first<{ id: string }>()) ?? null
	);
}

// --- sessions ---

const SESSION_TTL_DAYS = 30;

export async function createSession(
	db: D1Database,
	userId: string,
	tenantId: string,
	userAgent: string,
): Promise<{ id: string; expires_at: string }> {
	const id = crypto.randomUUID() + crypto.randomUUID(); // длинный token
	const expires = new Date(Date.now() + SESSION_TTL_DAYS * 864e5).toISOString();
	await db
		.prepare(
			`INSERT INTO app_sessions (id, user_id, tenant_id, expires_at, user_agent)
       VALUES (?, ?, ?, ?, ?)`,
		)
		.bind(id, userId, tenantId, expires, userAgent.slice(0, 200))
		.run();
	return { id, expires_at: expires };
}

export async function getSession(
	db: D1Database,
	sessionId: string,
): Promise<SessionRow | null> {
	return (
		(await db
			.prepare(`SELECT * FROM app_sessions WHERE id = ?`)
			.bind(sessionId)
			.first<SessionRow>()) ?? null
	);
}

export async function deleteSession(
	db: D1Database,
	sessionId: string,
): Promise<void> {
	await db.prepare(`DELETE FROM app_sessions WHERE id = ?`).bind(sessionId).run();
}

export async function deleteUserSessions(
	db: D1Database,
	userId: string,
): Promise<void> {
	await db.prepare(`DELETE FROM app_sessions WHERE user_id = ?`).bind(userId).run();
}

/** Удалить просроченные (вызывать изредка) */
export async function purgeExpiredSessions(db: D1Database): Promise<void> {
	await db
		.prepare(`DELETE FROM app_sessions WHERE expires_at < datetime('now')`)
		.run();
}
