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
	// dead_stock_cache
	// ══════════════════════════════════════════════════════════
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS dead_stock_cache (
			itemId TEXT NOT NULL,
			shopId TEXT NOT NULL,
			name TEXT NOT NULL,
			article TEXT,
			currentStock INTEGER,
			daysWithoutSales INTEGER NOT NULL DEFAULT 0,
			lastSaleDate TEXT,
			shopName TEXT NOT NULL DEFAULT '',
			totalRevenueLast90Days REAL NOT NULL DEFAULT 0,
			updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
			PRIMARY KEY (itemId, shopId)
		)
	`).run();

	await createIndexIfMissing(db, "dead_stock_cache", "idx_dsc_shop_days", "shopId, daysWithoutSales");

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

	console.log("[migration] Миграции завершены.");
}
