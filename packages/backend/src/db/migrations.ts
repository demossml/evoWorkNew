// ============================================================================
// Миграции D1 — выполняются один раз при холодном старте воркера.
// Автоматически создаёт таблицы и добавляет недостающие колонки.
// Безопасно для продакшена — идемпотентно (можно запускать многократно).
// ============================================================================

import type { D1Database } from "@cloudflare/workers-types";

let migrationsDone = false;

/**
 * Добавляет колонку в таблицу, если её ещё нет.
 * Игнорирует ошибку «duplicate column» — колонка уже существует.
 */
async function addColumnIfMissing(
	db: D1Database,
	table: string,
	col: string,
	type: string,
): Promise<void> {
	try {
		await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`).run();
		console.log(`[migration] ${table}.${col} — добавлена`);
	} catch (e: any) {
		// SQLite: «duplicate column name» — колонка уже есть, всё хорошо
		if (e?.message?.includes("duplicate column")) return;
		// «no such table» — таблица будет создана позже, не страшно
		if (e?.message?.includes("no such table")) return;
		console.warn(`[migration] ${table}.${col} — ${e?.message}`);
	}
}

/**
 * Создаёт индекс, если его ещё нет.
 */
async function createIndexIfMissing(
	db: D1Database,
	table: string,
	indexName: string,
	columns: string,
): Promise<void> {
	try {
		await db.prepare(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${table} (${columns})`).run();
	} catch (e: any) {
		console.warn(`[migration] индекс ${indexName} — ${e?.message}`);
	}
}

/**
 * Главная функция миграций. Вызывается при старте воркера.
 * Безопасна для многократного вызова — идемпотентна.
 */
