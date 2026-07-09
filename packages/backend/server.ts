/**
 * server.ts — локальный запуск бэкенда на Node.js (без Cloudflare Workers).
 *
 * Использование:
 *   npx tsx server.ts                 # порт 3000
 *   PORT=8787 npx tsx server.ts       # другой порт
 *   DATA_DIR=./data npx tsx server.ts # кастомная папка данных
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { readdirSync, existsSync, appendFileSync, mkdirSync } from "fs";
import path from "path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import cron from "node-cron";

import { LocalD1Database } from "./src/adapters/local-db";
import { LocalR2Bucket } from "./src/adapters/local-storage";
import { Evotor } from "./src/evotor";
import { api } from "./src/api";
import { authenticate, initializeDrizzle } from "./src/helpers";
import { assert, isValidSign } from "./src/utils";
import { createSettingsTable } from "./src/db/repositories/settings";
import { createIndexDocumentsTable, createOpeningPhotosTable, createOpenStorsTable, createSalaryBonusTable } from "./src/utils";
import { createProductsTableIfNotExists } from "./src/sync/db";

import { syncDocuments, syncShops, syncEmployees, updateProductsShope, updatePlan_, getDataForCurrentDate, updateDataSaleByPlan, checkAndSendCriticalAlerts } from "./src/sync/cron";

const DATA_DIR = process.env.DATA_DIR ?? "./data";
const PORT = parseInt(process.env.PORT ?? "3000", 10);
const LOG_DIR = process.env.LOG_DIR ?? (process.env.NODE_ENV === "production" ? "/var/log/evo-app" : `${DATA_DIR}/logs`);

// Настройка логирования в файлы
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const logFile = path.join(LOG_DIR, "app.log");
const errFile = path.join(LOG_DIR, "error.log");

const origLog = console.log;
const origErr = console.error;
console.log = (...args: any[]) => {
	appendFileSync(logFile, `[${new Date().toISOString()}] ${args.join(" ")}\n`);
	origLog(...args);
};
console.error = (...args: any[]) => {
	appendFileSync(errFile, `[${new Date().toISOString()}] ${args.join(" ")}\n`);
	origErr(...args);
};

// Используем локальную D1-базу wrangler (если есть), иначе создаём новую
const WRANGLER_D1 = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
function findWranglerD1(): string | null {
	if (!existsSync(WRANGLER_D1)) return null;
	const entries = readdirSync(WRANGLER_D1);
	const sqlite = entries.find(f => f.endsWith(".sqlite"));
	return sqlite ? `${WRANGLER_D1}/${sqlite}` : null;
}
const DB_PATH = process.env.DB_PATH ?? findWranglerD1() ?? `${DATA_DIR}/local.db`;

const BOT_TOKEN = process.env.BOT_TOKEN ?? "8727487138:AAHnSTM9tisI2pOmRqooqTSHwsuJVtMmXag";
const EVOTOR_TOKEN = process.env.EVOTOR_API_TOKEN ?? "d786c889-9851-48d3-bafc-c0ed41ca1cc2";
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY ?? "sk-a766e22289df42339c515be265617c93";

// --- Инициализация локальных ресурсов ---
const db = new LocalD1Database(DB_PATH);
const drizzleDb = drizzle(db.raw);
const r2 = new LocalR2Bucket(`${DATA_DIR}/storage`);
const evotor = new Evotor(EVOTOR_TOKEN);

// --- Ленивая инициализация таблиц ---
let tablesReady = false;
async function ensureTables(): Promise<void> {
	if (tablesReady) return;
	await createIndexDocumentsTable(db as any);
	await createSettingsTable(db as any);
	await createOpeningPhotosTable(db as any);
	await createOpenStorsTable(db as any);
	await createSalaryBonusTable(db as any);
	await createProductsTableIfNotExists(db as any);
	const { createShopsTable, createEmployeesTable } = await import("./src/sync/db");
	await createShopsTable(db as any);
	await createEmployeesTable(db as any);
	tablesReady = true;
}

// --- Собираем Hono-приложение ---
const app = new Hono()
	.use("/*", cors())
	.use("/*", async (c, next) => {
		// Внедряем локальные ресурсы в контекст (эмулируем Cloudflare bindings)
		c.env = {
			DB: db,
			R2: r2,
			R2_PUBLIC_URL: `http://localhost:${PORT}`,
			BOT_TOKEN,
			EVOTOR_API_TOKEN: EVOTOR_TOKEN,
			TELEGRAM_STORAGE_BOT_TOKEN: BOT_TOKEN,
			TELEGRAM_STORAGE_CHAT_ID: process.env.TELEGRAM_STORAGE_CHAT_ID ?? "",
			DEEPSEEK_API_KEY: DEEPSEEK_KEY,
		} as any;

		c.set("evotor", evotor);
		c.set("db", db);
		c.set("drizzle", drizzleDb);
		c.set("r2", r2);
		c.set("r2Url", `http://localhost:${PORT}`);
		c.set("BOT_TOKEN", BOT_TOKEN);
		c.set("ai", undefined as any);

		await ensureTables();
		await next();
	})
	.use("/*", async (c, next) => {
		// Адаптированный authenticate (берём из helpers, но без crypto.subtle)
		const initData = c.req.header("initData") || "guest";

		if (initData === "guest") {
			const manualId = c.req.header("telegram-id");
			c.set("user", {
				id: manualId ?? "",
				first_name: "",
				last_name: "",
				username: "",
				photo_url: "",
			});
			c.set("userId", manualId ?? "");
		} else {
			const payload = Object.fromEntries(new URLSearchParams(initData));
			const valid = await isValidSign(BOT_TOKEN, payload);
			assert(valid, "invalid signature");
			const user = JSON.parse(payload.user);
			c.set("user", user);
			c.set("userId", user.id.toString());
		}

		return next();
	})
	.get("/health", (c) => c.json({ status: "ok", uptime: process.uptime(), ts: Date.now() }))
	.route("/", api)
	// Раздача фронтенда — всё что не API
	.get("/*", serveStatic({ root: "../frontend/dist" }))
	.get("/*", serveStatic({ root: "../frontend/dist", path: "index.html" }));

// --- Cron-задачи (синхронизация) ---
// ── Функция инициализации: планы + зарплаты после синхронизации ──
async function initializePlansAndSalaries() {
	const env = { EVOTOR_API_TOKEN: EVOTOR_TOKEN, DB: db as any };

	console.log("[startup] Расчет планов и зарплат...");

	try {
		await runSyncTask(() => updatePlan_(env), "План продаж");
	} catch (e: any) {
		console.error("[startup] Ошибка плана:", e.message);
	}

	try {
		await runSyncTask(() => updateDataSaleByPlan(env), "Продажи по плану");
	} catch (e: any) {
		console.error("[startup] Ошибка SaleByPlan:", e.message);
	}

	try {
		await runSyncTask(() => getDataForCurrentDate(env), "Зарплата");
	} catch (e: any) {
		console.error("[startup] Ошибка зарплаты:", e.message);
	}

	console.log("[startup] Планы и зарплаты — готово");
}

async function runSyncTask(task: () => Promise<void>, label: string) {
	const start = Date.now();
	console.log(`[cron] ${label} — запуск...`);
	try {
		await task();
		console.log(`[cron] ${label} — завершено (${Date.now() - start}ms)`);
	} catch (e: any) {
		console.error(`[cron] ${label} — ОШИБКА (${Date.now() - start}ms):`, e.message);
	}
}

function setupCron() {
	const env = { EVOTOR_API_TOKEN: EVOTOR_TOKEN, DB: db as any };

	// Первичная синхронизация при старте
	setTimeout(() => runSyncTask(() => syncDocuments(env), "первичная синхронизация"), 2000);
	setTimeout(() => runSyncTask(() => syncShops(env), "syncShops"), 4000);
	setTimeout(() => runSyncTask(() => syncEmployees(env), "syncEmployees"), 6000);

	// После синхронизации — планы и зарплаты (через 15 сек)
	setTimeout(() => initializePlansAndSalaries(), 15000);

	// После зарплат — проверка критических продавцов (через 25 сек)
	setTimeout(() => runSyncTask(
		() => checkAndSendCriticalAlerts(env, db as any),
		"Telegram-алерты"
	), 25000);

	// Каждые 5 минут — синхронизация документов (чеки, продажи) из Эвотор
	cron.schedule("*/5 * * * *", () => {
		runSyncTask(() => syncDocuments(env), "syncDocuments");
	});

	// Каждые 20 минут — магазины и сотрудники
	cron.schedule("*/20 * * * *", () => {
		runSyncTask(() => syncShops(env), "syncShops");
		runSyncTask(() => syncEmployees(env), "syncEmployees");
	});

	// Каждые 25 минут — обновление товаров (shopProduct)
	cron.schedule("*/25 * * * *", () => {
		runSyncTask(() => updateProductsShope(env), "updateProductsShope");
	});

	// Каждый день в 01:00 — планы, продажи по плану, зарплаты, алерты
	cron.schedule("0 1 * * *", () => {
		runSyncTask(() => updatePlan_(env), "updatePlans");
		runSyncTask(() => updateDataSaleByPlan(env), "updateSalesByPlan");
		runSyncTask(() => getDataForCurrentDate(env), "calcSalary");
		runSyncTask(() => checkAndSendCriticalAlerts(env, db as any), "criticalAlerts");
	});

	console.log("[cron] Планировщик запущен:");
	console.log("  syncDocuments       — каждые 5 минут");
	console.log("  syncShops           — каждые 20 минут");
	console.log("  syncEmployees       — каждые 20 минут");
	console.log("  updateProductsShope — каждые 25 минут");
	console.log("  updatePlans         — каждый день в 01:00");
	console.log("  updateSalesByPlan   — каждый день в 01:00");
	console.log("  calcSalary          — каждый день в 01:00");
}

// --- Запуск сервера ---
console.log(`🚀 Запуск локального сервера на http://localhost:${PORT}`);
console.log(`   БД: ${DB_PATH}`);
console.log(`   Файлы: ${DATA_DIR}/storage/`);
console.log(`   Логи: ${LOG_DIR}/`);

serve({ fetch: app.fetch, port: PORT }, (info) => {
	console.log(`✅ Сервер слушает порт ${info.port}`);

	// Запускаем cron ПОСЛЕ того как сервер начал слушать
	setupCron();
});
