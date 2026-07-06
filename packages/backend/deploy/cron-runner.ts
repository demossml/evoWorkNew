/**
 * cron-runner.ts — запуск кронов отдельным процессом.
 * Использование:
 *   npx tsx deploy/cron-runner.ts
 *
 * Заменяет wrangler.toml [triggers] crons.
 */
import { LocalD1Database } from "../src/adapters/local-db";
import { Evotor } from "../src/evotor";
import {
	syncDocuments,
	updateProducts,
	updateProductsShope,
	syncStock,
	getDataForCurrentDate,
	updatePlan_,
} from "../src/sync/cron";
import { readdirSync, existsSync } from "fs";

// --- DB ---
const WRANGLER_D1 = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
function findWranglerD1(): string | null {
	if (!existsSync(WRANGLER_D1)) return null;
	const entries = readdirSync(WRANGLER_D1);
	const sqlite = entries.find((f) => f.endsWith(".sqlite"));
	return sqlite ? `${WRANGLER_D1}/${sqlite}` : null;
}
const DB_PATH =
	process.env.DB_PATH ?? findWranglerD1() ?? "./data/local.db";
const db = new LocalD1Database(DB_PATH);

// --- Evotor ---
const evotor = new Evotor(
	process.env.EVOTOR_API_TOKEN ??
		"1126f94c-2b19-490e-872c-49ded3be310e",
);

const env = { DB: db } as any;

// --- Таблицы синхронизации ---
async function setup() {
	const tables = {
		products: false,
		shopProduct: false,
		stock: false,
		salaryData: false,
	};
	for (const [name, created] of Object.entries(tables)) {
		try {
			db.prepare(`SELECT 1 FROM ${name} LIMIT 1`).run();
			console.log(`[cron] Таблица ${name} уже существует`);
		} catch {
			console.log(`[cron] Таблица ${name} будет создана при синхронизации`);
		}
	}
}

// --- Расписание ---
async function main() {
	console.log("[cron] Запуск cron-runner");
	await setup();

	// Запускаем все задачи сразу при старте (опционально)
	if (process.argv.includes("--sync-on-start")) {
		console.log("[cron] Первичная синхронизация...");
		await syncDocuments(env);
		await updateProducts(env);
		await updateProductsShope(env);
		await syncStock(env);
		console.log("[cron] Первичная синхронизация завершена");
	}

	// node-cron формат: "*/3 * * * *" и т.д.
	const cron = (await import("node-cron")).default;

	cron.schedule("*/3 * * * *", async () => {
		console.log("[cron] syncDocuments");
		await syncDocuments(env).catch((e) => console.error(e));
	});

	cron.schedule("*/25 * * * *", async () => {
		console.log("[cron] updateProducts + updateProductsShope");
		await updateProducts(env).catch((e) => console.error(e));
		await updateProductsShope(env).catch((e) => console.error(e));
	});

	cron.schedule("*/30 * * * *", async () => {
		console.log("[cron] syncStock");
		await syncStock(env).catch((e) => console.error(e));
	});

	cron.schedule("0 3 * * *", async () => {
		console.log("[cron] getDataForCurrentDate + updatePlan_");
		await getDataForCurrentDate(env).catch((e) => console.error(e));
		await updatePlan_(env).catch((e) => console.error(e));
	});

	console.log("[cron] Все задачи зарегистрированы. Ожидание...");
}

main().catch(console.error);

// Держим процесс живым — node-cron делает это сам