export async function runMigrations(db: D1Database): Promise<void> {
	if (migrationsDone) return;
	migrationsDone = true;
	console.log("[migration] Запуск миграций...");

	// ══════════════════════════════════════════════════════════
	// shopProduct
	// ══════════════════════════════════════════════════════════
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS shopProduct (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			uuid TEXT NOT NULL,
			product_group BOOLEAN NOT NULL,
			parentUuid TEXT,
			shopId TEXT NOT NULL,
			name TEXT
		)
	`).run();

	// Новые колонки (v2)
	await addColumnIfMissing(db, "shopProduct", "quantity", "INTEGER DEFAULT 0");
	await addColumnIfMissing(db, "shopProduct", "article", "TEXT");
	await addColumnIfMissing(db, "shopProduct", "price", "REAL DEFAULT 0");
	await addColumnIfMissing(db, "shopProduct", "measureName", "TEXT");
	await addColumnIfMissing(db, "shopProduct", "code", "TEXT");
	await addColumnIfMissing(db, "shopProduct", "costPrice", "REAL DEFAULT 0");

	await createIndexIfMissing(db, "shopProduct", "idx_shopProduct_shopId", "shopId");
	await createIndexIfMissing(db, "shopProduct", "idx_shopProduct_parentUuid", "parentUuid");

	// ══════════════════════════════════════════════════════════
	// index_documents
	// ══════════════════════════════════════════════════════════
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS index_documents (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			number TEXT NOT NULL,
			shop_id TEXT NOT NULL,
			close_date TEXT,
			open_user_uuid TEXT,
			type TEXT,
			transactions TEXT,
			UNIQUE(number, shop_id)
		)
	`).run();

	await createIndexIfMissing(db, "index_documents", "idx_index_documents_shop_id", "shop_id");
	await createIndexIfMissing(db, "index_documents", "idx_index_documents_close_date", "close_date");

	// ══════════════════════════════════════════════════════════
	// shops
	// ══════════════════════════════════════════════════════════
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS shops (
			uuid TEXT PRIMARY KEY,
			name TEXT NOT NULL
		)
	`).run();

	// ══════════════════════════════════════════════════════════
	// plan
	// ══════════════════════════════════════════════════════════
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS plan (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			date TEXT NOT NULL,
			shopUuid TEXT NOT NULL,
			sum REAL NOT NULL DEFAULT 0
		)
	`).run();

	// ══════════════════════════════════════════════════════════
	// stock
	// ══════════════════════════════════════════════════════════
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS stock (
			shop_id TEXT NOT NULL,
			product_uuid TEXT NOT NULL,
			product_name TEXT,
			quantity REAL DEFAULT 0,
			measure_name TEXT,
			purchase_price REAL,
			selling_price REAL,
			updated_at TEXT NOT NULL DEFAULT (datetime('now')),
			PRIMARY KEY (shop_id, product_uuid)
		)
	`).run();

	// ══════════════════════════════════════════════════════════
	// product_cost_prices — загруженные себестоимости (v2: исторические)
	// ══════════════════════════════════════════════════════════
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS product_cost_prices (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			productName TEXT NOT NULL,
			costPrice REAL NOT NULL DEFAULT 0,
			source TEXT NOT NULL DEFAULT 'upload',
			uploadedAt TEXT NOT NULL DEFAULT (datetime('now')),
			updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
			effectiveFrom TEXT NOT NULL DEFAULT (datetime('now')),
			effectiveTo TEXT
		)
	`).run();

	// Колонки v2 (SCD Type 2 — исторические периоды)
	await addColumnIfMissing(db, "product_cost_prices", "effectiveFrom", "TEXT NOT NULL DEFAULT (datetime('now'))");
	await addColumnIfMissing(db, "product_cost_prices", "effectiveTo", "TEXT");

	// Для существующих записей: effectiveFrom = uploadedAt
	await db.prepare(`
		UPDATE product_cost_prices SET effectiveFrom = uploadedAt WHERE effectiveFrom IS NULL OR effectiveFrom = ''
	`).run();

	await createIndexIfMissing(db, "product_cost_prices", "idx_pcp_name", "productName");
	await createIndexIfMissing(db, "product_cost_prices", "idx_pcp_name_eff", "productName, effectiveFrom DESC");

	// ══════════════════════════════════════════════════════════
	// app_settings — настройки приложения
	// ══════════════════════════════════════════════════════════
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS app_settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			type TEXT NOT NULL DEFAULT 'string',
			category TEXT NOT NULL DEFAULT 'general',
			label TEXT NOT NULL DEFAULT '',
			description TEXT DEFAULT '',
			updated_at TEXT DEFAULT (datetime('now'))
		)
	`).run();

	// Вставляем стандартные настройки, если их ещё нет
	const insertSetting = async (key: string, value: string, type: string, category: string, label: string, desc: string) => {
		const exists = await db.prepare("SELECT 1 FROM app_settings WHERE key = ?").bind(key).first();
		if (!exists) {
			await db.prepare("INSERT INTO app_settings (key, value, type, category, label, description) VALUES (?,?,?,?,?,?)")
				.bind(key, value, type, category, label, desc).run();
		}
	};

	await insertSetting("bonus_accessories_rate", "0.05", "number", "bonus", "Бонус с аксессуаров", "% от продаж");
	await insertSetting("bonus_plan_amount", "450", "number", "bonus", "Бонус за план", "₽ за выполнение");
	await insertSetting("margin_green", "30", "number", "thresholds", "Маржа: зелёный", "≥ N%");
	await insertSetting("margin_yellow", "15", "number", "thresholds", "Маржа: жёлтый", "≥ N%");
	await insertSetting("plan_green", "90", "number", "thresholds", "План: зелёный", "≥ N%");
	await insertSetting("plan_yellow", "70", "number", "thresholds", "План: жёлтый", "≥ N%");
	await insertSetting("accessory_share_target", "12", "number", "thresholds", "Цель аксессуаров", "% в выручке");
	await insertSetting("dead_stock_days", "14", "number", "thresholds", "Мёртвый сток", "дней без продаж");
	await insertSetting("category_threshold", "0.05", "number", "thresholds", "Значимость категории", "мин. доля");
	await insertSetting("refund_trend", "1.5", "number", "thresholds", "Тренд возвратов", "коэф. роста");
	await insertSetting("sync_delay_shops", "7000", "number", "sync", "Задержка: магазины", "мс");
	await insertSetting("sync_delay_requests", "2000", "number", "sync", "Задержка: запросы", "мс");
	await insertSetting("upload_max_attempts", "4", "number", "upload", "Макс. попыток загрузки", "");
	await insertSetting("upload_lock_ttl", "120000", "number", "upload", "Блокировка очереди", "мс");
	await insertSetting("api_timeout", "15000", "number", "general", "Таймаут API", "мс");
	await insertSetting("base_salary", "0", "number", "salary", "Оклад", "₽/день, базовая ставка");
	await insertSetting("salary_mode", "oklad", "string", "salary", "Режим оплаты", "oklad — только оклад; oklad_bonus — оклад + бонус с аксессуаров");
	await insertSetting("vape_group_uuids", JSON.stringify([]), "json", "general", "Группы планов", "UUID групп товаров для расчёта плана");

	// ══════════════════════════════════════════════════════════
	// push_subscriptions — Web Push подписки
	// ══════════════════════════════════════════════════════════
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS push_subscriptions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			endpoint TEXT UNIQUE NOT NULL,
			p256dh TEXT NOT NULL,
			auth TEXT NOT NULL,
			user_agent TEXT DEFAULT '',
			created_at TEXT DEFAULT (datetime('now')),
			last_used_at TEXT DEFAULT (datetime('now'))
		)
	`).run();

	// ══════════════════════════════════════════════════════════
	// push_log — логирование решений push-агента
	// ══════════════════════════════════════════════════════════
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS push_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			decision TEXT NOT NULL DEFAULT 'suppress',  -- send | suppress | defer
			priority TEXT NOT NULL DEFAULT 'P2',         -- P0 | P1 | P2 | P3
			reason TEXT NOT NULL DEFAULT '',              -- обоснование по чеклисту
			title TEXT DEFAULT '',
			body TEXT DEFAULT '',
			category TEXT DEFAULT '',                     -- revenue_drop | plan | margin | dead_stock | refunds | accessory
			created_at TEXT DEFAULT (datetime('now')),
			sent_at TEXT DEFAULT NULL,
			delivered_at TEXT DEFAULT NULL,
			opened_at TEXT DEFAULT NULL,
			clicked_at TEXT DEFAULT NULL,
			outcome TEXT DEFAULT NULL,                    -- delivered | opened | clicked | dismissed | expired
			subscription_count INTEGER DEFAULT 0
		)
	`).run();

	// ══════════════════════════════════════════════════════════
	// promo_products — акционные товары
	// ══════════════════════════════════════════════════════════
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS promo_products (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			product_uuid TEXT NOT NULL,
			product_name TEXT DEFAULT '',
			group_uuid TEXT NOT NULL,
			group_name TEXT DEFAULT '',
			bonus_amount REAL NOT NULL DEFAULT 0,
			is_active INTEGER NOT NULL DEFAULT 1,
			activated_at TEXT NOT NULL,
			deactivated_at TEXT DEFAULT NULL,
			created_at TEXT DEFAULT (datetime('now'))
		)
	`).run();
	await createIndexIfMissing(db, "promo_products", "idx_pp_product", "product_uuid, activated_at");
	await createIndexIfMissing(db, "promo_products", "idx_pp_active", "is_active, product_uuid");

	// Дополнительные колонки для существующих таблиц
	await addColumnIfMissing(db, "salaryData", "bonusPromo", "INTEGER NOT NULL DEFAULT 0");
	await addColumnIfMissing(db, "salaryData", "salaryMode", "TEXT NOT NULL DEFAULT 'full'");
	await addColumnIfMissing(db, "salaryData", "baseSalary", "INTEGER NOT NULL DEFAULT 0");

	// ══════════════════════════════════════════════════════════
	// seller_settings — персональные настройки продавцов
	// ══════════════════════════════════════════════════════════
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS seller_settings (
			employee_uuid TEXT PRIMARY KEY,
			employee_name TEXT DEFAULT '',
			salary_mode TEXT NOT NULL DEFAULT 'full',
			base_salary REAL NOT NULL DEFAULT 0,
			updated_at TEXT DEFAULT (datetime('now'))
		)
	`).run();

	// ══════════════════════════════════════════════════════════
	// app_users / app_user_shops / app_sessions (auth)
	// ══════════════════════════════════════════════════════════
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS app_users (
			id            TEXT PRIMARY KEY,
			tenant_id     TEXT NOT NULL,
			login         TEXT NOT NULL,
			password_hash TEXT NOT NULL,
			display_name  TEXT NOT NULL DEFAULT '',
			role          TEXT NOT NULL DEFAULT 'CASHIER',
			employee_uuid TEXT,
			is_active     INTEGER NOT NULL DEFAULT 1,
			must_change_password INTEGER NOT NULL DEFAULT 0,
			last_login_at TEXT,
			created_at    TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
			UNIQUE(login)
		)
	`).run();

	await createIndexIfMissing(db, "app_users", "idx_app_users_tenant", "tenant_id");
	await createIndexIfMissing(db, "app_users", "idx_app_users_employee", "employee_uuid");
	await createIndexIfMissing(db, "app_users", "idx_app_users_active", "tenant_id, is_active");
	await createIndexIfMissing(db, "app_users", "idx_app_users_tenant_employee", "tenant_id, employee_uuid");

	await db.prepare(`
		CREATE TABLE IF NOT EXISTS app_user_shops (
			user_id TEXT NOT NULL,
			shop_id TEXT NOT NULL,
			PRIMARY KEY (user_id, shop_id)
		)
	`).run();
	await createIndexIfMissing(db, "app_user_shops", "idx_app_user_shops_shop", "shop_id");

	await db.prepare(`
		CREATE TABLE IF NOT EXISTS app_sessions (
			id         TEXT PRIMARY KEY,
			user_id    TEXT NOT NULL,
			tenant_id  TEXT NOT NULL,
			expires_at TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			user_agent TEXT DEFAULT ''
		)
	`).run();
	await createIndexIfMissing(db, "app_sessions", "idx_app_sessions_user", "user_id");
	await createIndexIfMissing(db, "app_sessions", "idx_app_sessions_expires", "expires_at");

	await addColumnIfMissing(db, "employees", "tenant_id", "TEXT NOT NULL DEFAULT 'default'");
	await addColumnIfMissing(db, "shops", "tenant_id", "TEXT NOT NULL DEFAULT 'default'");
	await createIndexIfMissing(db, "employees", "idx_employees_tenant", "tenant_id");
	await createIndexIfMissing(db, "shops", "idx_shops_tenant", "tenant_id");

	// tenants table (если syncEngine ещё не создал)
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS tenants (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			evotor_token TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'active',
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`).run();
	await addColumnIfMissing(db, "tenants", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
	// API-ключ DeepSeek тенанта (для ИИ-отчётов этой сети)
	await addColumnIfMissing(db, "tenants", "deepseek_api_key", "TEXT");
	// Режим приложения: vape | universal
	await addColumnIfMissing(db, "tenants", "product_profile", "TEXT NOT NULL DEFAULT 'vape'");
	// Фокус-группы товаров (JSON array of uuid strings) — универсальный KPI
	await addColumnIfMissing(db, "tenants", "focus_group_uuids", "TEXT");

	// app_settings → per-tenant (PRIMARY KEY (tenant_id, key))
	await migrateAppSettingsToTenantScope(db);
	// legacy settings → per-tenant (PRIMARY KEY (tenant_id, id))
	await migrateSettingsToTenantScope(db);

	console.log("[migration] Миграции завершены.");
}

/**
 * app_settings становится tenant-scoped: PRIMARY KEY (tenant_id, key).
 * Существующие строки переносятся в tenant 'default' (ваша сеть не теряет настройки).
 */
async function migrateAppSettingsToTenantScope(db: D1Database): Promise<void> {
	try {
		const exists = await db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_settings'")
			.first<{ name: string }>();
		if (!exists) return;

		const cols = await db
			.prepare("PRAGMA table_info(app_settings)")
			.all<{ name: string }>();
		const hasTenant = (cols.results ?? []).some((r) => r.name === "tenant_id");
		if (hasTenant) return;

		await db.batch([
			db.prepare(`
				CREATE TABLE IF NOT EXISTS app_settings_new (
					tenant_id TEXT NOT NULL DEFAULT 'default',
					key TEXT NOT NULL,
					value TEXT NOT NULL,
					type TEXT NOT NULL DEFAULT 'string',
					category TEXT NOT NULL DEFAULT 'general',
					label TEXT NOT NULL DEFAULT '',
					description TEXT DEFAULT '',
					updated_at TEXT DEFAULT (datetime('now')),
					PRIMARY KEY (tenant_id, key)
				)
			`),
			db.prepare(`
				INSERT OR IGNORE INTO app_settings_new (tenant_id, key, value, type, category, label, description, updated_at)
				SELECT 'default', key, value, type, category, label, description, updated_at FROM app_settings
			`),
		]);
		await db.prepare("DROP TABLE app_settings").run();
		await db.prepare("ALTER TABLE app_settings_new RENAME TO app_settings").run();
		console.log("[migration] app_settings → tenant-scoped (PK tenant_id+key)");
	} catch (e: any) {
		console.warn("[migration] app_settings tenant-scope:", e?.message);
	}
}

/**
 * legacy settings (id=1 accessory groups, id=2 salary, id=3 bonus) → tenant-scoped.
 * PRIMARY KEY становится (tenant_id, id); существующие строки → 'default'.
 */
async function migrateSettingsToTenantScope(db: D1Database): Promise<void> {
	try {
		const exists = await db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'")
			.first<{ name: string }>();
		if (!exists) return;

		const cols = await db
			.prepare("PRAGMA table_info(settings)")
			.all<{ name: string }>();
		const hasTenant = (cols.results ?? []).some((r) => r.name === "tenant_id");
		if (hasTenant) return;

		await db.batch([
			db.prepare(`
				CREATE TABLE IF NOT EXISTS settings_new (
					tenant_id TEXT NOT NULL DEFAULT 'default',
					id INTEGER NOT NULL,
					value TEXT,
					PRIMARY KEY (tenant_id, id)
				)
			`),
			db.prepare(`
				INSERT OR IGNORE INTO settings_new (tenant_id, id, value)
				SELECT 'default', id, value FROM settings
			`),
		]);
		await db.prepare("DROP TABLE settings").run();
		await db.prepare("ALTER TABLE settings_new RENAME TO settings").run();
		console.log("[migration] settings → tenant-scoped (PK tenant_id+id)");
	} catch (e: any) {
		console.warn("[migration] settings tenant-scope:", e?.message);
	}
}
