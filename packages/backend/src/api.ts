import { Hono } from "hono";
import { cors } from "hono/cors";
import type { IEnv, SaveDeadStocksRequest } from "./types";
// import { createWorkersAI } from 'workers-ai-provider';
// import { Ai } from "@cloudflare/ai";
// import { z } from 'zod';
// import jwt from "jsonwebtoken";

// const JWT_SECRET = "your_secret_key"; // Секретный ключ для подписи токена

import { analyzeDocsStaffTask, getHoroscopeByDateTask, analyzeDocsInsightsTask, analyzeDocsAnomaliesTask, analyzeDocsPatternsTask, analyzeSellerPerformanceTask, analyzeProductEffectivenessTask, analyzeStoreEffectivenessTask } from "./ai";
import { runOrderForecastV2 } from "./services/orderForecastV2";
import { deepseekChat } from "./services/deepseek";
import { computeSellerEffectiveness } from "./services/sellerEffectiveness";
import { computeProductEffectiveness } from "./services/productEffectiveness";
import { computeStoreEffectiveness } from "./services/storeEffectiveness";
import { hashMetrics, getCachedAnalysis, saveCachedAnalysis, saveConversation, getConversationHistory, clearConversationHistory } from "./db/repositories/aiRepository";
import { computeSellerAdvancedStats, computeWeekdayComparison, computeWeekdayBreakdown } from "./services/sellerAdvancedStats";
import { generateSellerInsights } from "./services/sellerInsights";
import { computeHourlyCompare } from "./services/sellerHourlyCompare";
import { requireAdmin, requireSuperAdmin, assertShopAccess, getTenantShopUuids } from "./helpers";
import { registerAuthRoutes } from "./modules/auth/routes";
import { registerAiProviderRoutes } from "./modules/ai/providerRoutes";
import { resolveDeepseekKey } from "./services/deepseek";
import type { ShopUuidName } from "./evotor/types";
import {
	assert,
	buildSinceUntilFromDocuments,
	calculateTotalSum,
	createAccessoriesTable,
	createPlanTable,
	createSalaryBonusTable,
	createSalaryTable,
	createScheduleTable,
	formatDate,
	formatDateWithTime,
	getAllUuid,
	getData,
	getGroupsByNameUuid,
	getIntervals,
	getIsoTimestamp,
	getLatestCloseDates,
	getMonthStartAndEnd,
	getPeriodRangeEvotor,
	getPlan,
	getProductsByGroup,
	getSalaryAndBonus,
	getSalaryData,
	getScheduleByPeriod,
	getScheduleByPeriodAndShopId,
	getTelegramFile,
	getTodayRangeEvotor,
	getUuidsByParentUuidList,
	isOpenStoreExists,
	replaceUuidsWithNamesDB,
	saveFileToR2,
	saveNewIndexDocuments,
	getAveragePlan,
	getOpenShopFromD1,
	getSalesQuantityFromD1,
	getSalesSumFromD1,
	getShopNameFromD1,
	saveOpenStorsTable,
	saveOrUpdateUUIDs,
	saveSalaryAndBonus,
	transformScheduleDataD,
	updateOpenStore,
	updatePlan,
	updateSchedule,
	normalizeSalaryMode,
} from "./utils";
// import type { CandleBinance } from "./utils";
import {
	getDocumentsByCashOutcomeData,
	getProductNamesByGroup,
	getProductNamesByGroupNames,
	getSalesByProductFromD1,
	getSalesDataG,
	getSalesgardenReportData,
	getTopProductsFromD1,
	getAccessoriesSalesFromD1,
	enrichAccessoriesCost,
	getSalesByProductGroup,
	extractSalesInfoFromD1,
	getCashByShopsFromD1,
	getOpenSessionsFromD1,
	getProductStockFromD1,
	upsertCostPricesWithHistory,
	getAllCostPrices,
	deleteCostPrice,
	getCostPricesByNames,
	getCostPricesForPeriod,
	getCostPriceMapByUuid,
	normalizeProductName,
} from "./evotor/utils";
import {
	getShopUuidsFromDB,
	getShopNameFromDB,
	getShopNameUuidsFromDB,
	getEmployeeNameFromDB,
	getEmployeeNameByUuid,
	getEmployeeByLastNameDB,
	getEmployeesByShopIdDB,
	getEmployeesLastNameAndUuidFromDB,
	getEmployeeRoleFromDB,
	createShopSchedulesTable,
	upsertShopSchedules,
	getShopSchedules,
	type ShopScheduleRow,
	createSellerAbsenceEventsTable,
	upsertAbsenceEvents,
	getAbsenceEvents,
	type SellerAbsenceEvent,
} from "./sync/db";
import { saveDeadStocks } from "./db/repositories/saveDeadStocks";
import { parseCostPriceFile } from "./services/costPriceParser";
import { sendDeadStocksToTelegram } from "../utils/sendDeadStocksToTelegram";
import { sendPhotoToTelegram } from "../utils/sendPhotoToTelegram";
import {
  getDataForCurrentDate,
  syncDocuments,
  syncStock,
  updateProducts,
  updateProductsShope,
} from "./sync/cron";

type OpeningRecord = {
	shopUuid: string;
	shopName: string;
	employeeId: string;
	employeeName: string;
	openedAt: string;
	isLate?: boolean;
	photoCount: number;
	requiredPhotoCount: number;
	hasCashCheck: boolean;
	cashStatus: "not_checked" | "ok" | "surplus" | "shortage";
	cashMessage: string | null;
	completionPercent: number;
};

// ===================== In-memory cache =====================

const statsCache = new Map<string, { data: any; expiresAt: number }>();
const hourlyCompareCache = new Map<string, { data: any; expiresAt: number }>();

// ===================== API =====================

export const api = new Hono<IEnv>()

	.use("*", cors())

	.get("/api/user", (c) => {
		// console.log(c.var.user);
		return c.json(c.var.user);
	})

	// Статус универсального движка синхронизации (плитка на главном экране).
	// Включается/выключается настройкой sync_status_tile_enabled (1 — вкл, 0 — выкл).
	.get("/api/sync/status", async (c) => {
		const db = c.get("db");
		try {
			const { getNumberSetting } = await import("./services/settingsService.js");
			const tileEnabled = (await getNumberSetting(db, "sync_status_tile_enabled", 1)) !== 0;

			const tenants = await db
				.prepare(`SELECT id, name, status FROM tenants ORDER BY id`)
				.all<{ id: string; name: string; status: string }>();

			const states = await db
				.prepare(`
					SELECT tenant_id, store_id, resource, last_success_at, last_close_date, status, error, updated_at
					FROM sync_state
					ORDER BY tenant_id, store_id, resource
				`)
				.all<{
					tenant_id: string;
					store_id: string;
					resource: string;
					last_success_at: string | null;
					last_close_date: string | null;
					status: string | null;
					error: string | null;
					updated_at: string | null;
				}>();

			const docsTotal = await db
				.prepare(`SELECT COUNT(*) as n FROM index_documents`)
				.first<{ n: number }>();

			const docsByType = await db
				.prepare(`
					SELECT type, COUNT(*) as n
					FROM index_documents
					GROUP BY type
					ORDER BY n DESC
					LIMIT 25
				`)
				.all<{ type: string; n: number }>();

			const shopsCount = await db
				.prepare(`SELECT COUNT(*) as n FROM shops`)
				.first<{ n: number }>();
			const employeesCount = await db
				.prepare(`SELECT COUNT(*) as n FROM employees`)
				.first<{ n: number }>();
			const devicesCount = await db
				.prepare(`SELECT COUNT(*) as n FROM devices`)
				.first<{ n: number }>();

			return c.json({
				tileEnabled,
				tenants: tenants.results ?? [],
				states: states.results ?? [],
				docs: {
					total: docsTotal?.n ?? 0,
					byType: docsByType.results ?? [],
				},
				counts: {
					shops: shopsCount?.n ?? 0,
					employees: employeesCount?.n ?? 0,
					devices: devicesCount?.n ?? 0,
				},
			});
		} catch (e: any) {
			// Таблицы могут ещё не существовать (движок не запускался)
			return c.json({
				tileEnabled: true,
				tenants: [],
				states: [],
				docs: { total: 0, byType: [] },
				counts: { shops: 0, employees: 0, devices: 0 },
				initError: e?.message ?? String(e),
			});
		}
	})

	// Ручной запуск движка синхронизации (только админ) — для отладки.
	// ?force=1 — игнорировать интервалы и прогнать все ресурсы сразу.
	.post("/api/sync/run", requireAdmin, async (c) => {
		const db = c.get("db");
		const force =
			c.req.query("force") === "1" || c.req.query("force") === "true";
		const { runAllTenants } = await import("./sync/syncEngine.js");
		// Не ждём завершения: движок сам поставит status=running, фронт увидит прогресс.
		runAllTenants(db, { force }).catch((e) =>
			console.error("[api] sync/run ошибка:", e?.message ?? e),
		);
		return c.json({ ok: true, force });
	})

	// get currently logged in evo toremployee

	.get("/api/employee-name", async (c) => {
		const db = c.get("db");
		const employeeName = await getEmployeeNameFromDB(db, c.var.userId);
		// console.log("employeeName:", employeeName);

		assert(employeeName, "not an employee");
		return c.json({ employeeName });
	})

	.get("/api/by-last-name-uuid", async (c) => {
		const db = c.get("db");
		const employeeNameAndUuid = await getEmployeeByLastNameDB(
			db,
			c.var.user.id.toString(),
			c.get("tenantId") || "default",
		);
		// console.log(employeeNameAndUuid);
		assert(employeeNameAndUuid, "not an employee");
		return c.json({ employeeNameAndUuid });
	})

	.get("/api/documents", async (c) => {
		const db = c.get("db");
		const shopsUuid = await getShopUuidsFromDB(db);
		const newDate = new Date(); // Получаем текущую дату
		const sevenDaysAgo = new Date(newDate.getTime() - 5 * 24 * 60 * 60 * 1000);

		const since = formatDateWithTime(sevenDaysAgo, false);
		const until = formatDateWithTime(sevenDaysAgo, true);

		const shopQueries = shopsUuid.map((shopId) => ({
			shopId,
			since,
			until,
		}));
		// await createIndexDocumentsTable(db);
		// await createIndexOnType(db);

		const documents = await c.var.evotor.getDocumentsIndexForShops(shopQueries);
		await saveNewIndexDocuments(db, documents);

		// console.log("documents:", documents);

		const latestCloseDates = await getLatestCloseDates(db, shopsUuid);

		const resultData = buildSinceUntilFromDocuments(latestCloseDates);
		const documents_ = await c.var.evotor.getDocumentsIndexForShops(resultData);

		await saveNewIndexDocuments(db, documents_);

		// const results = await getDocumentsByPeriod(db, shopsUuid[0], since, until);
		// const cashOutcomeData = await getSalesgardenReportData(
		// 	db,
		// 	c.var.evotor,
		// 	shopsUuid,
		// 	since,
		// 	until,
		// );

		assert(documents_, "not an employee");
		return c.json({ cashOutcomeData: documents_ });
	})

	.get("/api/by-grammar", async (c) => {
		try {
			const result = await getHoroscopeByDateTask(c, { date: "08-06-2025" });
			return c.json({ result });
		} catch (e: any) {
			return c.json({ error: e.message }, 500);
		}
	})

	.get("/api/employee/name-uuid", async (c) => {
		const db = c.get("db");
		const employeeNameAndUuid =
			await getEmployeesLastNameAndUuidFromDB(db, c.get("tenantId") || "default");
		// console.log("employeeNameAndUuid:", employeeNameAndUuid);

		assert(employeeNameAndUuid, "not an employee");
		return c.json({ employeeNameAndUuid });
	})

	.post("/api/employee/and-store/name-uuid", async (c) => {
		const db = c.get("db");
		const data = await c.req.json();
		const { shop } = data;

		const employeeNameAndUuid = await getEmployeesByShopIdDB(
			db,
			shop,
			c.get("tenantId") || "default",
		);
		// console.log("employeeNameAndUuid:", employeeNameAndUuid);

		assert(employeeNameAndUuid, "not an employee");
		return c.json({ employeeNameAndUuid });
	})

	.post("/api/schedules/table", async (c) => {
		try {
			const db = c.get("db");
			// Получаем данные из тела запроса
			const data = await c.req.json();
			const { month, year, schedules } = data;
			console.log(month, year);

			// await deleteScheduleTable(db);

			await createScheduleTable(db);

			const { start, end } = getMonthStartAndEnd(year, month); // Май 2025
			// console.log(`Начало месяца: ${start}`); // Ожидается: "2025-05-01"
			// console.log(`Конец месяца: ${end}`);

			const data_r = await transformScheduleDataD(schedules);
			// console.log("data_r:", data_r);

			await updateSchedule(db, data_r);

			const result = await getScheduleByPeriod(db, start, end);
			// console.log("result:", result);

			if (!result) {
				return c.json({ error: "No schedule data found" }, 404);
			}
			const scheduleTable = await replaceUuidsWithNamesDB(result, db);

			// Возвращаем успешный ответ
			return c.json({ scheduleTable });
		} catch (error) {
			console.error("Ошибка при обработке запроса:", error);
			return c.json({ error: "Ошибка при обработке данных" }, 500);
		}
	})

	.post("/api/schedules/table-view", async (c) => {
		try {
			const db = c.get("db");
			// Получаем данные из тела запроса
			const data = await c.req.json();
			const { month, year, shopId } = data;

			const { start, end } = getMonthStartAndEnd(year, month);

			const result = await getScheduleByPeriodAndShopId(db, start, end, shopId);

			if (!result) {
				return c.json({ error: "No schedule data found" }, 404);
			}
			const scheduleTable = await replaceUuidsWithNamesDB(result, db);

			// Возвращаем успешный ответ
			return c.json({ scheduleTable });
		} catch (error) {
			console.error("Ошибка при обработке запроса:", error);
			return c.json({ error: "Ошибка при обработке данных" }, 500);
		}
	})

	.get("/api/ai-report", async (c) => {
		console.log("AI report request received");
		const db = c.get("db");
		const [start, end] = getTodayRangeEvotor();

		const docFiltered = await extractSalesInfoFromD1(db, start, end);
		// console.log("docs:", JSON.stringify(docFiltered, null, 2));

		const result = await analyzeDocsStaffTask(c, docFiltered);
		// console.log({ result });

		return c.json({ result });
	})

	.get("/api/ai-association-rules", async (c) => {
		console.log("AI report request received");
		const db = c.get("db");
		const [start, end] = getPeriodRangeEvotor(3);
		console.log("start:", start, "end:", end);

		const docFiltered = await extractSalesInfoFromD1(db, start, end);
		// console.log("docs:", JSON.stringify(docFiltered, null, 2));

		const result = await analyzeDocsStaffTask(c, docFiltered);
		// console.log({ result });

		return c.json({ result });
	})

	.get("/api/schedules", async (c) => {
		const db = c.get("db");
		const date = formatDate(new Date());
		const shopsUuid = await getShopUuidsFromDB(db);
		const dataReport: Record<string, string> = {};

		for (const uuid of shopsUuid) {
			const shopName = await getShopNameFromDB(db, uuid);
			const data = await getData(date, uuid, db);

			if (data) {
				const date = new Date(data.dateTime);
				date.setHours(date.getHours() + 3);

				// Явное приведение типа data.userId к строке
				const userId = data.userId as string;
				const employeeName = await getEmployeeNameFromDB(db, userId);
				dataReport[shopName] =
					`${employeeName} открыта в  ${date.toISOString().slice(11, 16)}`;
			} else {
				dataReport[shopName] = "ЕЩЕ НЕ ОТКРЫТА!!!";
			}
		}

		// Проверка наличия employeeNameAndUuid
		if (!dataReport) {
			throw new Error("not an employee");
		}

		return c.json({ dataReport });
	})

	.get("/api/shops", async (c) => {
		const db = c.get("db");
		const tenantId = c.get("tenantId");
		// TODO(tenant): все запросы к shops — строго с tenant_id
		const result = await db
			.prepare("SELECT uuid, name FROM shops WHERE tenant_id = ?")
			.bind(tenantId)
			.all<{ uuid: string; name: string }>();
		const shopsNameAndUuid = result.results ?? [];
		assert(shopsNameAndUuid, "not an shopsNameAndUuid");
		return c.json({ shopsNameAndUuid });
	})

	.post("/api/get-file", async (c) => {
		const data = await c.req.json();

		const { date, shop } = data;
		// console.log(data);

		const sinceDateOpening: string = formatDate(new Date(date));

		const dataOpening = await getData(sinceDateOpening, shop, c.get("db"));

		// console.log(dataOpening);

		const dataUrlPhoto: string[] = [];

		const keysPhoto = [
			"photoCashRegisterPhoto",
			"photoСabinetsPhoto",
			"photoShowcasePhoto1",
			"photoShowcasePhoto2",
			"photoShowcasePhoto3",
			"photoMRCInputput",
			"photoTerritory1",
			"photoTerritory2",
		];

		const dataReport: Record<string, string> = {};

		// Формируем данные о пересчёте денег
		const countingMoneyKeyBase = "РСХОЖДЕНИЙ ПО КАССЕ (ПЕРЕСЧЕТ ДЕНЕГ)";

		if (dataOpening !== null) {
			for (const [key, value] of Object.entries(dataOpening)) {
				if (keysPhoto.includes(key)) {
					if (value !== null) {
						const urlFile = await getTelegramFile(value, c.env.BOT_TOKEN);
						dataUrlPhoto.push(urlFile); // Добавляем значение в результат
					}
				}

				if (
					dataOpening?.countingMoney === null ||
					String(dataOpening?.countingMoney) === "converge"
				) {
					dataReport[`✅${countingMoneyKeyBase}`] = "НЕТ";
				}
				if (
					dataOpening?.countingMoney === null ||
					String(dataOpening?.countingMoney) === "more"
				) {
					const diffSign = "+";
					dataReport[`🔴${countingMoneyKeyBase}`] =
						`${diffSign}${dataOpening.CountingMoneyMessage}`;
				}
				if (
					dataOpening?.countingMoney === null ||
					String(dataOpening?.countingMoney) === "less"
				) {
					const diffSign = "-";
					dataReport[`🔴${countingMoneyKeyBase}`] =
						`${diffSign}${dataOpening.CountingMoneyMessage}`;
				}

				// Дополнительная информация
				const shopName = await getShopNameFromDB(c.get("db"), shop);
				const employeeName = await getEmployeeNameFromDB(
					c.get("db"),
					dataOpening.userId,
				);

				dataReport["МАГАЗИН:"] = shopName;
				dataReport["СОТРУДНИК:"] = employeeName || "Нет данных";
				const date = new Date(dataOpening.dateTime);
				date.setHours(date.getHours() + 3);
				dataReport["ВРЕМЯ ОТКРЫТИЯ TT"] = date.toISOString().slice(11, 16);
			}
		}
		// console.log(dataReport);
		// console.log(dataUrlPhoto);

		assert(dataReport, "not an employee");
		assert(dataUrlPhoto, "not an employee");

		return c.json({ dataReport, dataUrlPhoto });
	})

	.get("/api/employee-role", async (c) => {
		const authSource = c.get("authSource");

		// Session auth: роль уже определена в middleware из app_users
		if (authSource === "session") {
			const role = c.get("role");
			assert(role, "not an employee");
			return c.json({ employeeRole: role });
		}

		const userId = c.var.user.id.toString();

		const db = c.get("db");
		const employeeRoleEvo = await getEmployeeRoleFromDB(db, userId);

		const employeeRole =
			userId === "5700958253" || userId === "475039971"
				? "SUPERADMIN"
				: employeeRoleEvo;
		console.log("employeeRole:", employeeRole);

		assert(employeeRole, "not an employee");
		return c.json({ employeeRole });
	})

	.post("/api/register", async (c) => {
		const data = await c.req.json(); // Разбор JSON тела
		// console.log("user", c.var.user.id.toString());

		// Извлекаем данные из JSON
		const { userId } = data;
		c.set("userId", String(userId));

		const db = c.get("db");
		const employeeRoleEvo = await getEmployeeRoleFromDB(db, userId);
		const employeeRole = employeeRoleEvo !== null;
		console.log("employeeRole:", employeeRole);

		if (!employeeRole) {
			return c.json({ success: false, message: "not an employee" }, 403);
		}

		assert(employeeRole, "not an employee");
		return c.json({ success: true, employeeRole });
	})

	.post("/api/upload-photos-batch", async (c) => {
		try {
			const formData = await c.req.formData();

			// --- USER ID ---
			const userId = formData.get("userId")?.toString();
			if (!userId) {
				return c.json({ success: false, error: "Missing userId" }, 400);
			}

			// --- ПОЛУчАЕМ МАССИВЫ ---
			const files = formData.getAll("files") as unknown as File[];
			const categories = formData.getAll("categories").map(String);
			const fileKeys = formData.getAll("fileKeys").map(String);

			if (files.length === 0) {
				return c.json({ success: false, error: "No files uploaded" }, 400);
			}

			if (
				files.length !== categories.length ||
				files.length !== fileKeys.length
			) {
				console.log("❌ Ошибка структуры FormData");
				return c.json(
					{ success: false, error: "Invalid batch structure" },
					400,
				);
			}

			const allowed = ["area", "stock", "cash", "mrc"];

			// --- Генерируем дату ---
			const now = new Date();
			const dd = String(now.getDate()).padStart(2, "0");
			const mm = String(now.getMonth() + 1).padStart(2, "0");
			const yyyy = now.getFullYear();

			const dateFolder = `opening/${dd}-${mm}-${yyyy}/${userId}`;

			const saved: { key: string; category: string; fileKey: string }[] = [];

			// --- СОХРАНЯЕМ ВСЕ ФАЙЛЫ ---
			for (let i = 0; i < files.length; i++) {
				const file = files[i];
				const category = categories[i];
				const fileKey = fileKeys[i];

				if (!allowed.includes(category)) {
					console.log("❌ Неверная категория:", category);
					continue;
				}

				if (!(file instanceof File)) {
					console.log("❌ Не файл:", file);
					continue;
				}

				const key = `${dateFolder}/${category}/${file.name}`;

				console.log(`➡️ Сохранение файла ${i + 1}/${files.length}:`, key);

				await saveFileToR2(c.env.R2, file, key);

				console.log(`✅ Сохранено: ${key}`);

				saved.push({ key, category, fileKey });
			}

			return c.json({
				success: true,
				saved,
			});
		} catch (error) {
			console.error("🔥 Ошибка batch загрузки:", error);
			return c.json(
				{
					success: false,
					error: error instanceof Error ? error.message : "Upload failed",
				},
				500,
			);
		}
	})

	.post("/api/upload-photos", async (c) => {
		try {
			const formData = await c.req.formData();

			const file = formData.get("file") as File | null;
			const category = formData.get("category")?.toString();
			const userId = formData.get("userId")?.toString();
			const fileKey = formData.get("fileKey")?.toString();

			if (!userId) {
				return c.json({ success: false, error: "Missing userId" }, 400);
			}

			if (!file) {
				return c.json({ success: false, error: "Missing file" }, 400);
			}

			if (!category) {
				return c.json({ success: false, error: "Missing category" }, 400);
			}

			if (!fileKey) {
				return c.json({ success: false, error: "Missing fileKey" }, 400);
			}

			const allowed = ["area", "stock", "cash", "mrc"] as const;
			if (!allowed.includes(category as any)) {
				return c.json({ success: false, error: "Invalid category" }, 400);
			}

			const now = new Date();
			const dd = String(now.getDate()).padStart(2, "0");
			const mm = String(now.getMonth() + 1).padStart(2, "0");
			const yyyy = now.getFullYear();

			const folder = `opening/${dd}-${mm}-${yyyy}/${userId}/${category}`;
			const uniqueName = `${Date.now()}_${file.name}`;
			const key = `${folder}/${uniqueName}`;

			console.log(`📁 Сохраняем файл ${file.name} → ${key}`);

			await saveFileToR2(c.env.R2, file, key);

			console.log("✅ Файл успешно сохранён:", key);

			return c.json({
				success: true,
				fileKey,
				category,
				key,
			});
		} catch (err) {
			console.error("❌ Ошибка upload-photos:", err);
			return c.json({ success: false, error: "Server error" }, 500);
		}
	})

	.post("/api/upload", async (c) => {
		const formData = await c.req.formData();
		console.log("formData entries:", Array.from(formData.entries()));

		const file = formData.get("photos") as File | null;
		if (!file || !(file instanceof File)) {
			return c.json({ error: "Нет файла для загрузки" }, 400);
		}

		// const baseUrl = c.env.R2_PUBLIC_URL;

		try {
			const savedKey = `uploads/${crypto.randomUUID()}_${file.name}`;
			const arrayBuffer = await file.arrayBuffer();
			console.log(
				"Processing file:",
				file.name,
				"type:",
				file.type,
				"size:",
				file.size,
			);

			await c.env.R2.put(savedKey, arrayBuffer, {
				httpMetadata: { contentType: file.type || "application/octet-stream" },
			});

			// const publicUrl = `${baseUrl}/${savedKey}`;
			const publicUrl = `https://pub-a1a3c60dd9754ffba505cb0039a032fa.r2.dev/${savedKey}`;
			console.log("Saved:", publicUrl);

			return c.json({
				url: publicUrl,
				name: file.name,
			});
		} catch (error) {
			console.error("Error saving file:", file.name, error);
			return c.json({ error: `Ошибка сохранения файла: ${error}` }, 500);
		}
	})

	// --- /api/evotor/share-report/:key (GET) ---
	.get("/api/evotor/share-report/:key", async (c) => {
		const key = c.req.param("key");
		const object = await c.env.R2.get(`share-reports/${key}`);
		if (!object) return c.json({ error: "Not found" }, 404);

		return new Response(object.body, {
			headers: {
				"Content-Type": object.httpMetadata?.contentType ?? "image/jpeg",
				"Cache-Control": "public, max-age=31536000",
			},
		});
	})

	// --- /api/evotor/share-report (POST) ---
	.post("/api/evotor/share-report", async (c) => {
		const formData = await c.req.formData();
		const file = formData.get("file") as File | null;
		if (!file || !(file instanceof File)) {
			return c.json({ error: "Нет файла для загрузки" }, 400);
		}

		const key = `${crypto.randomUUID()}.jpg`;
		const arrayBuffer = await file.arrayBuffer();

		await c.env.R2.put(`share-reports/${key}`, arrayBuffer, {
			httpMetadata: { contentType: "image/jpeg" },
		});

		return c.json({ url: `/api/evotor/share-report/${key}` });
	})

	.get("/api/evotor/sales-today", async (c) => {
		const db = c.get("db");
		const { getSalesTodayFromD1, getSalesByProductGroup: getGroup } = await import("./evotor/utils.js");
		const tenantId = c.get("tenantId") || "default";
		const shopUuids = await getTenantShopUuids(db, tenantId);

		const salesData = await getSalesTodayFromD1(db, shopUuids);

		assert(salesData, "No sales data found");

		const now = new Date();
		const since = formatDateWithTime(now, false);
		const until = formatDateWithTime(now, true);
		const salesByGroup = await getGroup(db, since, until, shopUuids);

		return c.json({ salesData, salesByGroup });
	})

	.get("/api/evotor/sales-today-graf", async (c) => {
		const db = c.get("db"); // Получаем подключение к базе данных
		const evo = c.var.evotor;

		// Только магазины своего tenant; не-SUPERADMIN — только назначенные
		const tenantId = c.get("tenantId");
		const role = c.get("role");
		const shopIds = c.get("shopIds");
		const tenantRows = await db
			.prepare("SELECT uuid FROM shops WHERE tenant_id = ?")
			.bind(tenantId)
			.all<{ uuid: string }>();
		const tenantUuids = (tenantRows.results ?? []).map((r) => r.uuid);
		const shopUuids =
			role === "SUPERADMIN"
				? tenantUuids
				: tenantUuids.filter((u) => shopIds.includes(u));

		const nowDate = new Date(); // Получаем текущую дату
		const sevenDaysAgo = new Date(nowDate.getTime() - 7 * 24 * 60 * 60 * 1000);

		const nowSince = formatDateWithTime(nowDate, false);
		const nowUntil = getIsoTimestamp();

		const sevenDaysSince = formatDateWithTime(sevenDaysAgo, false);
		const sevenDaysUntil = getIsoTimestamp(false, -7);

		const nowDataSales = await getSalesDataG(
			db,
			shopUuids,
			nowSince,
			nowUntil,
		);

		const sevenDaysDataSales = await getSalesDataG(
			db,
			shopUuids,
			sevenDaysSince,
			sevenDaysUntil,
		);

		assert(sevenDaysDataSales, "No sales data found");

		return c.json({ nowDataSales, sevenDaysDataSales });
	})

	.get("/api/evotor/plan-for-today", async (c) => {
		try {
			interface SalesData {
				[shopName: string]: {
					datePlan: number;
					dataSales: number;
					dataQuantity: { [productName: string]: number } | null;
				} | null;
			}

			const db = c.get("db");
			const queryDate = c.req.query("date");
			const newDate: Date = queryDate
				? new Date(queryDate + "T12:00:00+03:00")
				: new Date();
			const datePlan: string = formatDate(newDate);
			const salesData: SalesData = {};

			const since = formatDateWithTime(newDate, false);
			const until = formatDateWithTime(newDate, true);

			await createPlanTable(db);

			const groupIdsVape: string[] = [
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

			// Получаем список магазинов текущего tenant
			const tenantId = c.get("tenantId") || "default";
			const shopsResult = await db.prepare(
				"SELECT uuid, name FROM shops WHERE tenant_id = ?"
			).bind(tenantId).all<{ uuid: string; name: string }>();
			const shops = shopsResult.results ?? [];

			// === План: получаем из таблицы plan, если нет/заглушка — считаем из D1 продаж ===
			let planMap = await getPlan(datePlan, db);
			const allSame = planMap && Object.keys(planMap).length > 1 &&
				new Set(Object.values(planMap)).size === 1;

			if (!planMap || Object.keys(planMap).length === 0 || allSame) {
				if (allSame) {
					console.warn(`[plan-for-today] Все магазины имеют одинаковый план ${Object.values(planMap!)[0]} — пересчитываем`);
				} else {
					console.log(`[plan-for-today] План не найден, считаем из D1 продаж`);
				}
				// Пересчитываем план для ВСЕХ магазинов
				const newPlan: Record<string, number> = {};
				for (const shop of shops) {
					const shopProductUuids: string[] = await getProductsByGroup(
						db,
						shop.uuid,
						groupIdsVape,
					);
					const avgPlan = await getAveragePlan(db, shop.uuid, datePlan, shopProductUuids);
					if (avgPlan > 0) {
						newPlan[shop.uuid] = avgPlan;
					}
				}
				if (Object.keys(newPlan).length > 0) {
					await updatePlan(newPlan, datePlan, db);
					planMap = newPlan;
				}
			}

			// Для каждого магазина: продажи из index_documents
			for (const shop of shops) {
				try {
					const shopProductUuids: string[] = await getProductsByGroup(
						db,
						shop.uuid,
						groupIdsVape,
					);

					let currentPlan = planMap?.[shop.uuid] ?? 0;

					// Если для конкретного магазина план = 0 — досчитываем
					if (currentPlan <= 0) {
						const avgPlan = await getAveragePlan(db, shop.uuid, datePlan, shopProductUuids);
						if (avgPlan > 0) {
							currentPlan = avgPlan;
							await updatePlan({ [shop.uuid]: avgPlan }, datePlan, db);
						}
					}

					const [sumSalesData, podQuantity] = await Promise.all([
						getSalesSumFromD1(db, shop.uuid, since, until, shopProductUuids),
						getSalesQuantityFromD1(db, shop.uuid, since, until, shopProductUuids),
					]);

					salesData[shop.name] = {
						datePlan: currentPlan,
						dataSales: sumSalesData || 0,
						dataQuantity: podQuantity && Object.keys(podQuantity).length > 0 ? podQuantity : null,
					};
				} catch (err) {
					console.error(`Ошибка при обработке магазина ${shop.uuid}:`, err);
				}
			}

			if (Object.keys(salesData).length === 0) {
				throw new Error("Не удалось получить данные продаж.");
			}

			return c.json({ salesData });
		} catch (err) {
			console.error("Ошибка при обработке запроса:", err);
			return c.json(
				{ error: "Ошибка при обработке запроса. Проверьте логи." },
				500,
			);
		}
	})

	.get("/api/evotor/groups", async (c) => {
		const db = c.get("db");
		const result = await db.prepare(
			"SELECT DISTINCT parentUuid as uuid FROM shopProduct WHERE product_group = 0 AND parentUuid IS NOT NULL AND parentUuid != ''"
		).all<{ uuid: string }>();
		const groups = (result.results ?? []).map(r => r.uuid);
		return c.json({ groups });
	})

	.post("/api/evotor/groups-by-shop", async (c) => {
		const data = await c.req.json();
		const { shopUuid } = data;
		const db = c.get("db");

		const excludedUuids = [
			"3f51bb7f-f3a2-11e8-b973-ccb0da458b5a",
			"be7939b7-d6e6-11ea-b9a5-ccb0da458b5a",
		];

		// Режим «Все магазины»: собираем группы по всем магазинам tenant,
		// дедуп по нормализованному имени (uuid — первого представителя).
		if (shopUuid === "all") {
			const tenantId = c.get("tenantId") || "default";
			const shopUuids = await getTenantShopUuids(db, tenantId);
			const byName = new Map<string, { name: string; uuid: string }>();
			for (const sid of shopUuids) {
				const rows = await getGroupsByNameUuid(db, sid);
				for (const g of rows ?? []) {
					if (excludedUuids.includes(g.uuid)) continue;
					const key = g.name.trim().toLowerCase();
					if (!byName.has(key)) {
						byName.set(key, { name: g.name.trim(), uuid: g.uuid });
					}
				}
			}
			const groups = Array.from(byName.values()).sort((a, b) =>
				a.name.localeCompare(b.name, "ru"),
			);
			return c.json({ groups });
		}

		const groupsData = await getGroupsByNameUuid(db, shopUuid);
		if (groupsData) {
			const groups = groupsData.filter(
				(group) => !excludedUuids.includes(group.uuid),
			);
			assert(groups, "not an result");
			return c.json({ groups });
		}

		return c.json({ groups: [] });
	})

	.post("/api/evotor/salary", async (c) => {
		try {
			const { employee, startDate, endDate } = await c.req.json();
			const db = c.get("db");

			// Убедимся, что таблицы существуют (создаются лениво)
			await createSalaryTable(db);
			await createSalaryBonusTable(db);
			// Таблица settings для групп аксессуаров
			await db.prepare(
				"CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY, value TEXT)"
			).run();

			const sincetDate = formatDateWithTime(new Date(startDate), false);
			const untilDate = formatDateWithTime(new Date(endDate), true);
			const dates = getIntervals(sincetDate, untilDate, "days", 1);

			// Читаем группы аксессуаров из таблицы settings (id=1)
			let groupIdsAks: string[] = [];
			try {
				const settingsRow = await db.prepare(
					"SELECT value FROM settings WHERE id = 1"
				).first<{ value: string }>();
				if (settingsRow?.value) {
					groupIdsAks = JSON.parse(settingsRow.value);
				}
			} catch { /* оставляем пустым */ }
			const employeeName = await getEmployeeNameByUuid(c.get("db"), employee);

			// Константа для Vape групп
			const groupIdsVape = [
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
			const productUuidsVape = await getUuidsByParentUuidList(db, groupIdsVape);

			const totalReport = {
				employeeName,
				startDate: formatDate(new Date(startDate)),
				endDate: formatDate(new Date(endDate)),
				totalSalesAccessories: 0,
				workingDays: 0,
				totalBonusAccessories: 0,
				totalBonusPromo: 0,
				totalBonusPlan: 0,
				totalBonus: 0,
				totalPayout: 0,
			};

			// Получаем месячный оклад из таблицы salary_bonus
			const salaryBonus = await getSalaryAndBonus(
				formatDate(new Date(startDate)),
				db,
			);
			const monthlyOklad = salaryBonus?.salary ?? 0;
			// Количество дней в месяце для расчёта дневного оклада
			const reportMonth = new Date(startDate).getMonth();
			const reportYear = new Date(startDate).getFullYear();
			const daysInMonth = new Date(reportYear, reportMonth + 1, 0).getDate();
			const okladDaily = daysInMonth > 0 ? Math.round(monthlyOklad / daysInMonth) : 0;

			const result = [];

			const dayResults = await Promise.all(
				dates.map(async (date_) => {
					const date = new Date(date_);
					const since = formatDateWithTime(date, false);
					const until = formatDateWithTime(date, true);
					const datePlan = formatDate(date);

					const openShopUuid = await getOpenShopFromD1(
						db,
						employee,
						datePlan,
					);
					if (!openShopUuid) return null;

					const dataReport = {
						date: datePlan,
						shopName: await getShopNameFromD1(db, openShopUuid),
						salesAccessories: 0,
						bonusPlan: 0,
						totalBonus: 0,
					};

					// Зарплатные данные всегда считаем заново (кеш отключён)
					{
						// Получаем UUID вейпов заранее — нужны для расчёта плана
						const productsVape = await getProductsByGroup(
							db,
							openShopUuid,
							groupIdsVape,
						);

						// План — только из базы, Evotor не используем
						let plan = await getPlan(datePlan, db);

						// Проверяем, не заглушка ли это (все магазины имеют одинаковый план = подозрительно)
						const allSame = plan && Object.keys(plan).length > 1 &&
							new Set(Object.values(plan)).size === 1;

						if (!plan || Object.keys(plan).length === 0 || allSame) {
							if (allSame) {
								console.warn(`[plan] Все магазины имеют одинаковый план ${Object.values(plan)[0]} — считаем по продажам`);
							}
							// Считаем план из реальных продаж в index_documents
							const avgPlan = await getAveragePlan(db, openShopUuid, datePlan, productsVape);
							if (avgPlan > 0) {
								plan = { [openShopUuid]: avgPlan };
								await updatePlan(plan, datePlan, db);
							}
						}

						let currentPlan = Number.isFinite(plan?.[openShopUuid])
							? plan[openShopUuid]
							: 0;

						// Если план = 0 — считаем по продажам
						if (currentPlan <= 0) {
							const avgPlan = await getAveragePlan(db, openShopUuid, datePlan, productsVape);
							if (avgPlan > 0) {
								currentPlan = avgPlan;
								await updatePlan({ [openShopUuid]: avgPlan }, datePlan, db);
							}
						}

						const productsAks = await getProductsByGroup(
							db,
							openShopUuid,
							groupIdsAks,
						);
						const salesDataAks = await getSalesSumFromD1(
							db,
							openShopUuid,
							since,
							until,
							productsAks,
						);
						const { getNumberSetting } = await import("./services/settingsService.js");
						const bonusRate = await getNumberSetting(db, "bonus_accessories_rate", 0.05);
						const bonusAccessories = Math.floor(salesDataAks * bonusRate);

						const salesDataVape = await getSalesSumFromD1(
							db,
							openShopUuid,
							since,
							until,
							productsVape,
						);

						const bonusPlan =
						(currentPlan > 0 && salesDataVape >= currentPlan) ? 450 : 0;

						// Бонус за акционные товары
						let bonusPromo = 0;
						try {
							const promoRows = await db
								.prepare(
									`SELECT pp.bonus_amount, COALESCE(SUM(ps.quantity), 0) as qty
									 FROM promo_products pp
									 JOIN productSold ps ON ps.productUuid = pp.product_uuid AND ps.date = ?
									 WHERE pp.is_active = 1
									   AND pp.activated_at <= datetime(? || ' 23:59:59')
									   AND (pp.deactivated_at IS NULL OR pp.deactivated_at > datetime(? || ' 00:00:00'))
									 GROUP BY pp.id`,
								)
								.bind(datePlan, datePlan, datePlan)
								.all<{ bonus_amount: number; qty: number }>();
							for (const r of promoRows.results ?? []) {
								bonusPromo += r.bonus_amount * r.qty;
							}
						} catch { /* promo table may not exist */ }

						Object.assign(dataReport, {
						salesAccessories: salesDataAks,
						bonusAccessories,
						bonusPromo,
						dataPlan: currentPlan,
						salesDataVape,
						bonusPlan,
						totalBonus: bonusAccessories + bonusPlan + bonusPromo,
					});
					}

					return dataReport;
				}),
			);

			// Собираем итоги
			for (const dataReport of dayResults) {
				if (!dataReport) continue;
				result.push(dataReport);
				totalReport.totalSalesAccessories += (dataReport as any).salesAccessories || 0;
				totalReport.totalBonusAccessories += (dataReport as any).bonusAccessories;
				totalReport.totalBonusPromo += (dataReport as any).bonusPromo || 0;
				totalReport.totalBonusPlan += dataReport.bonusPlan;
				totalReport.totalBonus += dataReport.totalBonus;
				totalReport.workingDays += 1;
				totalReport.totalPayout = totalReport.totalBonus;
			}

			return c.json({ result, totalReport });
		} catch (error) {
			console.error("Ошибка при разборе JSON:", error);
			const msg = error instanceof Error ? error.message : String(error);
			return c.json({ error: msg, message: "Ошибка обработки данных" }, 400);
		}
	})

	.post("/api/evotor/submit-groups", async (c) => {
		try {
			const data = await c.req.json(); // Разбор JSON тела

			// Извлекаем данные из JSON
			const { groups, salary, bonus } = data;
			const newDate = new Date();
			const date = formatDate(newDate);
			await createSalaryBonusTable(c.get("db"));
			await saveSalaryAndBonus(date, salary, bonus, c.get("db"));

			await createAccessoriesTable(c.get("db"));
			await saveOrUpdateUUIDs(groups, c.get("db"));
			const uuid = await getAllUuid(c.get("db"));

				const shopIds = await getShopUuidsFromDB(c.get("db"));
			const filteredUuids = shopIds.filter(
				(uuid: string) => uuid !== "20231001-6611-407F-8068-AC44283C9196",
			);
			const groupsResult = await c.get("db").prepare(
				"SELECT DISTINCT parentUuid as uuid FROM shopProduct WHERE parentUuid IN (" + uuid.map(() => "?").join(",") + ")"
			).bind(...uuid).all<{ uuid: string }>();
			const groupsName = (groupsResult.results ?? []).map(r => r.uuid);

			// Можно добавить логику обработки данных здесь

			return c.json({ groupsName, salary, bonus });
		} catch (error) {
			console.error("Ошибка при разборе JSON:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})

	.post("/api/evotor/shops", async (c) => {
		// Используем D1 вместо Evotor API — быстрее и надёжнее
		const db = c.get("db");
		const tenantId = c.get("tenantId");
		const result = await db
			.prepare("SELECT uuid, name FROM shops WHERE tenant_id = ?")
			.bind(tenantId)
			.all<{ uuid: string; name: string }>();
		const shopOptions: Record<string, string> = {};
		for (const row of result.results ?? []) {
			shopOptions[row.uuid] = row.name;
		}
		return c.json({ shopOptions });
	})

	.get("/api/evotor/shops-names", async (c) => {
		const db = c.get("db");
		const tenantId = c.get("tenantId");
		const result = await db
			.prepare("SELECT name FROM shops WHERE tenant_id = ?")
			.bind(tenantId)
			.all<{ name: string }>();
		const shopsName = (result.results ?? []).map(r => r.name);
		return c.json({ shopsName });
	})

	.get("/api/evotor/sales-report", async (c) => {
		const db = c.get("db");
		const tenantId = c.get("tenantId");
		const shopsResult = await db
			.prepare("SELECT uuid, name FROM shops WHERE tenant_id = ?")
			.bind(tenantId)
			.all<{ uuid: string; name: string }>();
		const shopOptions: Record<string, string> = {};
		for (const row of shopsResult.results ?? []) {
			shopOptions[row.uuid] = row.name;
		}
		const groupsResult = await db.prepare(
			"SELECT DISTINCT parentUuid as uuid FROM shopProduct WHERE product_group = 0 AND parentUuid IS NOT NULL AND parentUuid != ''"
		).all<{ uuid: string }>();
		const groups = (groupsResult.results ?? []).map(r => r.uuid);
		return c.json({ shopOptions, groups });
	})

	.post("/api/evotor/sales-result", async (c) => {
		try {
			const data = await c.req.json();
			const { startDate, endDate, shopUuid, groups } = data;

			// Доступ к магазину: только назначенные (SUPERADMIN — все своего tenant)
			try {
				assertShopAccess(c, shopUuid);
			} catch {
				return c.json({ success: false, error: "Forbidden" }, 403);
			}

			const since = formatDateWithTime(new Date(startDate), false);
			const until = formatDateWithTime(new Date(endDate), true);

			const tenantId = c.get("tenantId");
			const shopRow = await c.get("db")
				.prepare("SELECT name FROM shops WHERE uuid = ? AND tenant_id = ?")
				.bind(shopUuid, tenantId)
				.first<{ name: string }>();
			const shopName = shopRow?.name || shopUuid;

			// Получаем названия товаров по группам из D1 (shopProduct)
			const productNames = await getProductNamesByGroup(
				c.get("db"),
				shopUuid,
				groups,
			);

			// Считаем продажи из D1 (index_documents)
			const salesData = await getSalesByProductFromD1(
				c.env.DB,
				shopUuid,
				since,
				until,
				productNames,
			);

			// Обогащаем себестоимостью из 1С (для расчёта валовой прибыли)
			const names = Object.keys(salesData);
			const costPrices = await getCostPricesForPeriod(c.env.DB as D1Database, names, since);
			const salesDataWithCost: Record<string, { quantitySale: number; sum: number; costTotal: number }> = {};
			for (const [name, d] of Object.entries(salesData)) {
				const unitCost = costPrices.get(name) ?? 0;
				salesDataWithCost[name] = {
					quantitySale: d.quantitySale,
					sum: d.sum,
					costTotal: unitCost * d.quantitySale,
				};
			}

			return c.json({ salesData: salesDataWithCost, shopName, startDate, endDate });
		} catch (error) {
			console.error("Ошибка при обработке sales-result:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})

	// ═══════════════════════════════════════════════════════════════════════════
	// Валовая прибыль по группам товаров (новый отчёт)
	// GET /api/reports/gross-profit?since=YYYY-MM-DD&until=YYYY-MM-DD&shopId=...
	// ═══════════════════════════════════════════════════════════════════════════
	.get("/api/reports/gross-profit", requireAdmin, async (c) => {
		try {
			const db = c.get("db");
			const sinceParam = c.req.query("since");
			const untilParam = c.req.query("until");
			const shopIdParam = c.req.query("shopId");

			if (!sinceParam || !untilParam) {
				return c.json({ error: "Параметры since и until обязательны (YYYY-MM-DD)" }, 400);
			}

			const since = sinceParam.length <= 10 ? sinceParam + "T00:00:00" : sinceParam;
			const until = untilParam.length <= 10 ? untilParam + "T23:59:59" : untilParam;

			// 1. Загружаем чеки за период
			let sql = `SELECT shop_id, type, transactions FROM index_documents
			           WHERE close_date >= ? AND close_date <= ?
			             AND type IN ('SELL', 'PAYBACK')`;
			const params: any[] = [since, until];

			if (shopIdParam && shopIdParam !== "all") {
				sql += " AND shop_id = ?3";
				params.push(shopIdParam);
			}

			const docs = await db.prepare(sql).bind(...params)
				.all<{ shop_id: string; type: string; transactions: string }>();

			// 2. Строим карту категорий: commodityUuid → { groupUuid, groupName }
			const productRows = await db
				.prepare("SELECT uuid, product_group, parentUuid, name FROM shopProduct")
				.all<{ uuid: string; product_group: number; parentUuid: string | null; name: string }>();
			const prodRows = productRows.results ?? [];

			// UUID группы → название
			const groupNames = new Map<string, string>();
			for (const r of prodRows) {
				if (r.product_group) groupNames.set(r.uuid, r.name || "Без категории");
			}

			// commodityUuid → { groupUuid, groupName }
			const productMeta = new Map<string, { groupUuid: string; groupName: string; productName: string }>();
			for (const r of prodRows) {
				if (r.product_group) continue;
				const gUuid = r.parentUuid || "";
				const gName = groupNames.get(gUuid) || "Без категории";
				productMeta.set(r.uuid, { groupUuid: gUuid, groupName: gName, productName: r.name || "—" });
			}

			// 3. Агрегация: groupUuid → productUuid → { name, revenue, cost, qty }
			// Сначала собираем все UUID для последующего обогащения 1С-ценами
			const allUuids = new Set<string>();
			for (const doc of docs.results ?? []) {
				let txs: any[];
				try { txs = JSON.parse(doc.transactions); } catch { continue; }
				if (!Array.isArray(txs)) continue;
				for (const tx of txs) {
					if (tx.type === "REGISTER_POSITION" && tx.commodityUuid) {
						allUuids.add(tx.commodityUuid.trim());
					}
				}
			}

			// Загруженная себестоимость из 1С — авторитетный источник
			const costByUuid = await getCostPriceMapByUuid(db, since);
			const hasUploadedCosts = costByUuid.size > 0;

			const groups = new Map<string, {
				groupName: string;
				products: Map<string, { name: string; revenue: number; cost: number; qty: number }>;
			}>();

			for (const doc of docs.results ?? []) {
				const isRefund = doc.type === "PAYBACK";
				let txs: any[];
				try { txs = JSON.parse(doc.transactions); } catch { continue; }
				if (!Array.isArray(txs)) continue;

				for (const tx of txs) {
					if (tx.type !== "REGISTER_POSITION") continue;
					const uuid = (tx.commodityUuid || "").trim();
					if (!uuid) continue;

					const meta = productMeta.get(uuid);
					const gUuid = meta?.groupUuid || "__ungrouped__";
					const gName = meta?.groupName || "Без категории";
					const pName = meta?.productName || (tx.commodityName || "—").trim();

					const qty = tx.quantity ?? 0;
					const price = tx.price ?? 0;
					const sum = tx.sum ?? (price * qty);
					const sign = isRefund ? -1 : 1;

					// Приоритет: 1С → Evotor costPrice → 0
					const uploadedCost = costByUuid.get(uuid);
					const unitCost = uploadedCost ?? (tx.costPrice ?? 0);

					const revenue = sum * sign;
					const cost = unitCost * qty * sign;

					if (!groups.has(gUuid)) {
						groups.set(gUuid, { groupName: gName, products: new Map() });
					}
					const grp = groups.get(gUuid)!;

					if (!grp.products.has(uuid)) {
						grp.products.set(uuid, { name: pName, revenue: 0, cost: 0, qty: 0 });
					}
					const prod = grp.products.get(uuid)!;
					prod.revenue += revenue;
					prod.cost += cost;
					prod.qty += qty * sign;
				}
			}

			// 4. Считаем итоги и формируем ответ
			let totalRevenue = 0, totalCost = 0;

			const groupList: any[] = [];
			for (const [gUuid, grp] of groups) {
				let gRev = 0, gCost = 0;
				const items: any[] = [];

				for (const [pUuid, prod] of grp.products) {
					const profit = prod.revenue - prod.cost;
					const margin = prod.revenue > 0 ? (profit / prod.revenue) * 100 : 0;
					gRev += prod.revenue;
					gCost += prod.cost;

					items.push({
						name: prod.name,
						article: pUuid,
						revenue: Math.round(prod.revenue * 100) / 100,
						cost: Math.round(prod.cost * 100) / 100,
						profit: Math.round(profit * 100) / 100,
						quantity: Math.round(prod.qty * 100) / 100,
						margin: Math.round(margin * 100) / 100,
						costMissing: prod.revenue > 0 && prod.cost === 0,
					});
				}

				// Сортировка товаров внутри группы: по убыванию выручки
				items.sort((a, b) => b.revenue - a.revenue);

				const gProfit = gRev - gCost;
				const gMargin = gRev > 0 ? (gProfit / gRev) * 100 : 0;
				totalRevenue += gRev;
				totalCost += gCost;

				groupList.push({
					groupUuid: gUuid,
					groupName: grp.groupName,
					revenue: Math.round(gRev * 100) / 100,
					cost: Math.round(gCost * 100) / 100,
					profit: Math.round(gProfit * 100) / 100,
					margin: Math.round(gMargin * 100) / 100,
					items,
				});
			}

			// Сортировка групп: по убыванию прибыли
			groupList.sort((a, b) => b.profit - a.profit);

			const totalGrossProfit = totalRevenue - totalCost;
			const totalMargin = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;

			// Добавляем share (%) для каждой группы
			for (const g of groupList) {
				g.share = totalGrossProfit > 0
					? Math.round((g.profit / totalGrossProfit) * 10000) / 100
					: 0;
			}

			return c.json({
				since: since.slice(0, 10),
				until: until.slice(0, 10),
				totalRevenue: Math.round(totalRevenue * 100) / 100,
				totalCost: Math.round(totalCost * 100) / 100,
				totalGrossProfit: Math.round(totalGrossProfit * 100) / 100,
				totalMargin: Math.round(totalMargin * 100) / 100,
				groups: groupList,
			});
		} catch (err) {
			console.error("[gross-profit] error:", err);
			return c.json({ error: String(err) }, 500);
		}
	})

	// Валовая прибыль за период (по умолчанию — сегодня).
	// Параметры: since, until (опционально) или date (один день).
	.get("/api/evotor/gross-profit-today", requireAdmin, async (c) => {
		try {
			const db = c.get("db");
			const dateParam = c.req.query("date");
			const sinceParam = c.req.query("since");
			const untilParam = c.req.query("until");

			let since: string;
			let until: string;

			if (sinceParam && untilParam) {
				since = sinceParam.length <= 10 ? sinceParam + "T00:00:00" : sinceParam;
				until = untilParam.length <= 10 ? untilParam + "T23:59:59" : untilParam;
			} else if (dateParam) {
				since = dateParam + "T00:00:00";
				until = dateParam + "T23:59:59";
			} else {
				const today = new Date().toISOString().slice(0, 10);
				since = today + "T00:00:00";
				until = today + "T23:59:59";
			}

			// Изоляция tenant: только магазины текущего tenant
			const tenantId = c.get("tenantId") || "default";
			const shopUuids = await getTenantShopUuids(db, tenantId);
			if (shopUuids.length === 0) {
				return c.json({
					since: since.slice(0, 10),
					until: until.slice(0, 10),
					shops: {},
					total: { revenue: 0, cost: 0, profit: 0 },
				});
			}
			const shopPlaceholders = shopUuids.map(() => "?").join(",");

			const docs = await db
				.prepare(`SELECT shop_id, type, transactions FROM index_documents
				          WHERE close_date >= ? AND close_date <= ?
				            AND shop_id IN (${shopPlaceholders})
				            AND type IN ('SELL', 'PAYBACK')`)
				.bind(since, until, ...shopUuids)
				.all<{ shop_id: string; type: string; transactions: string }>();

			// Агрегация: shopId → productName → { revenue, qty, cost }
			const byShop = new Map<string, Map<string, { revenue: number; qty: number; cost: number }>>();
			const allNames = new Set<string>();

			for (const doc of docs.results ?? []) {
				const isRefund = doc.type === "PAYBACK";
				let txs: any[];
				try { txs = JSON.parse(doc.transactions); } catch { continue; }
				if (!Array.isArray(txs)) continue;

				if (!byShop.has(doc.shop_id)) byShop.set(doc.shop_id, new Map());
				const shopMap = byShop.get(doc.shop_id)!;

				for (const tx of txs) {
					if (tx.type !== "REGISTER_POSITION") continue;
					const name = (tx.commodityName || "").trim();
					if (!name) continue;
					const qty = tx.quantity ?? 0;
					const sum = tx.sum ?? 0;
					const sign = isRefund ? -1 : 1;

					if (!shopMap.has(name)) shopMap.set(name, { revenue: 0, qty: 0, cost: 0 });
					const p = shopMap.get(name)!;
					p.revenue += sum * sign;
					p.qty += qty * sign;
					p.cost += (tx.costPrice ?? 0) * qty * sign;
					allNames.add(name);
				}
			}

			// Обогащение загруженной себестоимостью (приоритет над costPrice)
			const uploadedCosts = await getCostPricesForPeriod(db, [...allNames], since);
			if (uploadedCosts.size > 0) {
				for (const [, shopMap] of byShop) {
					for (const [name, p] of shopMap) {
						const uploadedPrice = uploadedCosts.get(name);
						if (uploadedPrice) {
							p.cost = uploadedPrice * p.qty;
						}
					}
				}
			}

			// Имена магазинов
			const shopNames = new Map<string, string>();
			const shopRows = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>();
			for (const r of shopRows.results ?? []) shopNames.set(r.uuid, r.name);

			// Собираем ответ
			const shops: Record<string, { revenue: number; cost: number; profit: number }> = {};
			let totalRevenue = 0, totalCost = 0, totalProfit = 0;

			for (const [shopId, shopMap] of byShop) {
				let rev = 0, cost = 0;
				for (const [, p] of shopMap) { rev += p.revenue; cost += p.cost; }
				const profit = rev - cost;
				const name = shopNames.get(shopId) || shopId;
				shops[name] = {
					revenue: Math.round(rev * 100) / 100,
					cost: Math.round(cost * 100) / 100,
					profit: Math.round(profit * 100) / 100,
				};
				totalRevenue += rev;
				totalCost += cost;
				totalProfit += profit;
			}

			return c.json({
				since: since.slice(0, 10),
				until: until.slice(0, 10),
				shops,
				total: {
					revenue: Math.round(totalRevenue * 100) / 100,
					cost: Math.round(totalCost * 100) / 100,
					profit: Math.round(totalProfit * 100) / 100,
				},
			});
		} catch (err) {
			console.error("[gross-profit-today] error:", err);
			return c.json({ error: String(err) }, 500);
		}
	})

	// ─── Высокомаржинальные товары (commercial/universal) ─────────────
	// Товары за период с маржой выше порога high_margin_threshold (tenant shops).
	.get("/api/evotor/high-margin-products", async (c) => {
		try {
			const db = c.get("db");
			const sinceParam = c.req.query("since");
			const untilParam = c.req.query("until");
			if (!sinceParam || !untilParam) {
				return c.json({ error: "since и until обязательны (YYYY-MM-DD)" }, 400);
			}
			const since = sinceParam.length <= 10 ? sinceParam + "T00:00:00" : sinceParam;
			const until = untilParam.length <= 10 ? untilParam + "T23:59:59" : untilParam;

			const tenantId = c.get("tenantId") || "default";
			const scope = c.req.query("scope") || "high"; // high | low | all
			const shopUuidParam = c.req.query("shopUuid") || "all";
			const allShopUuids = await getTenantShopUuids(db, tenantId);
			// Конкретный магазин, если выбран; иначе все магазины тенанта
			const shopUuids =
				shopUuidParam !== "all" && allShopUuids.includes(shopUuidParam)
					? [shopUuidParam]
					: allShopUuids;

			const { getNumberSetting } = await import("./services/settingsService.js");
			const threshold = await getNumberSetting(db, "high_margin_threshold", 40, tenantId);

			// Список магазинов тенанта для селектора выбора торговой точки
			const shopRows = await db
				.prepare("SELECT uuid, name FROM shops WHERE tenant_id = ? ORDER BY name")
				.bind(tenantId)
				.all<{ uuid: string; name: string }>();
			const shopOptions: Record<string, string> = {};
			for (const row of shopRows.results ?? []) shopOptions[row.uuid] = row.name;

			// Агрегируем ВСЕ товары по имени (не ограничиваемся топ-200 по выручке),
			// затем фильтруем по порогу на сервере. Один товар из разных магазинов
			// уже схлопнут в одну строку внутри getTopProductsFromD1.
			const top = await getTopProductsFromD1(db, since, until, 100000, shopUuids);
			let items = top
				.filter((p) => p.netRevenue > 0)
				.map((p) => ({
					name: p.productName,
					sum: p.netRevenue,
					quantity: p.netQuantity,
					cost: Math.max(0, Math.round(p.netRevenue - p.grossProfit)),
					profit: p.grossProfit,
					margin_pct: p.marginPct,
				}));

			if (scope === "high") {
				items = items.filter((i) => i.margin_pct >= threshold);
			} else if (scope === "low") {
				items = items.filter((i) => i.margin_pct < threshold);
			}

			items = items
				.sort((a, b) => b.sum - a.sum)
				.slice(0, scope === "all" ? 500 : 100);

			return c.json({ since: since.slice(0, 10), until: until.slice(0, 10), threshold, shopOptions, items });
		} catch (err) {
			console.error("[high-margin-products] error:", err);
			return c.json({ error: String(err) }, 500);
		}
	})

	// ─── Сравнение периодов (POST /api/period-comparison) ───────────────
	// Сравнивает [since, until] с предыдущим отрезком той же длины.
	.post("/api/period-comparison", async (c) => {
		try {
			const db = c.get("db");
			const body = await c.req.json<{ since?: string; until?: string }>();
			const since = body?.since;
			const until = body?.until;
			if (!since || !until) {
				return c.json({ error: "since и until обязательны (YYYY-MM-DD)" }, 400);
			}

			const tenantId = c.get("tenantId") || "default";
			const shopUuids = await getTenantShopUuids(db, tenantId);

			const shopNameMap = new Map<string, string>();
			const shopRows = await db
				.prepare("SELECT uuid, name FROM shops WHERE tenant_id = ?")
				.bind(tenantId)
				.all<{ uuid: string; name: string }>();
			for (const r of shopRows.results ?? []) shopNameMap.set(r.uuid, r.name);

			// Календарная арифметика в локальной TZ
			const parseLocal = (s: string): Date => {
				const [y, m, d] = s.split("-").map(Number);
				return new Date(y, m - 1, d);
			};
			const fmtLocal = (d: Date): string =>
				`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
			const addDays = (d: Date, n: number): Date => {
				const r = new Date(d);
				r.setDate(r.getDate() + n);
				return r;
			};
			const days =
				Math.round((parseLocal(until).getTime() - parseLocal(since).getTime()) / 86400000) + 1;
			const prevUntil = fmtLocal(addDays(parseLocal(since), -1));
			const prevSince = fmtLocal(addDays(parseLocal(prevUntil), -(days - 1)));

			const pct = (cur: number, prev: number) =>
				prev === 0 ? 0 : Math.round(((cur - prev) / prev) * 100);

			const aggregate = async (s: string, u: string) => {
				const byShop = new Map<string, { revenue: number; checks: number }>();
				let revenue = 0;
				let checks = 0;
				if (shopUuids.length === 0) return { revenue, checks, byShop };

				const inClause = shopUuids.map(() => "?").join(",");
				const docs = await db
					.prepare(`SELECT shop_id, type, transactions FROM index_documents
					          WHERE close_date >= ? AND close_date <= ?
					            AND type IN ('SELL', 'PAYBACK')
					            AND shop_id IN (${inClause})`)
					.bind(s + "T00:00:00", u + "T23:59:59", ...shopUuids)
					.all<{ shop_id: string; type: string; transactions: string }>();

				for (const doc of docs.results ?? []) {
					const sid = doc.shop_id;
					if (!byShop.has(sid)) byShop.set(sid, { revenue: 0, checks: 0 });
					const sShop = byShop.get(sid)!;
					if (doc.type === "SELL") {
						sShop.checks += 1;
						checks += 1;
					}
					const sign = doc.type === "PAYBACK" ? -1 : 1;
					let txs: any[];
					try { txs = JSON.parse(doc.transactions); } catch { continue; }
					if (!Array.isArray(txs)) continue;
					for (const tx of txs) {
						if (tx.type !== "REGISTER_POSITION") continue;
						const sum = (tx.sum ?? 0) * sign;
						sShop.revenue += sum;
						revenue += sum;
					}
				}
				return { revenue, checks, byShop };
			};

			const current = await aggregate(since, until);
			const previous = await aggregate(prevSince, prevUntil);

			const stores = shopUuids
				.map((uuid) => {
					const cur = current.byShop.get(uuid) ?? { revenue: 0, checks: 0 };
					const prev = previous.byShop.get(uuid) ?? { revenue: 0, checks: 0 };
					return {
						name: shopNameMap.get(uuid) || uuid,
						currentRevenue: Math.round(cur.revenue),
						prevRevenue: Math.round(prev.revenue),
						revenueChange: pct(cur.revenue, prev.revenue),
						currentChecks: cur.checks,
						prevChecks: prev.checks,
					};
				})
				.sort((a, b) => b.currentRevenue - a.currentRevenue);

			const totals = {
				revenue: {
					current: Math.round(current.revenue),
					previous: Math.round(previous.revenue),
					change: pct(current.revenue, previous.revenue),
				},
				checks: {
					current: current.checks,
					previous: previous.checks,
					change: pct(current.checks, previous.checks),
				},
			};

			const top = await getTopProductsFromD1(
				db,
				since + "T00:00:00",
				until + "T23:59:59",
				15,
				shopUuids,
			);
			const topProducts = top.map((p) => ({
				productName: p.productName,
				netQuantity: p.netQuantity,
				netRevenue: Math.round(p.netRevenue),
				averagePrice: p.averagePrice,
				dailyNetRevenue7: p.dailyNetRevenue7,
			}));

			return c.json({
				period: { since, until },
				prevPeriod: { since: prevSince, until: prevUntil },
				totals,
				stores,
				topProducts,
			});
		} catch (err) {
			console.error("[period-comparison] error:", err);
			return c.json({ error: String(err) }, 500);
		}
	})

	// ─── Home tile: Revenue ────────────────────────────────────────────
	// Агрегированные данные для плитки «Выручка» (продажи без себестоимости)
	.get("/api/evotor/home/revenue-tile", async (c) => {
		try {
			const db = c.get("db");
			const sinceParam = c.req.query("since");
			const untilParam = c.req.query("until");
			const shopUuid = c.req.query("shopUuid");

			// Определяем диапазон дат
			let since: string, until: string;
			if (sinceParam && untilParam) {
				since = sinceParam.length <= 10 ? sinceParam + "T00:00:00" : sinceParam;
				until = untilParam.length <= 10 ? untilParam + "T23:59:59" : untilParam;
			} else {
				const today = new Date().toISOString().slice(0, 10);
				since = today + "T00:00:00";
				until = today + "T23:59:59";
			}

			// Список магазинов
			const allUuids = await getTenantShopUuids(db, c.get("tenantId") || "default");
			const uuids = shopUuid ? [shopUuid] : allUuids;
			const totalShops = allUuids.length;

			// Получаем имена магазинов
			const shopNameMap = new Map<string, string>();
			const shopRows = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>();
			for (const r of shopRows.results ?? []) shopNameMap.set(r.uuid, r.name);

			// Sales data
			const { salesDataByShopName, grandTotalSell, grandTotalRefund, dailySell } =
				await getSalesgardenReportData(db, uuids, since, until);

			// Payment split (нал/безнал) — считаем по всем shop
			let totalCash = 0, totalCard = 0;
			for (const [, d] of Object.entries(salesDataByShopName)) {
				const sell = (d as any).sell || {};
				for (const [k, v] of Object.entries(sell) as [string, number][]) {
					if (k.includes("Нал") || k.includes("CASH")) totalCash += v;
					else totalCard += v;
				}
			}
			const paymentTotal = totalCash + totalCard;
			const cashPct = paymentTotal > 0 ? Math.round((totalCash / paymentTotal) * 100) : 50;
			const cardPct = 100 - cashPct;

			// Total checks
			const checksResult = await db
				.prepare(`SELECT COUNT(*) as cnt FROM index_documents
				          WHERE close_date >= ? AND close_date <= ? AND type = 'SELL'`)
				.bind(since, until)
				.first<{ cnt: number }>();
			const totalChecks = checksResult?.cnt ?? 0;

			// Average check
			const averageCheck = totalChecks > 0
				? Math.round(grandTotalSell / totalChecks)
				: 0;

			// Best shop
			let bestShop: { name: string; sales: number } | null = null;
			for (const [name, d] of Object.entries(salesDataByShopName)) {
				const sales = (d as any).totalSell || 0;
				if (!bestShop || sales > bestShop.sales) {
					bestShop = { name, sales: Math.round(sales) };
				}
			}

			// Sales by category
			const salesByGroup = await getSalesByProductGroup(db, since, until);

			// Trend 7d: последние 7 дней выручки
			const trend7d: number[] = [];
			if (dailySell) {
				const sorted = Object.entries(dailySell).sort(([a], [b]) => a.localeCompare(b));
				const last7 = sorted.slice(-7);
				for (const [, v] of last7) trend7d.push(Math.round(Number(v)));
			}

			// Delta vs yesterday
			let deltaVsYesterdayPct: number | null = null;
			if (trend7d.length >= 2) {
				const prev = trend7d[trend7d.length - 2];
				const curr = trend7d[trend7d.length - 1];
				if (prev > 0) deltaVsYesterdayPct = Math.round(((curr - prev) / prev) * 100);
			}

			// Shops list (without margin/per-shop costs)
			const shops = Object.entries(salesDataByShopName)
				.map(([name, d]: [string, any]) => {
					let sCash = 0, sCard = 0;
					const sell = d.sell || {};
					for (const [k, v] of Object.entries(sell) as [string, number][]) {
						if (k.includes("Нал") || k.includes("CASH")) sCash += v;
						else sCard += v;
					}
					const sTotal = sCash + sCard || 1;
					return {
						name,
						sales: Math.round(d.totalSell || 0),
						cashShare: Math.round((sCash / sTotal) * 100),
						cardShare: Math.round((sCard / sTotal) * 100),
					};
				})
				.sort((a, b) => b.sales - a.sales);

			// dataCompleteness: считаем магазины, у которых были продажи
			const reportedShops = shops.filter(s => s.sales > 0).length;

			return c.json({
				since: since.slice(0, 10),
				until: until.slice(0, 10),
				grossSales: Math.round(grandTotalSell),
				deltaVsYesterdayPct,
				totalChecks,
				averageCheck,
				paymentSplit: { cashPct, cardPct },
				bestShop,
				salesByCategory: salesByGroup ?? { vape: 0, accessory: 0, other: 0 },
				trend7d,
				shops,
				dataCompleteness: { reportedShops, totalShops },
			});
		} catch (err) {
			console.error("[revenue-tile] error:", err);
			return c.json({ error: String(err) }, 500);
		}
	})

	// ─── Home tile: Finance ────────────────────────────────────────────
	// Агрегированные данные для плитки «Финансовый отчёт» (прибыль, расходы, возвраты)
	.get("/api/evotor/home/finance-tile", async (c) => {
		try {
			const db = c.get("db");
			const sinceParam = c.req.query("since");
			const untilParam = c.req.query("until");
			const shopUuid = c.req.query("shopUuid");

			let since: string, until: string;
			if (sinceParam && untilParam) {
				since = sinceParam.length <= 10 ? sinceParam + "T00:00:00" : sinceParam;
				until = untilParam.length <= 10 ? untilParam + "T23:59:59" : untilParam;
			} else {
				const today = new Date().toISOString().slice(0, 10);
				since = today + "T00:00:00";
				until = today + "T23:59:59";
			}

			const allUuids = await getTenantShopUuids(db, c.get("tenantId") || "default");
			const uuids = shopUuid ? [shopUuid] : allUuids;
			const totalShops = allUuids.length;

			const shopNameMap = new Map<string, string>();
			const shopRows = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>();
			for (const r of shopRows.results ?? []) shopNameMap.set(r.uuid, r.name);

			// 1. Продажи + возвраты
			const { salesDataByShopName, grandTotalSell, grandTotalRefund } =
				await getSalesgardenReportData(db, uuids, since, until);

			// 2. Расходы
			const cashOutcomeData = await getDocumentsByCashOutcomeData(db, uuids, since, until);
			const grandTotalCashOutcome = calculateTotalSum(cashOutcomeData);

			// 3. Остатки наличных
			const cashBalanceByShop = await getCashByShopsFromD1(db, uuids);
			const totalCashBalance = Object.values(cashBalanceByShop).reduce((s, v) => s + v, 0);

			// 4. Валовая прибыль (как в gross-profit-today)
			const docs = await db
				.prepare(`SELECT shop_id, type, transactions FROM index_documents
				          WHERE close_date >= ? AND close_date <= ?
				            AND type IN ('SELL', 'PAYBACK')`)
				.bind(since, until)
				.all<{ shop_id: string; type: string; transactions: string }>();

			const byShop = new Map<string, Map<string, { revenue: number; qty: number; cost: number }>>();
			const allNames = new Set<string>();

			for (const doc of docs.results ?? []) {
				const isRefund = doc.type === "PAYBACK";
				let txs: any[];
				try { txs = JSON.parse(doc.transactions); } catch { continue; }
				if (!Array.isArray(txs)) continue;

				if (!byShop.has(doc.shop_id)) byShop.set(doc.shop_id, new Map());
				const shopMap = byShop.get(doc.shop_id)!;

				for (const tx of txs) {
					if (tx.type !== "REGISTER_POSITION") continue;
					const name = (tx.commodityName || "").trim();
					if (!name) continue;
					const qty = tx.quantity ?? 0;
					const sum = tx.sum ?? 0;
					const sign = isRefund ? -1 : 1;

					if (!shopMap.has(name)) shopMap.set(name, { revenue: 0, qty: 0, cost: 0 });
					const p = shopMap.get(name)!;
					p.revenue += sum * sign;
					p.qty += qty * sign;
					p.cost += (tx.costPrice ?? 0) * qty * sign;
					allNames.add(name);
				}
			}

			const uploadedCosts = await getCostPricesForPeriod(db, [...allNames], since);
			if (uploadedCosts.size > 0) {
				for (const [, shopMap] of byShop) {
					for (const [name, p] of shopMap) {
						const uploadedPrice = uploadedCosts.get(name);
						if (uploadedPrice) p.cost = uploadedPrice * p.qty;
					}
				}
			}

			// Gross profit totals
			let totalRevenueGP = 0, totalCostGP = 0, totalProfitGP = 0;
			const shopProfitMap = new Map<string, { revenue: number; cost: number; profit: number }>();
			for (const [shopId, shopMap] of byShop) {
				let rev = 0, cost = 0;
				for (const [, p] of shopMap) { rev += p.revenue; cost += p.cost; }
				const profit = rev - cost;
				const name = shopNameMap.get(shopId) || shopId;
				shopProfitMap.set(name, {
					revenue: Math.round(rev * 100) / 100,
					cost: Math.round(cost * 100) / 100,
					profit: Math.round(profit * 100) / 100,
				});
				totalRevenueGP += rev;
				totalCostGP += cost;
				totalProfitGP += profit;
			}

			const grossProfit = Math.round(totalProfitGP);
			const marginPct = totalRevenueGP > 0
				? Math.round((totalProfitGP / totalRevenueGP) * 100)
				: null;

			// Expenses by category
			const expensesByCategory: Record<string, number> = {};
			for (const [, cats] of Object.entries(cashOutcomeData)) {
				for (const [cat, amt] of Object.entries(cats as Record<string, number>)) {
					expensesByCategory[cat] = (expensesByCategory[cat] || 0) + (typeof amt === "number" ? amt : 0);
				}
			}

			// Refunds
			const refundAmount = Math.round(grandTotalRefund);
			const refundPctOfSales = grandTotalSell > 0
				? Math.round((grandTotalRefund / grandTotalSell) * 100)
				: 0;

			// Net cash
			const netCash = Math.round(grandTotalSell - grandTotalRefund - grandTotalCashOutcome);

			// Shops detail
			const shops = uuids.map(uuid => {
				const name = shopNameMap.get(uuid) || uuid;
				const shopSales = (salesDataByShopName as any)[name];
				const sales = shopSales?.totalSell || 0;
				const refund = Object.values(shopSales?.refund || {}).reduce((s: number, v: any) => s + Number(v), 0);
				const expenses = Object.values(cashOutcomeData[name] || {}).reduce((s: number, v: any) => s + Number(v), 0);
				const expensesByCat: Record<string, number> = {};
				for (const [cat, amt] of Object.entries(cashOutcomeData[name] || {})) {
					expensesByCat[cat] = typeof amt === "number" ? Math.round(amt) : 0;
				}
				const cashBalance = cashBalanceByShop[name] || 0;
				const gpData = shopProfitMap.get(name);
				const profit = gpData ? Math.round(gpData.profit) : 0;
				const shopMarginPct = gpData && gpData.revenue > 0
					? Math.round((gpData.profit / gpData.revenue) * 100)
					: null;
				return {
					name,
					sales: Math.round(sales),
					refund: Math.round(refund),
					expenses: Math.round(expenses),
					expensesByCategory: expensesByCat,
					cashBalance: Math.round(cashBalance),
					profit,
					marginPct: shopMarginPct,
				};
			}).sort((a, b) => b.sales - a.sales);

			const reportedShops = shops.filter(s => s.sales > 0 || s.expenses > 0).length;

			// Thresholds from settings (default fallback)
			let marginGreen = 30, marginYellow = 15;
			try {
				const greenRow = await db.prepare(
					"SELECT value FROM app_settings WHERE key = 'margin_green'"
				).first<{ value: string }>();
				if (greenRow) marginGreen = Number(greenRow.value) || 30;
				const yellowRow = await db.prepare(
					"SELECT value FROM app_settings WHERE key = 'margin_yellow'"
				).first<{ value: string }>();
				if (yellowRow) marginYellow = Number(yellowRow.value) || 15;
			} catch {}

			return c.json({
				since: since.slice(0, 10),
				until: until.slice(0, 10),
				grossProfit,
				marginPct,
				netCash,
				refunds: { amount: refundAmount, pctOfSales: refundPctOfSales },
				expenses: { total: Math.round(grandTotalCashOutcome), byCategory: expensesByCategory },
				cashBalanceTotal: Math.round(totalCashBalance),
				thresholds: { marginGreen, marginYellow },
				shops,
				dataCompleteness: { reportedShops, totalShops },
			});
		} catch (err) {
			console.error("[finance-tile] error:", err);
			return c.json({ error: String(err) }, 500);
		}
	})

	// @deprecated — использует Evotor API напрямую. Заменён на /api/dead-stocks/data (D1).
	// Удалить после полного перехода на D1-only.
	.post("/api/evotor/dead-stock", async (c) => {
		try {
			const data = await c.req.json(); // Разбор JSON тела
			// console.log(data);

			// Извлекаем данные из JSON
			const { startDate, endDate, shopUuid, groups } = data;

			const sincetDate = new Date(startDate); // Преобразуем в объект Date
			const untilDate = new Date(endDate); // Преобразуем в объект Date

			const since = formatDateWithTime(sincetDate, false); // Форматируем начальную дату
			const until = formatDateWithTime(untilDate, true); // Форматируем конечную дату

			const params = { shopId: shopUuid, groups, since, until };

			// Продукты по группам
			const salesData = await c.var.evotor.getSalesSummary(params); // Получаем данные по продажам

			const shopName = await c.var.evotor.getShopName(shopUuid);

			console.log(salesData);

			return c.json({
				salesData: salesData, // МАССИВ элементов
				shopName,
				startDate,
				endDate,
			});
		} catch (error) {
			console.error("Ошибка при разборе JSON:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})

	.get("/api/evotor/shops", async (c) => {
		// Получаем список магазинов
		const db2 = c.get("db");
		const shopsResult = await db2.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>();
		const shopOptions: Record<string, string> = {};
		for (const row of shopsResult.results ?? []) {
			shopOptions[row.uuid] = row.name;
		}
		// console.log(shopOptions);

		return c.json({ shopOptions });
	})

	.post("/api/evotor/stock-report", async (c) => {
		try {
			const db = c.get("db");
			const data = await c.req.json<{ shopUuid?: string; groups?: string[] }>();
			const shopUuid = data?.shopUuid;
			const groups = Array.isArray(data?.groups) ? data.groups : [];

			if (!shopUuid || groups.length === 0) {
				return c.json({ error: "shopUuid и groups обязательны" }, 400);
			}

			const tenantId = c.get("tenantId") || "default";
			const tenantShops = await getTenantShopUuids(db, tenantId);

			let shopIds: string[];
			let shopName: string;
			if (shopUuid === "all") {
				shopIds = tenantShops;
				shopName = "Все магазины";
			} else {
				if (!tenantShops.includes(shopUuid)) {
					return c.json({ error: "Магазин не найден или нет доступа" }, 403);
				}
				shopIds = [shopUuid];
				const nameRow = await db
					.prepare("SELECT name FROM shops WHERE uuid = ?")
					.bind(shopUuid)
					.first<{ name: string }>();
				shopName = nameRow?.name || shopUuid;
			}

			if (shopIds.length === 0) {
				return c.json({
					shopName,
					items: [],
					totals: { skuCount: 0, quantity: 0, sum: 0 },
					stockData: {},
				});
			}

			const inShops = shopIds.map(() => "?").join(",");
			const inGroups = groups.map(() => "?").join(",");

			// Имена групп: uuid → name
			const groupRows = await db
				.prepare(
					`SELECT uuid, name FROM shopProduct WHERE product_group = 1 AND uuid IN (${inGroups})`
				)
				.bind(...groups)
				.all<{ uuid: string; name: string }>();
			const groupNameMap = new Map<string, string>();
			for (const r of groupRows.results ?? []) groupNameMap.set(r.uuid, r.name);

			// Остатки из D1 (только quantity > 0), стоимость = price × quantity
			const rows = await db
				.prepare(
					`SELECT name, quantity, price, parentUuid, article FROM shopProduct
					 WHERE shopId IN (${inShops}) AND parentUuid IN (${inGroups}) AND quantity > 0`
				)
				.bind(...shopIds, ...groups)
				.all<{
					name: string;
					quantity: number;
					price: number;
					parentUuid: string | null;
					article: string | null;
				}>();

			// Схлопывание по имени (для «Все магазины» суммируем остатки)
			const agg = new Map<
				string,
				{ name: string; quantity: number; sum: number; groupName?: string; article?: string }
			>();
			for (const r of rows.results ?? []) {
				const qty = Number(r.quantity) || 0;
				if (qty <= 0) continue;
				const sum = (Number(r.price) || 0) * qty;
				const key = (r.name || "").trim().toLowerCase();
				const existing = agg.get(key);
				if (existing) {
					existing.quantity += qty;
					existing.sum += sum;
				} else {
					agg.set(key, {
						name: (r.name || "").trim(),
						quantity: qty,
						sum,
						groupName: r.parentUuid ? groupNameMap.get(r.parentUuid) : undefined,
						article: r.article || undefined,
					});
				}
			}

			const items = [...agg.values()]
				.sort((a, b) => b.quantity - a.quantity)
				.map((it) => ({ ...it, sum: Math.round(it.sum * 100) / 100 }));

			const totals = {
				skuCount: items.length,
				quantity: items.reduce((s, i) => s + i.quantity, 0),
				sum: Math.round(items.reduce((s, i) => s + i.sum, 0) * 100) / 100,
			};

			// Обратная совместимость со старым UI
			const stockData: Record<string, { sum: number; quantity: number }> = {};
			for (const it of items) {
				stockData[it.name] = { sum: it.sum, quantity: it.quantity };
			}

			return c.json({ shopName, items, totals, stockData });
		} catch (error) {
			console.error("[stock-report] error:", error);
			return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
		}
	})

	.post("/api/evotor/order", async (c) => {
		try {
			// Получаем данные из запроса
			const data = await c.req.json();

			const { startDate, endDate, shopUuid, groups, period } = data;
			const sincetDate = new Date(startDate); // Преобразуем в объект Date
			const untilDate = new Date(endDate); // Преобразуем в объект Date

			const since = formatDateWithTime(sincetDate, false); // Форматируем начальную дату
			const until = formatDateWithTime(untilDate, true);

			const params = {
				shopId: shopUuid,
				groups: groups,
				since: since,
				until: until,
				periods: period,
			};

			const order = await c.var.evotor.getOrder(params);
			// console.log("данные:", order);

			// Проверяем, что данные о товарах получены
			if (!order || Object.keys(order).length === 0) {
				return c.json({ error: "Не удалось получить данные заказа." }, 500);
			}

			// console.log("данные:", order);

			const shopNameRow = await c.get("db").prepare("SELECT name FROM shops WHERE uuid = ?").bind(shopUuid).first<{ name: string }>();
			const shopName = shopNameRow?.name || shopUuid;

			// Отправляем ответ
			return c.json({ order, startDate, endDate, shopName });
		} catch (error) {
			// Логируем ошибку и возвращаем 500
			console.error("Ошибка при обработке запроса:", error);
			return c.json({ error: "Произошла ошибка при обработке запроса." }, 500);
		}
	})

	.get("/api/evotor/report/financial/today", async (c) => {
		try {
			const db = c.get("db");
			const now = new Date();

			const since = formatDateWithTime(now, false);
			const until = formatDateWithTime(now, true);

			const shopUuids = await getTenantShopUuids(db, c.get("tenantId") || "default");

			const { salesDataByShopName, grandTotalSell, grandTotalRefund, dailySell } =
				await getSalesgardenReportData(db, shopUuids, since, until);

			const cashOutcomeData = await getDocumentsByCashOutcomeData(
				db,
				shopUuids,
				since,
				until,
			);

			const grandTotalCashOutcome = calculateTotalSum(cashOutcomeData);
			const cash = await getCashByShopsFromD1(db, shopUuids);

			const salesByGroup = await getSalesByProductGroup(db, since, until, shopUuids);

			return c.json({
				salesDataByShopName,
				grandTotalSell,
				grandTotalRefund,
				grandTotalCashOutcome,
				dailySell,
				cashOutcomeData,
				cash,
				salesByGroup,
			});
		} catch (error) {
			console.error("Ошибка при обработке запроса:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})
	.post("/api/evotor/sales-garden-report", async (c) => {
		try {
			const db = c.get("db");
			const data = await c.req.json();

			const { startDate, endDate } = data;

			// Изоляция tenant: только магазины текущего tenant
			const tenantId = c.get("tenantId") || "default";
			const shopUuids = await getTenantShopUuids(db, tenantId);

			// Пустой tenant → 200 с нулями, а не 400
			if (shopUuids.length === 0) {
				return c.json({
					salesDataByShopName: {},
					grandTotalSell: 0,
					grandTotalRefund: 0,
					grandTotalCashOutcome: 0,
					dailySell: {},
					startDate,
					endDate,
					cashOutcomeData: {},
					cashBalanceByShop: {},
					totalCashBalance: 0,
					topProducts: [],
					salesByGroup: { vape: 0, accessory: 0, other: 0 },
				});
			}

			const sincetDate = new Date(startDate); // Преобразуем в объект Date
			const untilDate = new Date(endDate); // Преобразуем в объект Date

			const since = formatDateWithTime(sincetDate, false); // Форматируем начальную дату
			const until = formatDateWithTime(untilDate, true); // Форматируем конечную дату

			// const filteredUuids = shopUuids.filter(
			// 	(uuid: string) => uuid !== "20231001-6611-407F-8068-AC44283C9196",
			// );

			const { salesDataByShopName, grandTotalSell, grandTotalRefund, dailySell } =
				await getSalesgardenReportData(db, shopUuids, since, until);

			const cashOutcomeData = await getDocumentsByCashOutcomeData(
				db,
				shopUuids,
				since,
				until,
			);

			const topProducts = await getTopProductsFromD1(
				c.env.DB,
				since,
				until,
				10,
				shopUuids,
			);

			// Прибыль/маржа только для SUPERADMIN/ADMIN — вырезаем поля у CASHIER и гостей
			const role = c.get("role") as string;
			const canSeeProfit = role === "SUPERADMIN" || role === "ADMIN";
			const scopedTopProducts = canSeeProfit
				? topProducts
				: topProducts.map(({ grossProfit: _gp, marginPct: _mp, ...rest }) => rest);

			// const aiWithRun = c.var.ai as any;
			// const evo = c.var.evotor;

			// 			const docs = await evo.getDocuments(shopUuids[2], since, until);

			// 			const salesAnalysisSchema = {
			// 				name: "sales-analysis",
			// 				prompt: (docs: Document[]) => `
			//     Проанализируй эти документы: ${JSON.stringify(docs)}
			//     Верни результат в формате: { "summary": string }
			//   `,
			// 				outputSchema: z.object({
			// 					summary: z.string(),
			// 				}),
			// 			};

			// const d = await c.var.evotor.getDocuments(shopUuids[2], since, until);

			// const f = prepareDocumentsForAI(d);

			// const aiWithRun = c.var.ai as any;

			// const response = await analyzeSalesDocuments(f, aiWithRun);
			// console.log("Результат анализа:", response);

			const cashBalanceByShop = await getCashByShopsFromD1(db, shopUuids);
			const totalCashBalance = Object.values(cashBalanceByShop).reduce((s, v) => s + v, 0);

			const grandTotalCashOutcome = calculateTotalSum(cashOutcomeData);

			const salesByGroup = await getSalesByProductGroup(db, since, until, shopUuids);

			return c.json({
				salesDataByShopName,
				grandTotalSell,
				grandTotalRefund,
				grandTotalCashOutcome,
				dailySell,
				startDate,
				endDate,
				cashOutcomeData,
				cashBalanceByShop,
				totalCashBalance,
				topProducts: scopedTopProducts,
				salesByGroup,
			});
		} catch (error) {
			console.error("[sales-garden-report] error:", error);
			return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
		}
	})

	.post("/api/profit-report", requireAdmin, async (c) => {
		try {
			// Получаем данные из запроса
			const body = await c.req.json<{
				shopUuids: string[];
				since: string;
				until: string;
				dataFrom1C: Record<string, { expenses: number; grossProfit: number }>; // { shopUuid: {expenses, grossProfit} }
			}>();

			const { shopUuids, since, until, dataFrom1C } = body;

			if (!Array.isArray(shopUuids) || shopUuids.length === 0) {
				return c.json({ error: "Не переданы UUID магазинов" }, 400);
			}

			// 1. Получаем расходы из Evo
			const evoData = await c.var.evotor.getExpensesByCategories(
				shopUuids,
				since,
				until,
			);

			// 2. Формируем отчет по каждому магазину
			const report: Record<
				string,
				{
					byCategory: Record<string, number>;
					totalEvoExpenses: number;
					expenses1C: number;
					grossProfit: number;
					netProfit: number;
				}
			> = {};

			for (const shopUuid of shopUuids) {
				const evoShopData = evoData[shopUuid] || {
					byCategory: {},
					total: 0,
				};
				const data1C = dataFrom1C[shopUuid] || {
					expenses: 0,
					grossProfit: 0,
				};

				// Чистая прибыль = Валовая прибыль - расходы Evo + расходы 1С
				const netProfit =
					(data1C.grossProfit || 0) -
					(evoShopData.total || 0) +
					(data1C.expenses || 0);

				report[shopUuid] = {
					byCategory: evoShopData.byCategory,
					totalEvoExpenses: evoShopData.total,
					expenses1C: data1C.expenses,
					grossProfit: data1C.grossProfit,
					netProfit,
				};
			}

			// 3. Возвращаем результат
			return c.json({
				period: { since, until },
				report,
			});
		} catch (error) {
			console.error("Ошибка при формировании отчета:", error);
			return c.json({ error: "Ошибка при формировании отчета" }, 500);
		}
	})

	// @deprecated — use /api/stores/is-open-store instead. Удалить через 2 релиза.
	.post("/api/is-open-store", async (c) => {
		try {
			const data = await c.req.json();
			const { userId, date } = data; // date в формате "dd-mm-yyyy"

			const db = c.env.DB;

			// Разбираем дату и проверяем наличие записи
			const exists = await isOpenStoreExists(db, userId, date);

			return c.json({ exists });
		} catch (err) {
			console.error("Ошибка в /api/is-open-store:", err);
			return c.json({ exists: false, error: "Ошибка сервера" }, 500);
		}
	})
	// @deprecated — use /api/stores/open-store instead. Удалить через 2 релиза.
	.post("/api/open-store", async (c) => {
		const data = await c.req.json();
		const { userId, timestamp } = data;

		const db = c.env.DB;

		// Создаём таблицу, если её нет
		// await createOpenStorsTable(db);

		// Сохраняем новую строку открытия магазина
		await saveOpenStorsTable(db, {
			date: timestamp,
			userId,
			cash: null, // пока нет данных кассы
			sign: null, // открытие
			ok: null, // ещё не проверено
		});

		return c.json({ ok: true });
	})
	// Генерация отчёта «мёртвые остатки» — товары без продаж
	// Параметры: startDate, endDate, shopIds (string[] | null), groups (string[])
	.post("/api/dead-stocks/data", async (c) => {
		try {
			const db = c.get("db");
			const { startDate, endDate, shopIds, groups } = await c.req.json<{
				startDate: string;
				endDate: string;
				shopIds: string[] | null;
				groups: string[];
			}>();

			// Список магазинов
			let targetShopUuids: string[] = [];
			if (shopIds && shopIds.length > 0) {
				targetShopUuids = shopIds;
			} else {
				const allShops = await db.prepare("SELECT uuid FROM shops").all<{ uuid: string }>();
				targetShopUuids = (allShops.results ?? []).map(s => s.uuid);
			}
			if (targetShopUuids.length === 0) {
				return c.json({ salesData: [], shopName: "Все магазины", startDate, endDate,
					totalFrozenCost: 0, categories: [] });
			}

			// Имена магазинов и групп
			const shopRows = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>();
			const shopNameMap = new Map(shopRows.results?.map(r => [r.uuid, r.name]) ?? []);
			const groupRows = await db.prepare("SELECT uuid, name FROM shopProduct WHERE product_group = 1").all<{ uuid: string; name: string }>();
			const groupNameMap = new Map(groupRows.results?.map(r => [r.uuid, r.name]) ?? []);

			// Себестоимость из 1С
			const costRows = await db.prepare("SELECT productName, costPrice FROM product_cost_prices").all<{ productName: string; costPrice: number }>();
			const costByName = new Map<string, number>();
			for (const r of costRows.results ?? []) costByName.set(r.productName, r.costPrice);

			const allSalesData: any[] = [];
			const nowStr = new Date().toISOString().slice(0, 10);

			for (const shopUuid of targetShopUuids) {
				const shopName = shopNameMap.get(shopUuid) || shopUuid;

				// Все товары с остатком > 0
				let prodQuery = `SELECT uuid, name, article, parentUuid, quantity
				                 FROM shopProduct WHERE shopId = ? AND product_group = 0 AND quantity > 0`;
				const prodBinds: any[] = [shopUuid];
				if (groups && groups.length > 0) {
					const ph = groups.map(() => "?").join(",");
					prodQuery += ` AND parentUuid IN (${ph})`;
					prodBinds.push(...groups);
				}
				const products = await db.prepare(prodQuery).bind(...prodBinds).all<{
					uuid: string; name: string; article: string | null;
					parentUuid: string | null; quantity: number;
				}>();
				const productRows = products.results ?? [];
				if (productRows.length === 0) continue;

				const productMap = new Map(productRows.map(p => [p.uuid, p]));

				// Сканируем ВСЕ документы за 90 дней для lastSaleDate
				const since90 = new Date(); since90.setDate(since90.getDate() - 90);
				const soldQtyByUuid = new Map<string, number>();
				const lastSaleByUuid = new Map<string, string>();

				const docs = await db.prepare(
					`SELECT type, transactions, close_date FROM index_documents
					 WHERE shop_id = ? AND close_date >= ? AND type IN ('SELL', 'PAYBACK')`
				).bind(shopUuid, since90.toISOString().slice(0,10) + "T00:00:00").all<{
					type: string; transactions: string; close_date: string;
				}>();

				for (const doc of docs.results ?? []) {
					const isRefund = doc.type === "PAYBACK";
					const sign = isRefund ? -1 : 1;
					const day = doc.close_date.slice(0, 10);
					let txs: any[];
					try { txs = JSON.parse(doc.transactions); } catch { continue; }
					if (!Array.isArray(txs)) continue;
					for (const tx of txs) {
						if (tx.type !== "REGISTER_POSITION" || !tx.commodityUuid) continue;
						const uuid = tx.commodityUuid;
						if (!productMap.has(uuid)) continue;
						if (day >= startDate && day <= endDate) {
							soldQtyByUuid.set(uuid, (soldQtyByUuid.get(uuid) ?? 0) + (tx.quantity ?? 0) * sign);
						}
						if (!lastSaleByUuid.has(uuid) || day > lastSaleByUuid.get(uuid)!) {
							lastSaleByUuid.set(uuid, day);
						}
					}
				}

				// Длительность периода в днях
				const periodDays = Math.max(1,
					Math.floor((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1
				);

				// Классификация A/B/C/D
				const classify = (soldQty: number, daysWithout: number, quantity: number): string => {
					if (soldQty <= 0) return "A";
					if (daysWithout > periodDays / 2) return "B";
					if (soldQty < 3) return "C";
					if (quantity / Math.max(soldQty, 1) > 12) return "D";
					return "";
				};

				// Собираем товары — только с категорией (проблемные)
				for (const [uuid, p] of productMap) {
					const soldQty = soldQtyByUuid.get(uuid) ?? 0;
					const lastSale = lastSaleByUuid.get(uuid) || null;
					const daysWithoutSales = lastSale
						? Math.floor((new Date(nowStr).getTime() - new Date(lastSale).getTime()) / 86400000)
						: 999;
					const category = classify(soldQty, daysWithoutSales, p.quantity);
					if (!category) continue;

					const unitCost = costByName.get(p.name) ?? null;
					const totalFrozenCost = (unitCost != null) ? Math.round(p.quantity * unitCost * 100) / 100 : null;

					allSalesData.push({
						itemId: uuid, name: p.name, article: p.article || "",
						quantity: p.quantity,
						sold: soldQty,
						lastSaleDate: lastSale,
						daysWithoutSales,
						category,
						shopId: shopUuid, shopName,
						unitCost, totalFrozenCost,
						parentUuid: p.parentUuid || null,
						groupName: p.parentUuid ? (groupNameMap.get(p.parentUuid) || null) : null,
					});
				}
			}

			allSalesData.sort((a, b) => b.daysWithoutSales - a.daysWithoutSales || a.name.localeCompare(b.name));

			const totalFrozenCost = allSalesData.reduce((s, i) => s + (i.totalFrozenCost ?? 0), 0);
			const catMap = new Map<string, { groupName: string; totalFrozenCost: number; itemCount: number }>();
			for (const i of allSalesData) {
				const gKey = i.parentUuid || "__none__";
				const gName = i.groupName || "Без категории";
				if (!catMap.has(gKey)) catMap.set(gKey, { groupName: gName, totalFrozenCost: 0, itemCount: 0 });
				const c = catMap.get(gKey)!;
				c.totalFrozenCost += i.totalFrozenCost ?? 0;
				c.itemCount += 1;
			}
			const categories = [...catMap.values()]
				.map(c => ({ ...c, totalFrozenCost: Math.round(c.totalFrozenCost * 100) / 100,
					share: totalFrozenCost > 0 ? Math.round((c.totalFrozenCost / totalFrozenCost) * 10000) / 100 : 0 }))
				.sort((a, b) => b.totalFrozenCost - a.totalFrozenCost);

			const displayName = targetShopUuids.length === 1
				? allSalesData[0]?.shopName || "Магазин" : "Все магазины";

			return c.json({ salesData: allSalesData, shopName: displayName, startDate, endDate,
				totalFrozenCost: Math.round(totalFrozenCost * 100) / 100, categories });
		} catch (err) {
			console.error("dead-stocks/data error:", err);
			return c.json({ salesData: [], shopName: "", startDate: "", endDate: "",
				totalFrozenCost: 0, categories: [] }, 500);
		}
	})

	// ─── Сохранение отчёта как HTML-страницы ───
	.post("/api/dead-stocks/save-report", async (c) => {
		try {
			const db = c.get("db");
			const crypto = await import("crypto");
			const body = await c.req.json<{
				since?: string; until?: string;
				daysWithoutSales?: number;
				shopId?: string;
				title?: string;
				plannedActions?: Array<{
					name: string; article?: string; shopName: string;
					action: string; quantity: number;
					targetShop?: string; reason?: string;
				}>;
			}>();
			const title = body.title || "Отчёт";

			let html: string;
			let id: string;

			if (body.plannedActions && body.plannedActions.length > 0) {
				// ── Режим: страница с запланированными действиями ──
				const actions = body.plannedActions;
				const actionLabels: Record<string, string> = {
					move: "Переместить", writeoff: "Списать", promo: "Промо", keep: "Оставить",
				};
				const moveCount = actions.filter(a => a.action === "move").length;
				const writeoffCount = actions.filter(a => a.action === "writeoff").length;
				const promoCount = actions.filter(a => a.action === "promo").length;
				const keepCount = actions.filter(a => a.action === "keep").length;
				const totalQty = actions.reduce((s, a) => s + a.quantity, 0);

				const rows = actions.map(a => `
					<tr>
						<td>${a.name.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</td>
						<td>${(a.article || "").replace(/&/g,"&amp;")}</td>
						<td>${actionLabels[a.action] || a.action}</td>
						<td class="num">${a.quantity}</td>
						<td>${a.shopName}</td>
						<td>${a.targetShop || ""}</td>
						<td>${(a.reason || "").replace(/&/g,"&amp;")}</td>
					</tr>`).join("");

				const now = new Date();
				const exp = new Date(now); exp.setDate(exp.getDate() + 30);
				let html = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>План действий — ${title}</title>
<style>:root{--bg:#fff;--fg:#111;--card:#f9fafb;--border:#e5e7eb;--muted:#6b7280}@media(prefers-color-scheme:dark){:root{--bg:#111827;--fg:#f9fafb;--card:#1f2937;--border:#374151;--muted:#9ca3af}}*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:var(--bg);color:var(--fg);padding:24px;max-width:1200px;margin:0 auto;line-height:1.5}header{border-bottom:2px solid var(--border);padding-bottom:16px;margin-bottom:24px}h1{font-size:24px;font-weight:700}.meta{font-size:14px;color:var(--muted);margin-top:4px}.kpi{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px}.kpi-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 16px;min-width:120px}.kpi-label{font-size:12px;color:var(--muted)}.kpi-value{font-size:20px;font-weight:700;margin-top:2px}table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;padding:8px 10px;background:var(--card);border-bottom:2px solid var(--border);font-weight:600;font-size:11px;text-transform:uppercase;color:var(--muted)}td{padding:6px 10px;border-bottom:1px solid var(--border)}.num{text-align:right;font-variant-numeric:tabular-nums}tr:hover td{background:var(--card)}footer{margin-top:32px;padding-top:16px;border-top:1px solid var(--border);font-size:12px;color:var(--muted)}</style></head><body>
<header><h1>План действий</h1><p class="meta">${title}</p><p class="meta">Сгенерировано: ${now.toLocaleString("ru-RU")} / Ссылка действительна до: ${exp.toLocaleDateString("ru-RU")}</p></header>
<div class="kpi"><div class="kpi-card"><div class="kpi-label">Всего товаров</div><div class="kpi-value">${actions.length}</div></div><div class="kpi-card"><div class="kpi-label">Всего единиц</div><div class="kpi-value">${totalQty}</div></div><div class="kpi-card"><div class="kpi-label">Переместить</div><div class="kpi-value">${moveCount}</div></div><div class="kpi-card"><div class="kpi-label">Списать</div><div class="kpi-value">${writeoffCount}</div></div><div class="kpi-card"><div class="kpi-label">Промо</div><div class="kpi-value">${promoCount}</div></div><div class="kpi-card"><div class="kpi-label">Оставить</div><div class="kpi-value">${keepCount}</div></div></div>
<table><thead><tr><th>Товар</th><th>Артикул</th><th>Действие</th><th class="num">Кол-во</th><th>Магазин</th><th>Куда</th><th>Причина</th></tr></thead><tbody>${rows}</tbody></table>
<footer>Evo App / Ссылка действительна до ${exp.toLocaleDateString("ru-RU")}</footer></body></html>`;

				id = crypto.randomBytes(12).toString("hex");

				const fs = await import("fs");
				const dir = "./data/storage/reports/dead-stock";
				fs.mkdirSync(dir, { recursive: true });
				fs.writeFileSync(`${dir}/${id}.html`, html, "utf-8");

				const host = c.req.header("Host") || `localhost:${process.env.PORT || 3000}`;
				const proto = host.startsWith("localhost") ? "http" : "https";
				return c.json({
					url: `${proto}://${host}/reports/dead-stock/${id}`,
					expiresAt: exp.toISOString().slice(0, 10),
					size: html.length,
				});
			}

			// ── Режим: полный отчёт dead-stock ──
			else {
			const { generateDeadStockHtml } = await import("./services/reportHtml");
			const daysWithoutSales = body.daysWithoutSales ?? 14;
			const shopId = body.shopId || undefined;

				let prodQuery = `SELECT uuid, name, article, shopId, parentUuid, quantity, price, measureName
				                 FROM shopProduct WHERE product_group = 0 AND quantity > 0`;
				const binds: any[] = [];
				if (shopId) { prodQuery += ` AND shopId = ?`; binds.push(shopId); }
				const products = await db.prepare(prodQuery).bind(...binds).all<{
					uuid: string; name: string; article: string | null; shopId: string;
				parentUuid: string | null; quantity: number; price: number; measureName: string;
			}>();
			const productRows = products.results ?? [];

			const shopRows = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>();
			const shopNames = new Map(shopRows.results?.map(r => [r.uuid, r.name]) ?? []);
			const groupRows = await db.prepare("SELECT uuid, name FROM shopProduct WHERE product_group = 1").all<{ uuid: string; name: string }>();
			const groupNames = new Map(groupRows.results?.map(r => [r.uuid, r.name]) ?? []);
			const costRows = await db.prepare("SELECT productName, costPrice FROM product_cost_prices").all<{ productName: string; costPrice: number }>();
			const costByName = new Map<string, number>();
			for (const r of costRows.results ?? []) costByName.set(r.productName, r.costPrice);

			const lastSaleByKey = new Map<string, string>();
			const since90 = new Date(); since90.setDate(since90.getDate() - 90);
			const sinceStr = since90.toISOString().slice(0, 10);
			const shopIds = [...new Set(productRows.map(p => p.shopId))];
			for (const sid of shopIds) {
				const docs = await db.prepare(
					`SELECT transactions, close_date FROM index_documents
					 WHERE shop_id = ? AND close_date >= ? AND type IN ('SELL', 'PAYBACK')`
				).bind(sid, sinceStr + "T00:00:00").all<{ transactions: string; close_date: string }>();
				for (const doc of docs.results ?? []) {
					const day = doc.close_date.slice(0, 10);
					let txs: any[];
					try { txs = JSON.parse(doc.transactions); } catch { continue; }
					if (!Array.isArray(txs)) continue;
					for (const tx of txs) {
						if (tx.type !== "REGISTER_POSITION" || !tx.commodityUuid) continue;
						const key = `${tx.commodityUuid}|${sid}`;
						if (!lastSaleByKey.has(key) || day > lastSaleByKey.get(key)!) lastSaleByKey.set(key, day);
					}
				}
			}

			const nowStr = new Date().toISOString().slice(0, 10);
			const items: any[] = [];
			for (const p of productRows) {
				const key = `${p.uuid}|${p.shopId}`;
				const last = lastSaleByKey.get(key) || null;
				const days = last ? Math.floor((new Date(nowStr).getTime() - new Date(last).getTime()) / 86400000) : 999;
				if (days < daysWithoutSales) continue;
				const uc = costByName.get(p.name) ?? null;
				items.push({
					name: p.name, article: p.article || "", shopName: shopNames.get(p.shopId) || p.shopId,
					quantity: p.quantity, daysWithoutSales: days, lastSaleDate: last,
					unitCost: uc, totalFrozenCost: uc != null ? Math.round(p.quantity * uc * 100) / 100 : null,
					groupName: p.parentUuid ? (groupNames.get(p.parentUuid) || null) : null,
					price: p.price, measureName: p.measureName,
				});
			}
			items.sort((a, b) => b.daysWithoutSales - a.daysWithoutSales);

			const totalFrozenCost = items.reduce((s, i) => s + (i.totalFrozenCost ?? 0), 0);
			const catMap = new Map<string, { groupName: string; totalFrozenCost: number; itemCount: number }>();
			for (const i of items) {
				const gKey = i.groupName || "__none__";
				const gName = i.groupName || "Без категории";
				if (!catMap.has(gKey)) catMap.set(gKey, { groupName: gName, totalFrozenCost: 0, itemCount: 0 });
				const cc = catMap.get(gKey)!;
				cc.totalFrozenCost += i.totalFrozenCost ?? 0;
				cc.itemCount += 1;
			}
			const categories = [...catMap.values()].map(c => ({
				...c, totalFrozenCost: Math.round(c.totalFrozenCost * 100) / 100,
			})).sort((a, b) => b.totalFrozenCost - a.totalFrozenCost);

			const expiresAt = new Date(); expiresAt.setDate(expiresAt.getDate() + 30);
			const html = generateDeadStockHtml({
				generatedAt: new Date().toLocaleString("ru-RU"),
				expiresAt: expiresAt.toLocaleDateString("ru-RU"),
				periodLabel: body.title || `Мёртвые остатки ≥ ${daysWithoutSales} дн.`,
				threshold: daysWithoutSales,
				items, total: items.length,
				totalFrozenCost: Math.round(totalFrozenCost * 100) / 100,
				categories,
			});

			const id = crypto.randomBytes(12).toString("hex");
			const fs = await import("fs");
			const dir = "./data/storage/reports/dead-stock";
			fs.mkdirSync(dir, { recursive: true });
			fs.writeFileSync(`${dir}/${id}.html`, html, "utf-8");

			const host = c.req.header("Host") || `localhost:${process.env.PORT || 3000}`;
			const proto = host.startsWith("localhost") ? "http" : "https";
			const baseUrl = `${proto}://${host}`;
			return c.json({
				url: `${baseUrl}/reports/dead-stock/${id}`,
				expiresAt: expiresAt.toISOString().slice(0, 10),
				size: html.length,
			});
			} // end else (full report)
		} catch (err) {
			console.error("save-report error:", err);
			return c.json({ error: String(err) }, 500);
		}
	})

	// Отдача сохранённых HTML-отчётов
	.get("/reports/dead-stock/:id", async (c) => {
		try {
			const id = c.req.param("id");
			const fs = await import("fs");
			const filePath = `./data/storage/reports/dead-stock/${id}.html`;
			if (!fs.existsSync(filePath)) return c.text("Отчёт не найден или истёк", 404);
			const html = fs.readFileSync(filePath, "utf-8");
			return new Response(html, {
				headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" },
			});
		} catch (err) {
			return c.text("Ошибка загрузки отчёта", 500);
		}
	})

	// AI-анализ мёртвых остатков: авто-категоризация + рекомендации по переброске
	.post("/api/dead-stocks/ai-analysis", async (c) => {
		try {
			const db = c.get("db");
			const apiKey = (await resolveDeepseekKey(c.get("db"), c.get("tenantId"), c.env.DEEPSEEK_API_KEY)) || "";
			const { shopUuid, items } = await c.req.json<{
				shopUuid: string;
				items: { name: string; quantity: number }[];
			}>();

			if (!items?.length) return c.json({ analysis: [], summary: "" });

			// 1. Получаем список других магазинов
			const shopsResult = await db.prepare(
				"SELECT uuid, name FROM shops WHERE uuid != ?"
			).bind(shopUuid).all<{ uuid: string; name: string }>();
			const otherShops = shopsResult.results ?? [];

			// 2. Ищем продажи каждого товара в других магазинах за последние 30 дней
			const since = new Date();
			since.setDate(since.getDate() - 30);
			const sinceStr = since.toISOString().slice(0, 10);
			const untilStr = new Date().toISOString().slice(0, 10);

			const analysis: {
				name: string;
				quantity: number;
				category: "keep" | "move" | "sellout" | "writeoff";
				reason: string;
				moveToStore?: string;
				moveToStoreName?: string;
				monthlySales?: number;
			}[] = [];

			const noSalesItems: { name: string; quantity: number }[] = [];

			for (const item of items) {
				// Ищем продажи в других магазинах
				let foundStore: string | null = null;
				let foundStoreName: string | null = null;
				let maxSales = 0;

				for (const shop of otherShops) {
					const productRow = await db.prepare(
						"SELECT uuid FROM shopProduct WHERE shopId = ? AND name = ? LIMIT 1"
					).bind(shop.uuid, item.name).first<{ uuid: string }>();

					if (!productRow?.uuid) continue;

					const salesResult = await db.prepare(
						`SELECT SUM(CAST(JSON_EXTRACT(tx.value, '$.quantity') AS INTEGER)) as qty
						 FROM index_documents,
						 JSON_EACH(transactions) AS tx
						 WHERE shop_id = ? AND type = 'SELL'
						 AND close_date >= ? AND close_date <= ?
						 AND JSON_EXTRACT(tx.value, '$.commodityUuid') = ?`
					).bind(shop.uuid, sinceStr + "T00:00:00", untilStr + "T23:59:59", productRow.uuid)
						.first<{ qty: number | null }>();

					const qty = salesResult?.qty ?? 0;
					if (qty > maxSales) {
						maxSales = qty;
						foundStore = shop.uuid;
						foundStoreName = shop.name;
					}
				}

				if (foundStore && maxSales >= 3) {
					analysis.push({
						name: item.name,
						quantity: item.quantity,
						category: "move",
						reason: `Продаётся в «${foundStoreName}» — ${maxSales} шт. за 30 дней`,
						moveToStore: foundStore,
						moveToStoreName: foundStoreName,
						monthlySales: maxSales,
					});
				} else {
					noSalesItems.push(item);
				}
			}

			// 3. AI-категоризация для товаров без продаж нигде
			if (noSalesItems.length > 0 && apiKey) {
				const itemList = noSalesItems.map(i => `- ${i.name} (остаток: ${i.quantity} шт.)`).join("\n");
				const system = `Ты — эксперт по управлению товарными запасами в розничной сети вейп-магазинов.
Проанализируй список товаров, которые не продавались ни в одном магазине сети за последние 30 дней.
Для каждого товара выбери одну из трёх категорий:
- "keep" — оставить (сезонный товар, может понадобиться позже)
- "sellout" — распродать со скидкой (есть шанс продать по сниженной цене)
- "writeoff" — списать (просрочка, нет спроса, неликвид)

Ответь СТРОГО в JSON-формате:
{
  "items": [
    { "name": "Название товара", "category": "sellout", "reason": "почему" }
  ],
  "summary": "краткий анализ ситуации с мёртвыми остатками, 2-3 предложения"
}`;

				const user = `Магазин: вейп-сеть. Товары без продаж за 30 дней:\n${itemList}`;

				try {
					const aiText = await deepseekChat({
						apiKey,
						system,
						user,
						maxTokens: 1500,
						temperature: 0.3,
					});

					const jsonMatch = aiText.match(/\{[\s\S]*\}/);
					if (jsonMatch) {
						const aiResult = JSON.parse(jsonMatch[0]);
						for (const aiItem of (aiResult.items || [])) {
							analysis.push({
								name: aiItem.name,
								quantity: noSalesItems.find(i => i.name === aiItem.name)?.quantity ?? 0,
								category: aiItem.category || "writeoff",
								reason: aiItem.reason || "",
							});
						}
						// Добавляем AI-саммари
						analysis.unshift({
							name: "__summary__",
							quantity: 0,
							category: "keep",
							reason: aiResult.summary || "",
						} as any);
					}
				} catch (aiErr) {
					console.error("DeepSeek analysis error:", aiErr);
					// Если AI недоступен — помечаем все как sellout
					for (const item of noSalesItems) {
						analysis.push({
							name: item.name,
							quantity: item.quantity,
							category: "sellout",
							reason: "Нет продаж в сети — рекомендуется распродажа",
						});
					}
				}
			} else if (noSalesItems.length > 0) {
				// Нет API ключа — базовые правила
				for (const item of noSalesItems) {
					analysis.push({
						name: item.name,
						quantity: item.quantity,
						category: "sellout",
						reason: "Нет продаж в сети — рекомендуется распродажа",
					});
				}
			}

			const summaryItem = analysis.find(a => (a as any).name === "__summary__");
			const summary = summaryItem ? summaryItem.reason : "";
			const items_result = analysis.filter(a => (a as any).name !== "__summary__");

			return c.json({ analysis: items_result, summary });
		} catch (err) {
			console.error("ai-analysis error:", err);
			return c.json({ analysis: [], summary: "", error: String(err) }, 500);
		}
	})

	.post("/api/dead-stocks/update", async (c) => {
		const db = c.get("drizzle");

		const { shopUuid, items } = await c.req.json<
			SaveDeadStocksRequest & { userId: number }
		>();

		// ID группы Telegram (из env)
		const TELEGRAM_GROUP_ID = "5700958253";

		// 1️⃣ ОТПРАВКА В TELEGRAM (ДО сохранения)
		await sendDeadStocksToTelegram(
			{
				chatId: TELEGRAM_GROUP_ID,
				shopUuid,
				items,
			},
			c.env.BOT_TOKEN,
			c.var.evotor,
		);

		// 2️⃣ СОХРАНЕНИЕ В БД
		await saveDeadStocks(db, shopUuid, items);

		return c.json({ success: true });
	})
	// @deprecated — use /api/stores/finish-opening instead. Удалить через 2 релиза.
	.post("/api/finish-opening", async (c) => {
		const db = c.env.DB;

		const data = await c.req.json();

		const { ok, discrepancy, userId } = data;
		console.log("discrepancy:", discrepancy);
		console.log("ok:", ok);

		let cash = null;
		let sign = null;

		if (!ok && discrepancy) {
			cash = Number(discrepancy.amount);
			sign = discrepancy.type; // "+" или "-"
		}

		await updateOpenStore(db, userId, { cash, sign });

		return c.json({ success: true });
	})

	// Внутренний эндпоинт для локального планировщика
	.post("/api/internal/sync/:task", async (c) => {
		const task = c.req.param("task");
		const env = c.env;

		const tasks: Record<string, { label: string; run: (e: IEnv["Bindings"]) => Promise<void> }> = {
			documents: { label: "синхронизация документов", run: syncDocuments },
			shops: { label: "синхронизация магазинов", run: updateProductsShope },
			products: { label: "синхронизация товаров", run: updateProducts },
			stock: { label: "синхронизация остатков", run: syncStock },
			salary: { label: "расчёт ЗП", run: getDataForCurrentDate },
			"push-check": {
				label: "push-уведомления",
				run: async (e) => {
					const { runPushCycle } = await import("./push/pushScheduler.js");
					// Внутренние задачи используют env, а не c.get("db")
					await runPushCycle(e.DB);
				},
			},
		};

		const entry = tasks[task];
		if (!entry) {
			return c.json({ error: `Unknown task: ${task}`, available: Object.keys(tasks) }, 400);
		}

		console.log(`[internal] Запуск задачи: ${entry.label}`);
		const start = Date.now();
		await entry.run(env);
		const elapsed = ((Date.now() - start) / 1000).toFixed(1);

		return c.json({ ok: true, task: entry.label, elapsed: `${elapsed}s` });
	})

	// ============================================================================
	// Compatibility routes for reference frontend
	// These match the paths expected by the demossml/workApp frontend
	// ============================================================================

	// --- /api/stores/* (opening) ---
	.post("/api/stores/pos-sessions", async (c) => {
		return c.json({ sessions: [] });
	})
	.post("/api/stores/shops-opening-status", async (c) => {
		try {
			const { date } = await c.req.json<{ date: string }>();
			const db = c.env.DB;
			const evo = c.var.evotor;

			// Разбираем дату dd-mm-yyyy → ISO
			const [day, month, year] = (date || "").split("-").map(Number);
			const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0)).toISOString();
			const endDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59)).toISOString();

			// Получаем все магазины
			const shopsResult = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>(); const shops = (shopsResult.results ?? []) as Array<{ uuid: string; name: string }>;
			if (!shops?.length) {
				return c.json({ shopsNameAndUuid: [] });
			}

			// Получаем записи открытия за сегодня
			const openRecords = await db.prepare(`
				SELECT shop_uuid, userId, user_name, date as openedAt
				FROM openStors
				WHERE date(date) >= date(?)
				  AND date(date) <= date(?)
				  AND shop_uuid IS NOT NULL
			`)
				.bind(startDate, endDate)
				.all<{ shop_uuid: string; userId: string; user_name: string | null; openedAt: string }>();

			const openedShops = new Map<string, { userId: string; userName: string | null; openedAt: string }>();
			for (const row of openRecords.results || []) {
				openedShops.set(row.shop_uuid, {
					userId: row.userId,
					userName: row.user_name,
					openedAt: row.openedAt,
				});
			}

			// Желаемое время открытия: 09:00
			const desiredOpenHour = 9;
			const desiredOpenMinute = 0;

			const shopsNameAndUuid = shops.map((shop) => {
				const opened = openedShops.get(shop.uuid);
				if (!opened) {
					return { uuid: shop.uuid, name: shop.name, isOpenedToday: false, canSelect: true };
				}

				// Уже открыт — проверяем опоздание
				const openedDate = new Date(opened.openedAt);
				const openedHour = openedDate.getUTCHours();
				const openedMinute = openedDate.getUTCMinutes();
				const isLate = openedHour > desiredOpenHour ||
					(openedHour === desiredOpenHour && openedMinute > desiredOpenMinute);

				return {
					uuid: shop.uuid,
					name: shop.name,
					isOpenedToday: true,
					openedByUserId: opened.userId,
					openedByName: opened.userName,
					openedAt: opened.openedAt,
					openedTime: `${String(openedHour).padStart(2, "0")}:${String(openedMinute).padStart(2, "0")}`,
					isLate,
					canSelect: false,
					blockedReason: `Уже открыт${opened.userName ? `: ${opened.userName}` : ""}`,
				};
			});

			return c.json({ shopsNameAndUuid });
		} catch (err) {
			console.error("[shops-opening-status] error:", err);
			return c.json({ shopsNameAndUuid: [] });
		}
	})
	.post("/api/stores/open-store", async (c) => {
		const data = await c.req.json();
		const { userId, timestamp, shopUuid, userName } = data;
		const db = c.env.DB;
		const evo = c.var.evotor;

		// Получаем название магазина
		let shopName: string | undefined;
		try {
			const shopsResult = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>(); const shops = (shopsResult.results ?? []) as Array<{ uuid: string; name: string }>;
			shopName = shops.find((s) => s.uuid === shopUuid)?.name;
		} catch {
			// название не критично
		}

		await saveOpenStorsTable(db, {
			date: timestamp,
			userId,
			shopUuid,
			shopName: shopName ?? null,
			userName: userName ?? null,
			cash: null,
			sign: null,
			ok: null,
		});
		return c.json({ ok: true });
	})
	.post("/api/stores/finish-opening", async (c) => {
		const db = c.env.DB;
		const data = await c.req.json();
		const { ok, discrepancy, userId, answers } = data;
		let cash: number | null = null;
		let sign: string | null = null;
		if (!ok && discrepancy) {
			cash = Number(discrepancy.amount);
			sign = discrepancy.type;
		}
		const answersJson = answers ? JSON.stringify(answers) : null;
		await updateOpenStore(db, userId, { cash, sign, answers: answersJson });
		return c.json({ success: true });
	})
	.post("/api/stores/is-open-store", async (c) => {
		const data = await c.req.json();
		const { userId, date } = data;
		const db = c.env.DB;
		const exists = await isOpenStoreExists(db, userId, date);
		return c.json({ exists });
	})

	// --- /api/stores/openings-report ---
	.post("/api/stores/openings-report", async (c) => {
		try {
			const { startDate, endDate } = await c.req.json<{ startDate: string; endDate: string }>();
			const db = c.env.DB;
			const evo = c.var.evotor;

			const totalRequired = 7; // area:2, stock:3, cash:1, mrc:1

			// Получаем записи открытия за период
			// Используем date() для корректного сравнения дат
			const rows = await db.prepare(`
				SELECT id, date, userId, shop_uuid, shop_name, user_name, cash, sign, ok
				FROM openStors
				WHERE date(date) >= date(?)
				  AND date(date) <= date(?)
				  AND shop_uuid IS NOT NULL
				ORDER BY date DESC
			`)
				.bind(startDate, endDate)
				.all<{
					id: number; date: string; userId: string; shop_uuid: string;
					shop_name: string | null; user_name: string | null;
					cash: number | null; sign: string | null; ok: number | null;
				}>();

			// Получаем все магазины для проверки неоткрытых
			const shopsResult = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>(); const shops = (shopsResult.results ?? []) as Array<{ uuid: string; name: string }>;

			// Для каждого открытия получаем фото
			const records: OpeningRecord[] = [];

			for (const row of rows.results || []) {
				const photoRows = await db.prepare(`
					SELECT COUNT(*) as cnt FROM opening_photos
					WHERE shop_uuid = ? AND user_id = ? AND date = ?
				`)
					.bind(row.shop_uuid, row.userId, row.date.slice(0, 10))
					.first<{ cnt: number }>();

				const photoCount = photoRows?.cnt ?? 0;

				const openedDate = new Date(row.date);
				const openedHour = openedDate.getUTCHours();
				const isLate = openedHour > 9 || (openedHour === 9 && openedDate.getUTCMinutes() > 0);

				let cashStatus: OpeningRecord["cashStatus"] = "not_checked";
				let cashMessage: string | null = null;

				if (row.ok === 1 || row.ok === 0) {
					if (row.cash != null && row.sign) {
						if (row.cash === 0) {
							cashStatus = "ok";
						} else {
							cashStatus = row.sign === "+" ? "surplus" : "shortage";
							cashMessage = `${row.sign}${row.cash} ₽`;
						}
					} else {
						cashStatus = "ok";
					}
				}

				const hasCashCheck = row.ok != null;
				const completion = Math.round(
					(Math.min(photoCount, totalRequired) / totalRequired) * 50 +
					(hasCashCheck ? 50 : 0),
				);

				records.push({
					shopUuid: row.shop_uuid,
					shopName: row.shop_name || row.shop_uuid,
					employeeId: row.userId,
					employeeName: row.user_name || row.userId,
					openedAt: row.date,
					isLate,
					photoCount,
					requiredPhotoCount: totalRequired,
					hasCashCheck,
					cashStatus,
					cashMessage,
					completionPercent: completion,
				});
			}

			// Определяем неоткрытые магазины
			const openedShopUuids = new Set((rows.results || []).map((r) => r.shop_uuid));
			const notOpenedShops = shops.filter((s) => !openedShopUuids.has(s.uuid)).length;

			let avgCompletion = 0;
			if (records.length > 0) {
				avgCompletion = Math.round(
					records.reduce((s, r) => s + r.completionPercent, 0) / records.length,
				);
			}

			const summary = {
				startDate,
				endDate,
				totalShops: shops.length,
				openedShops: openedShopUuids.size,
				notOpenedShops: notOpenedShops,
				avgCompletion,
				withCashDiscrepancy: records.filter(
					(r) => r.cashStatus === "surplus" || r.cashStatus === "shortage",
				).length,
				missingPhotos: records.filter((r) => r.photoCount < totalRequired).length,
			};

			return c.json({ summary, records });
		} catch (err) {
			console.error("[openings-report] error:", err);
			return c.json({ summary: null, records: [] }, 500);
		}
	})

	// --- /api/stores/opening-photos ---
	.post("/api/stores/opening-photos", async (c) => {
		try {
			const { shopUuid, userId, openedAt } = await c.req.json<{
				shopUuid: string; userId: string; openedAt: string;
			}>();
			const db = c.env.DB;
			const botToken = c.env.TELEGRAM_STORAGE_BOT_TOKEN || c.env.BOT_TOKEN;

			// Извлекаем дату из openedAt (YYYY-MM-DD)
			const date = openedAt.slice(0, 10);

			const rows = await db.prepare(`
				SELECT category, slot_index, telegram_file_id
				FROM opening_photos
				WHERE shop_uuid = ? AND user_id = ? AND date = ?
				ORDER BY category, slot_index
			`)
				.bind(shopUuid, userId, date)
				.all<{ category: string; slot_index: number; telegram_file_id: string }>();

			const photos = await Promise.all(
				(rows.results || []).map(async (row) => {
					try {
						const url = await getTelegramFile(row.telegram_file_id, botToken);
						return {
							key: `${row.category}_${row.slot_index}`,
							url,
							category: row.category,
						};
					} catch {
						return {
							key: `${row.category}_${row.slot_index}`,
							url: "",
							category: row.category,
						};
					}
				}),
			);

			return c.json({ photos });
		} catch (err) {
			console.error("[opening-photos] error:", err);
			return c.json({ photos: [] }, 500);
		}
	})

	// --- /api/deadStocks/update (camelCase, @deprecated — use /api/dead-stocks/update) ---
	.post("/api/deadStocks/update", async (c) => {
		const db = c.get("drizzle");
		const { shopUuid, items } = await c.req.json<SaveDeadStocksRequest>();
		const TELEGRAM_GROUP_ID = "5700958253";
		await sendDeadStocksToTelegram(
			{ chatId: TELEGRAM_GROUP_ID, shopUuid, items },
			c.env.BOT_TOKEN,
			c.var.evotor,
		);
		await saveDeadStocks(db, shopUuid, items);
		return c.json({ success: true });
	})

	// --- /api/employees/register (alias for /api/register) ---
	.post("/api/employees/register", async (c) => {
		const data = await c.req.json<{ userId: string }>();
		const { userId } = data;
		if (!userId) {
			return c.json({ success: false, error: "userId required" }, 400);
		}
		// Basic registration — mark as registered
		return c.json({ success: true, userId });
	})

	// --- /api/ai/* stubs ---
	.post("/api/ai/insights", async (c) => {
		try {
			const { startDate, endDate, shopUuid } = await c.req.json<{
				startDate: string;
				endDate: string;
				shopUuid?: string;
			}>();
			const evo = c.var.evotor;

			// Convert date strings to Evotor ISO range (format: YYYY-MM-DDTHH:mm:ss.sss+0000)
			const pad = (n: number) => String(n).padStart(2, "0");
			const fmt = (d: Date, endOfDay: boolean) => {
				const Y = d.getFullYear();
				const M = pad(d.getMonth() + 1);
				const D = pad(d.getDate());
				const h = endOfDay ? "21" : "03";
				return `${Y}-${M}-${D}T${h}:00:00.000+0000`;
			};
			const since = fmt(new Date(startDate), false);
			const until = fmt(new Date(endDate), true);

			const docs = await evo.getAllDocumentsByTypes(since, until);
			let docFiltered = await evo.extractSalesInfo(docs);

			// Filter by shop if shopUuid provided
			if (shopUuid) {
				const shopName = await evo.getShopName(shopUuid);
				docFiltered = docFiltered.filter(
					(d: any) => d.shopName === shopName,
				);
			}

			// Run all three analysis tasks in parallel
			const [anomaliesResult, insightsResult, patternsResult] =
				await Promise.all([
					analyzeDocsAnomaliesTask(c, docFiltered).catch((e) => {
						console.error("Anomalies task failed:", e);
						return { anomalies: [] };
					}),
					analyzeDocsInsightsTask(c, docFiltered).catch((e) => {
						console.error("Insights task failed:", e);
						return { insights: [] };
					}),
					analyzeDocsPatternsTask(c, docFiltered).catch((e) => {
						console.error("Patterns task failed:", e);
						return { patterns: [] };
					}),
				]);

			return c.json({
				anomalies: (anomaliesResult as any).anomalies?.map((a: any) => ({
					type: a.reason || "anomaly",
					reason: a.reason || "",
					details: a.details,
					priority: "medium" as const,
				})) || [],
				insights: (insightsResult as any).insights?.map((text: string) => ({
					priority: "medium" as const,
					action: text,
					reason: "",
					expectedResult: "",
				})) || [],
				patterns: (patternsResult as any).patterns?.map(
					(p: any) => ({
						category: "other" as const,
						pattern: p.description || "",
						data: p.evidence || "",
					}),
				) || [],
				documentsCount: docFiltered.length,
			});
		} catch (err: any) {
			console.error("/api/ai/insights error:", err);
			return c.json(
				{ error: err?.message || "AI analysis failed" },
				500,
			);
		}
	})

	.post("/api/ai/dashboard-summary2-insights", async (c) => {
		return c.json({ insights: [] });
	})

	// --- /api/admin/data-mode ---
	.get("/api/admin/data-mode", async (c) => {
		return c.json({ mode: "DB", meta: { source: "DB", aiAvailable: true } });
	})
	.post("/api/admin/data-mode", async (c) => {
		const { mode } = await c.req.json<{ mode: string }>();
		return c.json({ ok: true, mode: mode || "DB", meta: { source: (mode || "DB") as "DB" | "ELVATOR", aiAvailable: true } });
	})

	// --- /api/admin/cost-prices ---
	// Загрузка себестоимости из CSV
	.post("/api/admin/cost-prices/upload", requireAdmin, async (c) => {
		try {
			const db = c.get("db");
			const body = await c.req.parseBody();
			const file = body.file;
			const effectiveDateRaw = body.effectiveDate as string | undefined;

			if (!file || typeof file === "string") {
				return c.json({ error: "Файл не найден. Отправьте файл в поле 'file' (multipart/form-data)." }, 400);
			}

			// Валидация effectiveDate
			let effectiveFrom: string | undefined;
			if (effectiveDateRaw) {
				const d = new Date(effectiveDateRaw + "T00:00:00+03:00");
				if (Number.isNaN(d.getTime())) {
					return c.json({ error: "effectiveDate: неверный формат даты (ожидается YYYY-MM-DD)" }, 400);
				}
				if (d > new Date()) {
					return c.json({ error: "effectiveDate: нельзя установить будущую дату" }, 400);
				}
				effectiveFrom = effectiveDateRaw + " 00:00:00";
			}

			const content = await file.text();
			if (!content || content.trim().length === 0) {
				return c.json({ error: "Файл пуст" }, 400);
			}

			const parseResult = parseCostPriceFile(content);

			if (parseResult.rows.length === 0) {
				return c.json({
					error: "Не удалось распарсить данные",
					details: parseResult.errors,
					meta: parseResult.meta,
				}, 400);
			}

			// Сохраняем с историей (SCD Type 2)
			const upsertResult = await upsertCostPricesWithHistory(db, parseResult.rows, effectiveFrom);

			// Пост-проверка: товары в наличии без цены в файле
			const filePriceNames = new Set(parseResult.rows.map(r => normalizeProductName(r.productName)));
			const allStockRows = await db
				.prepare("SELECT DISTINCT name FROM shopProduct WHERE product_group = 0 AND name IS NOT NULL AND name != ''")
				.all<{ name: string }>();
			const missingPrices: string[] = [];
			for (const r of allStockRows.results ?? []) {
				const norm = normalizeProductName(r.name);
				if (!filePriceNames.has(norm)) {
					missingPrices.push(r.name);
				}
			}
			const missingCount = missingPrices.length;
			const missingSample = missingPrices.slice(0, 10);

			return c.json({
				ok: true,
				...upsertResult,
				meta: parseResult.meta,
				effectiveDate: effectiveDateRaw || new Date().toISOString().slice(0, 10),
				warnings: parseResult.errors.length > 0 ? parseResult.errors.slice(0, 20) : undefined,
				missingPrices: missingCount > 0 ? {
					count: missingCount,
					sample: missingSample,
					message: `${missingCount} товаров в наличии не имеют цены в загруженном файле`,
				} : undefined,
			});
		} catch (err) {
			console.error("[cost-prices/upload] error:", err);
			return c.json({ error: String(err) }, 500);
		}
	})

	// Получить все загруженные себестоимости
	.get("/api/admin/cost-prices", requireAdmin, async (c) => {
		try {
			const db = c.get("db");
			const rows = await getAllCostPrices(db);
			return c.json({ rows, total: rows.length });
		} catch (err) {
			console.error("[cost-prices] error:", err);
			return c.json({ error: String(err) }, 500);
		}
	})

	// Удалить себестоимость по имени товара
	.delete("/api/admin/cost-prices/:productName", requireAdmin, async (c) => {
		try {
			const db = c.get("db");
			const productName = decodeURIComponent(c.req.param("productName"));
			const deleted = await deleteCostPrice(db, productName);

			if (!deleted) {
				return c.json({ error: "Товар не найден" }, 404);
			}

			return c.json({ ok: true, productName });
		} catch (err) {
			console.error("[cost-prices/delete] error:", err);
			return c.json({ error: String(err) }, 500);
		}
	})

	// --- /api/analytics/dead-stock/actions ---
	// Принимает массив действий, возвращает CSV-файл
	.post("/api/analytics/dead-stock/actions", async (c) => {
		try {
			const db = c.get("db");
			const actionLabels: Record<string, string> = {
				move: "Переместить",
				writeoff: "Списать",
				promo: "Промо",
				keep: "Оставить",
			};
			const body = await c.req.json<{
				actions: {
					itemId: string;
					shopId: string;
					action: "move" | "writeoff" | "promo" | "keep";
					targetShopId?: string;
					quantity?: number;
					reason?: string;
				}[];
			}>();

			const actions = body.actions ?? [];
			if (actions.length === 0) {
				return c.json({ error: "actions is empty" }, 400);
			}

			// Обогащаем action названиями товаров, магазинов и себестоимостью
			const enriched: {
				name: string;
				shopName: string;
				action: string;
				targetShop: string;
				quantity: number;
				unitCost: number | null;
				totalCostMoved: number | null;
				reason: string;
			}[] = [];

			for (const a of actions) {
				const item = await db.prepare(
					"SELECT sp.name, s.name as shopName, pcp.costPrice as unitCost FROM shopProduct sp LEFT JOIN shops s ON s.uuid = sp.shopId LEFT JOIN product_cost_prices pcp ON pcp.productName = sp.name WHERE sp.uuid = ? AND sp.shopId = ? LIMIT 1"
				).bind(a.itemId, a.shopId).first<{ name: string; shopName: string; unitCost: number | null }>();

				let targetShop = "—";
				if (a.targetShopId) {
					const shop = await db.prepare(
						"SELECT name FROM shops WHERE uuid = ?"
					).bind(a.targetShopId).first<{ name: string }>();
					targetShop = shop?.name || a.targetShopId;
				}

				const qty = a.quantity ?? 0;
				const unitCost = item?.unitCost ?? null;
				const totalCostMoved = (a.action === "move" && unitCost != null)
					? Math.round(qty * unitCost * 100) / 100
					: null;

				enriched.push({
					name: item?.name || a.itemId,
					shopName: item?.shopName || a.shopId,
					action: actionLabels[a.action] || a.action,
					targetShop,
					quantity: qty,
					unitCost,
					totalCostMoved,
					reason: a.reason || "",
				});
			}

			// Статистика
			const moveCount = enriched.filter(e => e.action === "Переместить").length;
			const moveQty = enriched.filter(e => e.action === "Переместить").reduce((s, e) => s + e.quantity, 0);
			const totalCostMovedSum = enriched
				.filter(e => e.action === "Переместить" && e.totalCostMoved != null)
				.reduce((s, e) => s + (e.totalCostMoved ?? 0), 0);
			const writeoffCount = enriched.filter(e => e.action === "Списать").length;
			const promoCount = enriched.filter(e => e.action === "Промо").length;
			const keepCount = enriched.filter(e => e.action === "Оставить").length;

			// CSV с BOM для Excel
			const BOM = "\uFEFF";
			const header = "Товар;Магазин;Действие;Куда;Количество;Цена закупки;Сумма по закупке;Причина";
			const rows = enriched.map(e => {
				const costStr = e.unitCost != null ? e.unitCost.toFixed(2) : "—";
				const totalStr = e.totalCostMoved != null ? e.totalCostMoved.toFixed(2) : "—";
				return `"${e.name}";"${e.shopName}";${e.action};"${e.targetShop}";${e.quantity};${costStr};${totalStr};"${e.reason}"`;
			});
			const summary = [
				"",
				"ИТОГО",
				`Переместить: ${moveCount} товаров, ${moveQty} шт`,
				`Сумма по закупке (перемещение): ${totalCostMovedSum.toFixed(2)} ₽`,
				`Списать: ${writeoffCount} товаров`,
				`Промо: ${promoCount} товаров`,
				`Оставить: ${keepCount} товаров`,
				`Дата: ${new Date().toISOString().slice(0, 10)}`,
			].map(s => `${s};;;;;;;`);

			const csv = BOM + [header, ...rows, ...summary].join("\n");

			return new Response(csv, {
				headers: {
					"Content-Type": "text/csv; charset=utf-8",
					"Content-Disposition": `attachment; filename="dead-stock-actions-${new Date().toISOString().slice(0, 10)}.csv"`,
				},
			});
		} catch (err) {
			console.error("dead-stock actions error:", err);
			return c.json({ error: String(err) }, 500);
		}
	})

	// --- /api/analytics/dead-stock ---
	// Параметры: daysWithoutSales (default 45), shopId, since, until
	// Классификация A/B/C/D на основе продаж за период
	.get("/api/analytics/dead-stock", async (c) => {
		try {
			const db = c.get("db");
			const daysWithoutSales = parseInt(c.req.query("daysWithoutSales") || "45");
			const shopIdRaw = c.req.query("shopId") || undefined;
			const shopId = (shopIdRaw && shopIdRaw !== "all" && shopIdRaw !== "null") ? shopIdRaw : undefined;
			const sinceParam = c.req.query("since");
			const untilParam = c.req.query("until");

			// Период для классификации (по умолчанию — threshold в днях от сегодня)
			const nowStr = new Date().toISOString().slice(0, 10);
			const periodEnd = untilParam || nowStr;
			const periodStart = sinceParam || new Date(new Date().getTime() - daysWithoutSales * 86400000).toISOString().slice(0, 10);
			const periodDays = Math.max(1,
				Math.floor((new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 86400000) + 1
			);

			// 1. Все товары с остатком > 0
			let productQuery = `SELECT uuid, name, article, shopId, parentUuid, quantity, price, measureName
			                    FROM shopProduct WHERE product_group = 0 AND quantity > 0`;
			const binds: any[] = [];
			if (shopId) { productQuery += ` AND shopId = ?`; binds.push(shopId); }
			const products = await db.prepare(productQuery).bind(...binds).all<{
				uuid: string; name: string; article: string | null;
				shopId: string; parentUuid: string | null;
				quantity: number; price: number; measureName: string;
			}>();
			const productRows = products.results ?? [];
			if (productRows.length === 0) {
				return c.json({ items: [], total: 0, totalFrozenCost: 0, categories: [],
					threshold: daysWithoutSales, shopId: shopId || null });
			}

			// 2. Имена магазинов и групп
			const shopRows = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>();
			const shopNames = new Map(shopRows.results?.map(r => [r.uuid, r.name]) ?? []);
			const groupRows = await db.prepare("SELECT uuid, name FROM shopProduct WHERE product_group = 1").all<{ uuid: string; name: string }>();
			const groupNames = new Map(groupRows.results?.map(r => [r.uuid, r.name]) ?? []);

			// 3. Себестоимость из 1С
			const costRows = await db.prepare("SELECT productName, costPrice FROM product_cost_prices").all<{ productName: string; costPrice: number }>();
			const costByName = new Map<string, number>();
			for (const r of costRows.results ?? []) costByName.set(r.productName, r.costPrice);

			// 4. Сканируем документы: lastSaleDate + soldQty за период
			const lastSaleByKey = new Map<string, string>();
			const soldQtyByKey = new Map<string, number>();
			const since90 = new Date(); since90.setDate(since90.getDate() - 90);
			const sinceStr = since90.toISOString().slice(0, 10);

			const shopIds = [...new Set(productRows.map(p => p.shopId))];
			for (const sid of shopIds) {
				const docs = await db.prepare(
					`SELECT transactions, close_date, type FROM index_documents
					 WHERE shop_id = ? AND close_date >= ? AND type IN ('SELL', 'PAYBACK')`
				).bind(sid, sinceStr + "T00:00:00").all<{ transactions: string; close_date: string; type: string }>();

				for (const doc of docs.results ?? []) {
					const isRefund = doc.type === "PAYBACK";
					const sign = isRefund ? -1 : 1;
					const day = doc.close_date.slice(0, 10);
					let txs: any[];
					try { txs = JSON.parse(doc.transactions); } catch { continue; }
					if (!Array.isArray(txs)) continue;
					for (const tx of txs) {
						if (tx.type !== "REGISTER_POSITION" || !tx.commodityUuid) continue;
						const key = `${tx.commodityUuid}|${sid}`;
						if (day >= periodStart && day <= periodEnd) {
							soldQtyByKey.set(key, (soldQtyByKey.get(key) ?? 0) + (tx.quantity ?? 0) * sign);
						}
						if (!lastSaleByKey.has(key) || day > lastSaleByKey.get(key)!) {
							lastSaleByKey.set(key, day);
						}
					}
				}
			}

			// 5. Классификация A/B/C/D
			const classify = (soldQty: number, daysWithout: number, quantity: number): string => {
				if (soldQty <= 0) return "A";
				if (daysWithout > periodDays / 2) return "B";
				if (soldQty < 3) return "C";
				if (quantity / Math.max(soldQty, 1) > 12) return "D";
				return "";
			};

			// 6. Собираем результат — только проблемные товары
			const items: any[] = [];
			for (const p of productRows) {
				const key = `${p.uuid}|${p.shopId}`;
				const lastSale = lastSaleByKey.get(key) || null;
				const days = lastSale
					? Math.floor((new Date(nowStr).getTime() - new Date(lastSale).getTime()) / 86400000)
					: 999;
				const soldQty = soldQtyByKey.get(key) ?? 0;
				const category = classify(soldQty, days, p.quantity);
				if (!category) continue;

				// Обратная совместимость: если задан daysWithoutSales, дополнительно фильтруем
				if (days < daysWithoutSales && category === "A") continue;

				const unitCost = costByName.get(p.name) ?? null;
				const totalFrozenCost = (unitCost != null) ? Math.round(p.quantity * unitCost * 100) / 100 : null;

				items.push({
					itemId: p.uuid, name: p.name, article: p.article || "",
					currentStock: p.quantity, daysWithoutSales: days,
					lastSaleDate: lastSale, sold: soldQty, category,
					shopId: p.shopId, shopName: shopNames.get(p.shopId) || p.shopId,
					totalRevenueLast90Days: 0, unitCost, totalFrozenCost,
					parentUuid: p.parentUuid || null,
					groupName: p.parentUuid ? (groupNames.get(p.parentUuid) || null) : null,
					updatedAt: nowStr, price: p.price, measureName: p.measureName,
				});
			}

			items.sort((a, b) => b.daysWithoutSales - a.daysWithoutSales || a.name.localeCompare(b.name));

			// 7. Итоги
			const totalFrozenCost = items.reduce((s, i) => s + (i.totalFrozenCost ?? 0), 0);
			const catMap = new Map<string, { groupName: string; totalFrozenCost: number; itemCount: number }>();
			for (const i of items) {
				const gKey = i.parentUuid || "__none__";
				const gName = i.groupName || "Без категории";
				if (!catMap.has(gKey)) catMap.set(gKey, { groupName: gName, totalFrozenCost: 0, itemCount: 0 });
				const c = catMap.get(gKey)!;
				c.totalFrozenCost += i.totalFrozenCost ?? 0;
				c.itemCount += 1;
			}
			const categories = [...catMap.values()]
				.map(c => ({ ...c, totalFrozenCost: Math.round(c.totalFrozenCost * 100) / 100,
					share: totalFrozenCost > 0 ? Math.round((c.totalFrozenCost / totalFrozenCost) * 10000) / 100 : 0 }))
				.sort((a, b) => b.totalFrozenCost - a.totalFrozenCost);

			return c.json({
				items, total: items.length,
				totalFrozenCost: Math.round(totalFrozenCost * 100) / 100,
				categories, threshold: daysWithoutSales,
				shopId: shopId || null, since: null, until: null,
			});
		} catch (err) {
			console.error("dead-stock analytics error:", err);
			return c.json({ items: [], total: 0, error: String(err) }, 500);
		}
	})

	// --- /api/analytics/dead-stock/analyze ---
	// AI-анализ конкретного товара через DeepSeek
	// Параметры: itemId, shopId, fast=1 (быстрый режим без AI)
	.get("/api/analytics/dead-stock/analyze", async (c) => {
		try {
			const db = c.get("db");
			const apiKey = (await resolveDeepseekKey(c.get("db"), c.get("tenantId"), c.env.DEEPSEEK_API_KEY)) || "";
			const itemId = c.req.query("itemId");
			const shopId = c.req.query("shopId");
			const fast = c.req.query("fast");

			if (!itemId || !shopId) {
				return c.json({ error: "itemId и shopId обязательны" }, 400);
			}

			// 1. Данные из реальных таблиц (shopProduct + product_cost_prices)
			const productRow = await db.prepare(
				`SELECT sp.uuid as itemId, sp.name, sp.article, sp.quantity as currentStock,
				        sp.shopId, s.name as shopName, sp.parentUuid,
				        pcp.costPrice as unitCost
				 FROM shopProduct sp
				 LEFT JOIN shops s ON s.uuid = sp.shopId
				 LEFT JOIN product_cost_prices pcp ON pcp.productName = sp.name
				 WHERE sp.uuid = ? AND sp.shopId = ?`
			).bind(itemId, shopId).first<{
				itemId: string; name: string; article: string | null;
				currentStock: number | null; shopId: string; shopName: string;
				parentUuid: string | null; unitCost: number | null;
			}>();

			if (!productRow) {
				return c.json({ error: "Товар не найден" }, 404);
			}

			const productName = productRow.name;

			// Загружаем документы для поиска lastSaleDate
			const since90 = new Date(); since90.setDate(since90.getDate() - 90);
			const sinceStr = since90.toISOString().slice(0, 10);
			const docs = await db.prepare(
				`SELECT close_date, transactions, type FROM index_documents
				 WHERE shop_id = ? AND close_date >= ? AND type IN ('SELL', 'PAYBACK')`
			).bind(shopId, sinceStr + "T00:00:00").all<{
				close_date: string; transactions: string; type: string;
			}>();

			// Найдём lastSaleDate и daysWithoutSales
			let lastSaleDate: string | null = null;
			let totalRevenueLast90Days = 0;
			let daysWithoutSales = 999;

			for (const doc of docs.results ?? []) {
				const isRefund = doc.type === "PAYBACK";
				const sign = isRefund ? -1 : 1;
				const day = doc.close_date.slice(0, 10);
				let txs: any[];
				try { txs = JSON.parse(doc.transactions); } catch { continue; }
				if (!Array.isArray(txs)) continue;

				for (const tx of txs) {
					if (tx.type !== "REGISTER_POSITION") continue;
					if (tx.commodityUuid !== itemId) continue;
					// lastSaleDate
					if (!lastSaleDate || day > lastSaleDate) lastSaleDate = day;
					// revenue
					if (!isRefund) totalRevenueLast90Days += (tx.sum ?? 0);
				}
			}

			const nowStr = new Date().toISOString().slice(0, 10);
			if (lastSaleDate) {
				daysWithoutSales = Math.floor((new Date(nowStr).getTime() - new Date(lastSaleDate).getTime()) / 86400000);
			}
			totalRevenueLast90Days = Math.round(totalRevenueLast90Days);

			// 2. Детальные продажи за последние 90 дней — перестраиваем salesHistory
			const salesHistory: { date: string; qty: number; sum: number }[] = [];
			// Повторно проходим для salesHistory
			const docs2 = await db.prepare(
				`SELECT close_date, transactions, index_documents.type FROM index_documents
				 WHERE shop_id = ? AND close_date >= ? AND index_documents.type IN ('SELL', 'PAYBACK')`
			).bind(shopId, sinceStr + "T00:00:00").all<{
				close_date: string; transactions: string; type: string;
			}>();

			for (const doc of docs2.results ?? []) {
				const isRefund = doc.type === "PAYBACK";
				const sign = isRefund ? -1 : 1;
				const day = doc.close_date.slice(0, 10);
				let txs: any[];
				try { txs = JSON.parse(doc.transactions); } catch { continue; }
				if (!Array.isArray(txs)) continue;
				for (const tx of txs) {
					if (tx.type !== "REGISTER_POSITION") continue;
					if (tx.commodityUuid !== itemId) continue;
					const existing = salesHistory.find(s => s.date === day);
					if (existing) {
						existing.qty += (tx.quantity ?? 0) * sign;
						existing.sum += (tx.sum ?? 0) * sign;
					} else {
						salesHistory.push({ date: day, qty: (tx.quantity ?? 0) * sign, sum: (tx.sum ?? 0) * sign });
					}
				}
			}
			salesHistory.sort((a, b) => b.date.localeCompare(a.date));

			// --- fast=1: быстрый режим без AI (только данные) ---
			if (fast === "1") {
				// Продажи по всем магазинам (по имени товара, т.к. UUID разный)
				const allShops = await db.prepare(
					"SELECT uuid, name FROM shops ORDER BY name"
				).all<{ uuid: string; name: string }>();

				const allShopsSales: { shopName: string; uuid: string; qty: number; hasProduct: boolean }[] = [];

				// Проверяем наличие товара и продажи в каждом магазине
				for (const shop of (allShops.results ?? [])) {
					const productRow = await db.prepare(
						"SELECT uuid FROM shopProduct WHERE shopId = ? AND name = ? LIMIT 1"
					).bind(shop.uuid, productName).first<{ uuid: string }>();

					let qty = 0;
					const hasProduct = !!productRow?.uuid;

					if (hasProduct) {
						const shopDocs = await db.prepare(
							`SELECT transactions, index_documents.type FROM index_documents
							 WHERE shop_id = ? AND close_date >= ? AND index_documents.type IN ('SELL', 'PAYBACK')`
						).bind(shop.uuid, sinceStr + "T00:00:00").all<{
							transactions: string; type: string;
						}>();

						for (const doc of (shopDocs.results ?? [])) {
							const isRefund = doc.type === "PAYBACK";
							const sign = isRefund ? -1 : 1;
							let txs: any[];
							try { txs = JSON.parse(doc.transactions); } catch { continue; }
							if (!Array.isArray(txs)) continue;
							for (const tx of txs) {
								if (tx.type !== "REGISTER_POSITION") continue;
								if ((tx.commodityName || "").trim() !== productName) continue;
								qty += (tx.quantity ?? 0) * sign;
							}
						}
					}

					allShopsSales.push({
						shopName: shop.name,
						uuid: shop.uuid,
						qty: Math.max(0, qty),
						hasProduct,
					});
				}

				allShopsSales.sort((a, b) => b.qty - a.qty);

				return c.json({
					salesHistory: salesHistory.slice(0, 14),
					allShopsSales,
					allShops: (allShops.results ?? []).map(s => ({ uuid: s.uuid, name: s.name })),
				});
			}

			// --- /fast=1 ---

			if (!apiKey) {
				return c.json({ error: "DEEPSEEK_API_KEY не настроен" }, 500);
			}

			// 3. Маржа (из transaction costPrice + фолбэк на загруженную себестоимость)
			let marginPct = 0;
			let totalCost = 0;
			let totalRevenue = 0;
			let totalQty = 0;
			for (const doc of docs.results ?? []) {
				let txs: any[];
				try { txs = JSON.parse(doc.transactions); } catch { continue; }
				if (!Array.isArray(txs)) continue;
				for (const tx of txs) {
					if (tx.type !== "REGISTER_POSITION") continue;
					if (tx.commodityUuid !== itemId) continue;
					const qty = tx.quantity ?? 0;
					const cost = (tx.costPrice ?? 0) * qty;
					const rev = tx.sum ?? 0;
					if (doc.type !== "PAYBACK") {
						totalCost += cost;
						totalRevenue += rev;
						totalQty += qty;
					}
				}
			}
			// Если есть загруженная себестоимость из 1С — используем её
			// (авторитетнее, чем costPrice из транзакций Эвотора).
			// Ищем цену, актуальную на начало периода (sinceStr).
			const uploadedCosts = await getCostPricesForPeriod(db, [productName], sinceStr + "T00:00:00");
			const uploadedPrice = uploadedCosts.get(productName);
			if (uploadedPrice) {
				totalCost = uploadedPrice * totalQty;
			}
			if (totalRevenue > 0) {
				marginPct = Math.round(((totalRevenue - totalCost) / totalRevenue) * 100);
			}

			// 4. Продажи в других магазинах
			const otherShopsSales: { shopName: string; qty: number }[] = [];
			const otherShops = await db.prepare(
				"SELECT uuid, name FROM shops WHERE uuid != ?"
			).bind(shopId).all<{ uuid: string; name: string }>();

			for (const shop of otherShops.results ?? []) {
				const productRow = await db.prepare(
					"SELECT uuid FROM shopProduct WHERE shopId = ? AND uuid = ? LIMIT 1"
				).bind(shop.uuid, itemId).first<{ uuid: string }>();

				if (!productRow?.uuid) continue;

				const salesResult = await db.prepare(
					`SELECT SUM(CAST(JSON_EXTRACT(tx.value, '$.quantity') AS INTEGER)) as qty
					 FROM index_documents,
					 JSON_EACH(transactions) AS tx
					 WHERE shop_id = ? AND index_documents.type = 'SELL'
					 AND close_date >= ?
					 AND JSON_EXTRACT(tx.value, '$.commodityUuid') = ?`
				).bind(shop.uuid, sinceStr + "T00:00:00", itemId)
					.first<{ qty: number | null }>();

				const qty = salesResult?.qty ?? 0;
				if (qty > 0) {
					otherShopsSales.push({ shopName: shop.name, qty });
				}
			}

			// 5. Формируем промпт
			const salesSummary = salesHistory.length > 0
				? salesHistory.slice(0, 10).map(s => `${s.date}: ${s.qty} шт, ${s.sum} ₽`).join("\n")
				: "нет продаж за последние 90 дней";

			const otherShopsInfo = otherShopsSales.length > 0
				? otherShopsSales.map(s => `${s.shopName}: ${s.qty} шт`).join(", ")
				: "не продаётся ни в одном магазине сети";

			const system = `Ты — категорийный менеджер сети вейп-шопов. Твоя задача — проанализировать конкретный товар и дать чёткие, основанные на данных рекомендации. Будь конкретным, избегай общих фраз.`;

			const user = `Товар: ${productRow.name}
Артикул: ${productRow.article || "не указан"}
Остаток: ${productRow.currentStock ?? "неизвестно"} шт.
Дней без продаж: ${daysWithoutSales}
Последняя продажа: ${lastSaleDate || "никогда"}
Выручка за 90 дней: ${totalRevenueLast90Days} ₽
Маржа: ${marginPct}%
Магазин: ${productRow.shopName}

Продажи по дням (последние 10 дней с продажами):
${salesSummary}

Продажи в других магазинах сети за 90 дней:
${otherShopsInfo}

Проанализируй и дай конкретные рекомендации:
1. Почему товар стал мёртвым (2–3 реальные причины, основанные на данных)
2. Что делать:
   - Переместить (в какой магазин и сколько штук, почему)
   - Списать (полностью или частично, причина)
   - Сделать промо (какое именно)
   - Оставить как есть
3. Ожидаемый эффект от твоей рекомендации

Ответь СТРОГО в JSON-формате:
{
  "reasons": ["причина 1", "причина 2", "причина 3"],
  "recommendedAction": "move" | "writeoff" | "promo" | "keep",
  "targetShopId": "uuid магазина или null",
  "targetShopName": "название магазина или null",
  "quantity": число,
  "explanation": "подробное объяснение рекомендации",
  "expectedEffect": "ожидаемый результат"
}`;

			const aiText = await deepseekChat({
				apiKey,
				system,
				user,
				maxTokens: 1200,
				temperature: 0.4,
			});

			const jsonMatch = aiText.match(/\{[\s\S]*\}/);
			if (!jsonMatch) {
				return c.json({ error: "AI не вернул JSON", raw: aiText }, 500);
			}

			const analysis = JSON.parse(jsonMatch[0]);

			return c.json({
				item: {
					itemId: productRow.itemId,
					name: productRow.name,
					shopId: productRow.shopId,
					shopName: productRow.shopName,
					daysWithoutSales,
					lastSaleDate,
					totalRevenueLast90Days,
					marginPct,
				},
				analysis,
				salesHistory: salesHistory.slice(0, 14),
				otherShopsSales,
			});
		} catch (err) {
			console.error("dead-stock analyze error:", err);
			return c.json({ error: String(err) }, 500);
		}
	})

	// --- /api/analytics/* stubs ---
	.get("/api/analytics/revenue/hourly-plan-fact", async (c) => {
		try {
			const date = c.req.query("date") || new Date().toISOString().slice(0, 10);
			const shopName = c.req.query("shopName");

			const db = c.get("db");
			const tenantId = c.get("tenantId") || "default";

			// Только магазины tenant
			const tenantShops = await getTenantShopUuids(db, tenantId);
			if (tenantShops.length === 0) {
				return c.json({ rows: [], totalPlan: 0, actualNet: 0, expectedByNow: 0, gapByNow: 0, planPct: 0, pacePct: 0 });
			}

			const shopRows = await db
				.prepare("SELECT uuid, name FROM shops WHERE tenant_id = ?")
				.bind(tenantId)
				.all<{ uuid: string; name: string }>();
			const shops = shopRows.results ?? [];

			const targetUuids = new Set<string>();
			for (const shop of shops) {
				if (!shopName || shop.name === shopName) {
					targetUuids.add(shop.uuid);
				}
			}
			if (targetUuids.size === 0) {
				return c.json({ rows: [], totalPlan: 0, actualNet: 0, expectedByNow: 0, gapByNow: 0, planPct: 0, pacePct: 0 });
			}

			// План из D1 (таблица plan хранит даты в формате DD-MM-YYYY)
			const [yp, mp, dp] = date.split("-");
			const datePlan = `${dp}-${mp}-${yp}`;
			const planByShop = await getPlan(datePlan, db);
			const totalPlan = Object.entries(planByShop || {})
				.filter(([uuid]) => targetUuids.has(uuid))
				.reduce((sum, [, amount]) => sum + Number(amount), 0);

			// Факт за день
			const since = date.length <= 10 ? date + "T00:00:00" : date;
			const until = date.length <= 10 ? date + "T23:59:59" : date;
			const inClause = [...targetUuids].map(() => "?").join(",");
			const docResult = await db
				.prepare(`
					SELECT shop_id, type, close_date, transactions
					FROM index_documents
					WHERE close_date >= ? AND close_date <= ?
					  AND type IN ('SELL', 'PAYBACK')
					  AND shop_id IN (${inClause})
				`)
				.bind(since, until, ...[...targetUuids])
				.all<{ shop_id: string; type: string; close_date: string; transactions: string }>();

			// Группировка по часам
			const hourly: Record<number, { sell: number; refund: number }> = {};
			for (let h = 7; h <= 23; h++) hourly[h] = { sell: 0, refund: 0 };

			for (const row of docResult?.results ?? []) {
				const closeHour = new Date(row.close_date).getHours();
				if (closeHour < 7 || closeHour > 23) continue;

				const isRefund = row.type === "PAYBACK";
				let transactions: any[];
				try {
					transactions = JSON.parse(row.transactions);
				} catch {
					continue;
				}
				if (!Array.isArray(transactions)) continue;

				for (const tx of transactions) {
					if (tx.type !== "REGISTER_POSITION") continue;
					const sum = Number(tx.sum || 0);
					if (isRefund) {
						hourly[closeHour].refund += sum;
					} else {
						hourly[closeHour].sell += sum;
					}
				}
			}

			const totalActualSell = Object.values(hourly).reduce((s, h) => s + h.sell, 0);
			const totalActualRefund = Object.values(hourly).reduce((s, h) => s + h.refund, 0);
			const actualNet = totalActualSell - totalActualRefund;

			const openingHours = 17; // 7–23
			const rows: {
				hour: number;
				label: string;
				actualHourly: number;
				actualCumulative: number;
				expectedCumulative: number;
				gap: number;
			}[] = [];

			let cumulativeActual = 0;
			let cumulativeExpected = 0;

			for (let h = 7; h <= 23; h++) {
				const hourNet = hourly[h].sell - hourly[h].refund;
				cumulativeActual += hourNet;
				// Ожидание — равномерно по времени смены (не пропорционально факту)
				cumulativeExpected += totalPlan > 0 ? totalPlan / openingHours : 0;

				rows.push({
					hour: h,
					label: `${String(h).padStart(2, "0")}:00`,
					actualHourly: Math.round(hourNet),
					actualCumulative: Math.round(cumulativeActual),
					expectedCumulative: Math.round(cumulativeExpected),
					gap: Math.round(cumulativeActual - cumulativeExpected),
				});
			}

			// expectedByNow по доле прошедшего времени смены (7:00–23:00)
			const now = new Date();
			const nowMin = now.getHours() * 60 + now.getMinutes();
			const shiftStart = 7 * 60;
			const shiftEnd = 23 * 60 + 59;
			const elapsed = Math.max(0, Math.min(nowMin - shiftStart, shiftEnd - shiftStart));
			const shiftTotal = shiftEnd - shiftStart;
			const expectedByNow = totalPlan > 0 ? (totalPlan * elapsed) / shiftTotal : 0;
			const gapByNow = actualNet - expectedByNow;
			const planPct = totalPlan > 0 ? Math.round((actualNet / totalPlan) * 100) : 0;
			const pacePct = expectedByNow > 0 ? Math.round((actualNet / expectedByNow) * 100) : 0;

			return c.json({
				rows,
				totalPlan: Math.round(totalPlan),
				actualNet: Math.round(actualNet),
				expectedByNow: Math.round(expectedByNow),
				gapByNow: Math.round(gapByNow),
				planPct,
				pacePct,
			});
		} catch (err) {
			console.error("hourly-plan-fact error:", err);
			return c.json({ rows: [], totalPlan: 0, actualNet: 0, expectedByNow: 0, gapByNow: 0, planPct: 0, pacePct: 0 });
		}
	})
	.get("/api/analytics/revenue/day-compare", async (c) => {
		try {
			const db = c.get("db");
			const tenantId = c.get("tenantId") || "default";
			const shopUuids = await getTenantShopUuids(db, tenantId);

			const fmtLocal = (d: Date): string =>
				`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

			const dateParam = c.req.query("date");
			const date = dateParam || fmtLocal(new Date());

			const [y, m, dd] = date.split("-").map(Number);
			const prevDate = fmtLocal(new Date(y, m - 1, dd - 1));

			const sumNet = async (day: string): Promise<number> => {
				if (shopUuids.length === 0) return 0;
				const inClause = shopUuids.map(() => "?").join(",");
				const docs = await db
					.prepare(`SELECT type, transactions FROM index_documents
					          WHERE close_date >= ? AND close_date <= ?
					            AND type IN ('SELL', 'PAYBACK')
					            AND shop_id IN (${inClause})`)
					.bind(day + "T00:00:00", day + "T23:59:59", ...shopUuids)
					.all<{ type: string; transactions: string }>();
				let net = 0;
				for (const doc of docs.results ?? []) {
					const sign = doc.type === "PAYBACK" ? -1 : 1;
					let txs: any[];
					try { txs = JSON.parse(doc.transactions); } catch { continue; }
					if (!Array.isArray(txs)) continue;
					for (const tx of txs) {
						if (tx.type !== "REGISTER_POSITION") continue;
						net += (Number(tx.sum) || 0) * sign;
					}
				}
				return net;
			};

			const currentNet = await sumNet(date);
			const previousNet = await sumNet(prevDate);
			const deltaPct =
				previousNet > 0
					? Math.round(((currentNet - previousNet) / previousNet) * 100)
					: currentNet > 0
						? 100
						: 0;

			return c.json({
				date,
				previousDate: prevDate,
				currentNet: Math.round(currentNet),
				previousNet: Math.round(previousNet),
				deltaPct,
			});
		} catch (err) {
			console.error("[day-compare] error:", err);
			return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
		}
	})
	.get("/api/analytics/revenue/refund-documents", async (c) => {
		return c.json({ documents: [] });
	})
	.get("/api/analytics/dashboards/product", async (c) => {
		return c.json({ widgets: [] });
	})
	.get("/api/analytics/dashboards/reliability", async (c) => {
		return c.json({ widgets: [] });
	})
	.get("/api/analytics/dashboards/business", async (c) => {
		return c.json({ widgets: [] });
	})
	.post("/api/analytics/event", async (c) => {
		// Fire-and-forget analytics
		return c.json({ ok: true });
	})

	// --- /api/evotor/* missing routes ---
	.get("/api/evotor/financial", async (c) => {
		return c.json({
			salesDataByShopName: {},
			grandTotalSell: 0, grandTotalRefund: 0,
			netRevenue: 0, averageCheck: 0,
			grandTotalCashOutcome: 0, cashOutcomeData: {},
			cashBalanceByShop: {}, totalCashBalance: 0,
			totalChecks: 0, topProducts: [],
		});
	})
	.post("/api/evotor/dashboard-home-insights", async (c) => {
		try {
			const body = await c.req.json<{
				since: string;
				until: string;
				dateMode: "today" | "yesterday" | "period";
				shopUuid?: string;
			}>();
			const { dateMode, shopUuid } = body;

			const db = c.env.DB;
			const evo = c.var.evotor;

			// Determine day and week ranges
			let daySince: string, dayUntil: string;
			let weekSince: string, weekUntil: string;

			if (dateMode === "period" && body.since && body.until) {
				// For period mode: day = the period, week = last 7 days ending at until
				daySince = formatDateWithTime(new Date(body.since), false);
				dayUntil = formatDateWithTime(new Date(body.until), true);

				const weekEnd = new Date(body.until);
				const weekStart = new Date(weekEnd);
				weekStart.setDate(weekStart.getDate() - 6);
				weekSince = formatDateWithTime(weekStart, false);
				weekUntil = formatDateWithTime(weekEnd, true);
			} else if (dateMode === "yesterday") {
				const yesterday = new Date();
				yesterday.setDate(yesterday.getDate() - 1);
				daySince = formatDateWithTime(yesterday, false);
				dayUntil = formatDateWithTime(yesterday, true);

				const weekStart = new Date(yesterday);
				weekStart.setDate(weekStart.getDate() - 6);
				weekSince = formatDateWithTime(weekStart, false);
				weekUntil = formatDateWithTime(yesterday, true);
			} else {
				const today = new Date();
				daySince = formatDateWithTime(today, false);
				dayUntil = formatDateWithTime(today, true);

				const weekStart = new Date(today);
				weekStart.setDate(weekStart.getDate() - 6);
				weekSince = formatDateWithTime(weekStart, false);
				weekUntil = formatDateWithTime(today, true);
			}

			// Get shops from D1 (только текущего tenant)
			const tenantId = c.get("tenantId") || "default";
			const shopsResult = await db.prepare("SELECT uuid, name FROM shops WHERE tenant_id = ?").bind(tenantId).all<{ uuid: string; name: string }>();
			const allShopUuids = shopUuid
				? [shopUuid]
				: (shopsResult.results ?? []).map(r => r.uuid);
			const uuidToName: Record<string, string> = {};
			for (const row of shopsResult.results ?? []) {
				uuidToName[row.uuid] = row.name;
			}

			// Compute KPI rows for a period
			const computeRows = async (since: string, until: string) => {
				const { salesDataByShopName, grandTotalSell, grandTotalRefund } =
					await getSalesgardenReportData(db, allShopUuids, since, until);

				const cashOutcomeData = await getDocumentsByCashOutcomeData(
					db, allShopUuids, since, until,
				);

				// Count SELL documents per shop for checks count (scope tenant shops)
				const shopInClauseSql = allShopUuids.length > 0
					? allShopUuids.map(() => "?").join(",")
					: "'__none__'";
				const checksResult = await db
					.prepare(`
						SELECT shop_id, COUNT(*) as cnt
						FROM index_documents
						WHERE close_date >= ? AND close_date <= ?
						  AND shop_id IN (${shopInClauseSql})
						  AND type = 'SELL'
						GROUP BY shop_id
					`)
					.bind(since, until, ...allShopUuids)
					.all<{ shop_id: string; cnt: number }>();

				const checksByShop: Record<string, number> = {};
				if (checksResult?.results) {
					for (const row of checksResult.results) {
						checksByShop[row.shop_id] = row.cnt;
					}
				}

				const rows: Array<{
					name: string;
					revenue: number;
					averageCheck: number;
					refunds: number;
					expenses: number;
					netRevenue: number;
					checks: number;
					refundRate: number;
				}> = [];

				for (const uuid of allShopUuids) {
					const shopName = uuidToName[uuid] || uuid;
					const shopSales = salesDataByShopName[shopName];
					const revenue = shopSales?.totalSell || 0;
					const refunds = Object.values(shopSales?.refund || {}).reduce((s, v) => s + v, 0);
					const expenses = Object.values(cashOutcomeData[shopName] || {}).reduce((s, v) => s + v, 0);
					const netRevenue = revenue - refunds - expenses;
					const checks = checksByShop[uuid] || 0;
					const averageCheck = checks > 0 ? netRevenue / checks : 0;
					const refundRate = revenue > 0 ? (refunds / revenue) * 100 : 0;

					rows.push({
						name: shopName,
						revenue,
						averageCheck,
						refunds,
						expenses,
						netRevenue,
						checks,
						refundRate,
					});
				}

				return rows;
			};

			// Compute leader from sorted rows
			const computeLeader = (rows: Array<{ name: string; netRevenue: number }>) => {
				const sorted = [...rows].sort((a, b) => b.netRevenue - a.netRevenue);
				if (sorted.length === 0) return null;

				const first = sorted[0];
				const second = sorted[1];
				const gapToSecond = second ? first.netRevenue - second.netRevenue : 0;

				// Determine reason
				let reason: "чек" | "трафик" | "конверсия" = "конверсия";
				if (first.netRevenue > 0 && second?.netRevenue && second.netRevenue > 0) {
					const ratio = first.netRevenue / second.netRevenue;
					if (ratio > 1.3) reason = "чек";
					else reason = "трафик";
				}

				return {
					name: first.name,
					netRevenue: Math.round(first.netRevenue),
					gapToSecond: Math.round(gapToSecond),
					reason,
				};
			};

			const [dayRows, weekRows] = await Promise.all([
				computeRows(daySince, dayUntil),
				computeRows(weekSince, weekUntil),
			]);

			const dayLeader = computeLeader(dayRows);
			const weekLeader = computeLeader(weekRows);

			// Round values
			const roundRow = (r: typeof dayRows[0]) => ({
				name: r.name,
				revenue: Math.round(r.revenue),
				averageCheck: Math.round(r.averageCheck),
				refunds: Math.round(r.refunds),
				expenses: Math.round(r.expenses),
				netRevenue: Math.round(r.netRevenue),
				checks: r.checks,
				refundRate: Math.round(r.refundRate * 10) / 10,
			});

			return c.json({
				insights: { summary: "", kpi: [], alerts: [], recommendations: [] },
				bestShop: {
					dayRows: dayRows.map(roundRow),
					weekRows: weekRows.map(roundRow),
					dayLeader,
					weekLeader,
				},
			});
		} catch (err) {
			console.error("dashboard-home-insights error:", err);
			return c.json({
				insights: { summary: "", kpi: [], alerts: [], recommendations: [] },
				bestShop: {
					dayRows: [],
					weekRows: [],
					dayLeader: null,
					weekLeader: null,
				},
			});
		}
	})
	.post("/api/evotor/generate-pdf", async (c) => {
		return c.json({ url: "" });
	})
	.post("/api/evotor/current-work-shop", async (c) => {
		return c.json({ uuid: "", name: "", isWorkingToday: false });
	})
	.get("/api/evotor/current-work-shop", async (c) => {
		return c.json({ uuid: "", name: "", isWorkingToday: false });
	})
	.get("/api/evotor/stock-health", async (c) => {
		return c.json({ deadStock: [], lowStock: [], outOfStock: [], recommendations: [], deadCount: 0, lowCount: 0, outCount: 0, totalLostPerDay: 0 });
	})
	.get("/api/evotor/stock-transfer", async (c) => {
		return c.json({ transfers: [] });
	})
	.get("/api/evotor/working-by-shops", async (c) => {
		return c.json({ byShop: {} });
	})
	.get("/api/employees/seller-effectiveness", async (c) => {
		const db = c.env.DB as D1Database;
		const period = c.req.query("period") ? parseInt(c.req.query("period")!) : undefined;
		const since = c.req.query("since") || undefined;
		const until = c.req.query("until") || undefined;
		const store = c.req.query("store") || undefined;
		const result = await computeSellerEffectiveness(db, { period, since, until, store });
		return c.json(result);
	})
	// Product effectiveness — глубокий анализ товара
	.get("/api/products/effectiveness", async (c) => {
		const db = c.env.DB as D1Database;
		const period = c.req.query("period") ? parseInt(c.req.query("period")!) : undefined;
		const since = c.req.query("since") || undefined;
		const until = c.req.query("until") || undefined;
		const store = c.req.query("store") || undefined;
		const result = await computeProductEffectiveness(db, { period, since, until, store });
		return c.json(result);
	})
	// Product AI insights — rule-based
	.get("/api/products/ai-insights", async (c) => {
		const db = c.env.DB as D1Database;
		const period = c.req.query("period") ? parseInt(c.req.query("period")!) : 90;
		const store = c.req.query("store") || undefined;

		try {
			const stats = await computeProductEffectiveness(db, { period, store });
			const products = stats.products ?? [];
			if (products.length === 0) return c.json({ insights: [] });

			const topMargin = products.slice(0, 3).map((p: any) => p.name).join(", ");
			const worst = products.slice(-2).map((p: any) => p.name).join(", ");
			const insights = [
				`Топ-3 продукта по марже: ${topMargin}. Рекомендуется увеличить их выкладку и долю в заказах.`,
				`Продукты с самой низкой маржой: ${worst || "не выявлены"}. Стоит пересмотреть ценообразование или сократить закупки.`,
				`Оптимизация ассортимента может повысить общую маржинальность на 5–10%.`,
			];
			return c.json({ insights });
		} catch {
			return c.json({ insights: [] });
		}
	})
	// Store effectiveness — глубокий анализ торговой точки
	.get("/api/shops/effectiveness", async (c) => {
		const db = c.env.DB as D1Database;
		const period = c.req.query("period") ? parseInt(c.req.query("period")!) : undefined;
		const since = c.req.query("since") || undefined;
		const until = c.req.query("until") || undefined;
		const result = await computeStoreEffectiveness(db, { period, since, until });
		return c.json(result);
	})
	// Store AI insights — rule-based
	.get("/api/shops/ai-insights", async (c) => {
		const db = c.env.DB as D1Database;
		const period = c.req.query("period") ? parseInt(c.req.query("period")!) : 90;

		try {
			const stats = await computeStoreEffectiveness(db, { period });
			const stores = stats.stores ?? [];
			if (stores.length === 0) return c.json({ insights: [] });

			const bestStore = stores.reduce((a: any, b: any) => (a.avgDailyRev ?? 0) > (b.avgDailyRev ?? 0) ? a : b, stores[0]);
			const worstStore = stores.reduce((a: any, b: any) => (a.avgDailyRev ?? 0) < (b.avgDailyRev ?? 0) ? a : b, stores[0]);
			const highCV = stores.filter((s: any) => (s.cv ?? 0) > 30).map((s: any) => s.name).join(", ");

			const insights = [
				`Лучшая точка: ${bestStore?.name ?? "—"} со средней дневной выручкой ${bestStore?.avgDailyRev?.toLocaleString("ru") ?? "—"} ₽.`,
				highCV ? `Высокая волатильность выручки (>30% CV) в точках: ${highCV}. Рекомендуется стабилизировать расписание продавцов.` : null,
				`Точка ${worstStore?.name ?? "—"} требует внимания — самая низкая дневная выручка. Проведите аудит трафика и ассортимента.`,
			].filter(Boolean) as string[];
			return c.json({ insights });
		} catch {
			return c.json({ insights: [] });
		}
	})
	// ─── Seller DNA ──────────────────────────────────────────────
	.get("/api/sellers/advanced-stats", async (c) => {
		const db = c.env.DB as D1Database;
		const since = c.req.query("since") || "";
		const until = c.req.query("until") || "";
		const shopId = c.req.query("shopId") || undefined;
		const sellerIdsRaw = c.req.query("sellerIds") || undefined;
		const sellerIds = sellerIdsRaw ? sellerIdsRaw.split(",").filter(Boolean) : undefined;
		const benchmarkWeekdayQ = c.req.query("benchmarkWeekday");
		const weekdayQ = c.req.query("weekday");
		const benchmarkWeekday = benchmarkWeekdayQ !== undefined ? parseInt(benchmarkWeekdayQ) : undefined;
		const weekday = weekdayQ !== undefined ? parseInt(weekdayQ) : undefined;
		const scoreModeQ = c.req.query("scoreMode");
		const scoreMode = scoreModeQ === "margin" ? "margin" as const : "classic" as const;

		if (!since || !until) {
			return c.json({ sellers: [] });
		}

		const cacheKey = `advanced-stats:${since}:${until}:${shopId ?? "all"}:${sellerIdsRaw ?? "all"}:${benchmarkWeekday ?? ""}:${weekday ?? ""}:${scoreMode}`;
		const cached = statsCache.get(cacheKey);
		if (cached && cached.expiresAt > Date.now()) {
			return c.json(cached.data);
		}

		try {
			const result = await computeSellerAdvancedStats(db, { since, until, shopId, sellerIds, benchmarkWeekday, weekday, scoreMode });
			statsCache.set(cacheKey, { data: result, expiresAt: Date.now() + 300_000 });
			return c.json(result);
		} catch (err: any) {
			console.error("[advanced-stats] error:", err?.message ?? err);
			return c.json({ sellers: [] });
		}
	})
	// ─── Seller DNA: weekday breakdown ───────────────────────────
	.get("/api/sellers/weekday-breakdown", async (c) => {
		const db = c.env.DB as D1Database;
		const sellerId = c.req.query("sellerId") || "";
		const since = c.req.query("since") || "";
		const until = c.req.query("until") || "";

		if (!sellerId || !since || !until) return c.json({});

		try {
			const result = await computeWeekdayBreakdown(db, sellerId, since, until);
			return c.json(result);
		} catch (err: any) {
			console.error("[weekday-breakdown] error:", err?.message ?? err);
			return c.json({});
		}
	})
	// ─── Seller DNA: AI insights ────────────────────────────────
	.get("/api/sellers/insights", async (c) => {
		const db = c.env.DB as D1Database;
		const sellerId = c.req.query("sellerId") || "";
		const since = c.req.query("since") || "";
		const until = c.req.query("until") || "";
		const shopId = c.req.query("shopId") || undefined;
		const apiKey = (await resolveDeepseekKey(db, c.get("tenantId"), c.env.DEEPSEEK_API_KEY)) || "";

		if (!sellerId || !since || !until) return c.json({ insights: [] });

		try {
			// Get seller profile for insights
			const stats = await computeSellerAdvancedStats(db, { since, until, shopId, sellerIds: [sellerId] });
			const seller = stats.sellers[0];
			if (!seller) return c.json({ insights: [] });

			const profile = {
				name: seller.name,
				dnaLabel: seller.dnaLabel,
				daysWorked: seller.daysWorked,
				totalRevenue: seller.totalRevenue,
				avgCheck: seller.avgCheck,
				accShare: seller.accShare,
				rubPerHour: seller.rubPerHour,
				avgHours: seller.avgHours,
				trend: seller.trend,
				trendSlope: seller.trendSlope,
				overallScore: seller.overallScore,
				deadTimePct: seller.deadTimePct,
				peakHourEfficiency: seller.peakHourEfficiency,
				stability: seller.stability,
				avgLateMinutes: seller.avgLateMinutes,
				lateRate: seller.lateRate,
				onTimeRate: seller.onTimeRate,
				firstCheckDelay: seller.firstCheckDelay,
				absentRate: seller.absentRate,
				strengths: seller.strengths,
				weaknesses: seller.weaknesses,
				rank: seller.rank,
				totalSellers: stats.sellers.length,
			} as any;

			const result = await generateSellerInsights({ profile, apiKey });
			return c.json(result);
		} catch (err: any) {
			console.error("[seller-insights] error:", err?.message ?? err);
			return c.json({ insights: [] });
		}
	})
	.get("/api/sellers/weekday-compare", async (c) => {
		const db = c.env.DB as D1Database;
		const targetDate = c.req.query("targetDate") || "";
		const shopId = c.req.query("shopId") || undefined;
		const weeksBackQ = c.req.query("weeksBack") || "4";
		const weeksBack = parseInt(weeksBackQ) || 4;
		const compareMode = (c.req.query("compareMode") as "same-day" | "same-weekday" | undefined) || undefined;
		const sellerIdsRaw = c.req.query("sellerIds") || undefined;
		const sellerIds = sellerIdsRaw ? sellerIdsRaw.split(",").filter(Boolean) : undefined;

		if (!targetDate) {
			return c.json({ weekday: 0, dates: [], sellers: [] });
		}

		try {
			const result = await computeWeekdayComparison(db, { targetDate, shopId, weeksBack, compareMode, sellerIds });
			return c.json(result);
		} catch (err: any) {
			console.error("[weekday-compare] error:", err?.message ?? err);
			return c.json({ weekday: 0, dates: [], sellers: [] });
		}
	})
	.get("/api/sellers/hourly-compare", async (c) => {
		const db = c.env.DB as D1Database;
		const targetDate = c.req.query("targetDate") || "";
		const weeksBackQ = c.req.query("weeksBack") || "5";
		const weeksBack = parseInt(weeksBackQ) || 5;
		const sellerIdsRaw = c.req.query("sellerIds") || "";
		const sellerIds = sellerIdsRaw ? sellerIdsRaw.split(",").filter(Boolean) : [];
		const granularityQ = c.req.query("granularityMinutes") || "60";
		const granularityMinutes = parseInt(granularityQ) || 60;
		const shopId = c.req.query("shopId") || undefined;

		if (!targetDate || sellerIds.length === 0) {
			return c.json({ weekday: 0, weekdayLabel: "", dates: [], sellers: [], slots: [] });
		}

		const cacheKey = `hourly-compare:${targetDate}:${weeksBack}:${sellerIdsRaw}:${granularityMinutes}:${shopId ?? "all"}`;
		const cached = hourlyCompareCache.get(cacheKey);
		if (cached && cached.expiresAt > Date.now()) {
			return c.json(cached.data);
		}

		try {
			const result = await computeHourlyCompare(db, { targetDate, weeksBack, shopId, sellerIds, granularityMinutes });
			hourlyCompareCache.set(cacheKey, { data: result, expiresAt: Date.now() + 300_000 });
			return c.json(result);
		} catch (err: any) {
			console.error("[hourly-compare] error:", err?.message ?? err);
			return c.json({ weekday: 0, weekdayLabel: "", dates: [], sellers: [], slots: [] });
		}
	})
	// ─── Absence Analysis ────────────────────────────────────────
	.get("/api/sellers/absence-analysis", async (c) => {
		const db = c.env.DB as D1Database;
		const sellerId = c.req.query("sellerId") || "";
		const since = c.req.query("since") || "";
		const until = c.req.query("until") || "";
		const minSlotMinutesQ = c.req.query("minSlotMinutes") || "25";
		const minSlotMinutes = parseInt(minSlotMinutesQ) || 25;
			const apiKey = (await resolveDeepseekKey(c.get("db"), c.get("tenantId"), c.env.DEEPSEEK_API_KEY)) || "";

			if (!sellerId || !since || !until) {
				return c.json({ error: "sellerId, since, until required" }, 400);
			}

		try {
			await createSellerAbsenceEventsTable(db);

			// 1. Получить имя продавца
			const emp = await db.prepare(
				"SELECT name FROM employees WHERE uuid = ?"
			).bind(sellerId).first<{ name: string }>();
			const sellerName = emp?.name || sellerId.slice(0, 8);

			// 2. Получить все OPEN_SESSION за период
			const sessions = await db.prepare(
				`SELECT close_date, open_user_uuid, shop_id
				 FROM index_documents
				 WHERE type = 'OPEN_SESSION'
				   AND close_date >= ? AND close_date <= ?
				 ORDER BY close_date`
			).bind(since, until + "T23:59:59").all<{
				close_date: string;
				open_user_uuid: string;
				shop_id: string;
			}>();

			const allSessions = (sessions.results ?? [])
				.filter((s) => s.open_user_uuid === sellerId);

			// Группируем по дате
			const dateSessions = new Map<string, { openTime: string; closeTime: string; shopId: string }>();
			for (const s of allSessions) {
				const date = s.close_date.slice(0, 10);
				if (!dateSessions.has(date)) {
					dateSessions.set(date, { openTime: s.close_date, closeTime: s.close_date, shopId: s.shop_id });
				} else {
					const cur = dateSessions.get(date)!;
					if (s.close_date < cur.openTime) cur.openTime = s.close_date;
					if (s.close_date > cur.closeTime) cur.closeTime = s.close_date;
				}
			}

			// 3. Для каждой даты: найти SELL-чеки и вычислить dead-слоты
			const isoTimeToMin = (iso: string): number => {
				const t = iso.slice(11, 16);
				const [h, m] = t.split(":").map(Number);
				return h * 60 + m;
			};
			const minToHHMM = (m: number): string => {
				const hh = Math.floor(m / 60).toString().padStart(2, "0");
				const mm = (m % 60).toString().padStart(2, "0");
				return `${hh}:${mm}`;
			};

			// 4. Исторические перерывы: собираем все dead-слоты за последние 30 дней до начала периода
			const histSince = new Date(since);
			histSince.setDate(histSince.getDate() - 30);
			const histSinceStr = histSince.toISOString().slice(0, 10);

			const histEvents = await getAbsenceEvents(db, sellerId, histSinceStr, since);
			const typicalBreaks = histEvents.length > 0
				? histEvents.map((e) => `${e.start_time}–${e.end_time} (${e.duration_minutes}м, p=${e.probability_absent})`)
				: [];

			const results: any[] = [];
			const newEvents: SellerAbsenceEvent[] = [];

			for (const [date, sess] of dateSessions) {
				// Получить все чеки за эту дату
				const checks = await db.prepare(
					`SELECT close_date FROM index_documents
					 WHERE type = 'SELL'
					   AND shop_id = ?
					   AND close_date >= ? AND close_date <= ?
					 ORDER BY close_date`
				).bind(sess.shopId, date + "T00:00:00", date + "T23:59:59").all<{ close_date: string }>();

				const checkTimes = (checks.results ?? []).map((r) => r.close_date).sort();
				const shiftOpenMin = isoTimeToMin(sess.openTime);
				const shiftCloseMin = isoTimeToMin(sess.closeTime);

				if (checkTimes.length === 0 || shiftCloseMin <= shiftOpenMin) continue;

				// Найти dead-слоты (15-мин окна без чеков)
				const occupied = new Set<number>();
				for (const ct of checkTimes) {
					occupied.add(Math.floor(isoTimeToMin(ct) / 15) * 15);
				}

				const deadSlots: { fromMin: number; toMin: number }[] = [];
				let gapStart: number | null = null;

				for (let m = shiftOpenMin; m < shiftCloseMin; m += 15) {
					const slot = Math.floor(m / 15) * 15;
					if (!occupied.has(slot)) {
						if (gapStart === null) gapStart = m;
					} else {
						if (gapStart !== null) {
							deadSlots.push({ fromMin: gapStart, toMin: m });
							gapStart = null;
						}
					}
				}
				if (gapStart !== null) {
					deadSlots.push({ fromMin: gapStart, toMin: shiftCloseMin });
				}

				// Фильтруем: только слоты > minSlotMinutes
				const longSlots = deadSlots
					.map((s) => ({ ...s, dur: s.toMin - s.fromMin }))
					.filter((s) => s.dur >= minSlotMinutes);

				// Для каждого длинного слота — DeepSeek
				for (const slot of longSlots) {
					const startStr = minToHHMM(slot.fromMin);
					const endStr = minToHHMM(slot.toMin);
					const openStr = minToHHMM(shiftOpenMin);
					const closeStr = minToHHMM(shiftCloseMin);

					const typicalStr = typicalBreaks.length > 0
						? typicalBreaks.slice(0, 5).join(", ")
						: "нет данных";

					const userPrompt = [
						`Продавец: ${sellerName}.`,
						`Исторически его типичные перерывы: ${typicalStr}.`,
						`Сегодня в смене с ${openStr} по ${closeStr} был период без чеков с ${startStr} по ${endStr} (длительность ${slot.dur} минут).`,
						``,
						`Это скорее:`,
						`A) Отсутствие на рабочем месте (перекур, личные дела)`,
						`B) Затишье клиентов / работа без чеков (выкладка, уборка)`,
					].join("\n");

					let probAbsent = slot.dur > 60 ? 0.7 : slot.dur > 40 ? 0.5 : 0.3;
					let explanation = "";
					let recommendation = "";

					if (apiKey) {
						try {
							const aiText = await deepseekChat({
								apiKey,
								system: "Ты — супервайзер магазина. Анализируешь периоды без чеков у продавцов. Отвечай только JSON.",
								user: userPrompt + `\n\nВерни JSON:\n{\n  "probability_absent": 0.0–1.0,\n  "explanation": "короткое объяснение",\n  "recommendation": "что делать"\n}`,
								model: "deepseek-chat",
								maxTokens: 512,
								temperature: 0.3,
							});

							// Парсим JSON из ответа
							const jsonMatch = aiText.match(/\{[\s\S]*\}/);
							if (jsonMatch) {
								const parsed = JSON.parse(jsonMatch[0]);
								probAbsent = Math.min(1, Math.max(0, Number(parsed.probability_absent) ?? probAbsent));
								explanation = String(parsed.explanation || "").slice(0, 300);
								recommendation = String(parsed.recommendation || "").slice(0, 300);
							}
						} catch (aiErr: any) {
							console.warn("[absence-analysis] DeepSeek error:", aiErr.message);
							explanation = slot.dur > 45
								? `Длительный перерыв ${slot.dur} мин — вероятно, отсутствие`
								: `Перерыв ${slot.dur} мин — возможно, затишье`;
							recommendation = "Провести беседу с продавцом";
						}
					} else {
						// Без AI — простые правила
						if (slot.dur > 60) {
							probAbsent = 0.8;
							explanation = `Перерыв ${slot.dur} мин — высокая вероятность отсутствия на рабочем месте`;
							recommendation = "Проверить камеры, провести беседу";
						} else if (slot.dur > 40) {
							probAbsent = 0.5;
							explanation = `Перерыв ${slot.dur} мин — средняя вероятность отсутствия`;
							recommendation = "Уточнить у продавца причину перерыва";
						} else {
							probAbsent = 0.3;
							explanation = `Перерыв ${slot.dur} мин — возможно, затишье или работа без чеков`;
							recommendation = "Наблюдать за паттерном";
						}
					}

					const event: SellerAbsenceEvent = {
						seller_uuid: sellerId,
						date,
						start_time: startStr,
						end_time: endStr,
						duration_minutes: slot.dur,
						probability_absent: Math.round(probAbsent * 100) / 100,
						explanation,
						recommendation,
					};

					newEvents.push(event);
					results.push({
						date,
						shift: `${openStr}–${closeStr}`,
						slot: `${startStr}–${endStr}`,
						durationMinutes: slot.dur,
						probability_absent: event.probability_absent,
						explanation,
						recommendation,
					});
				}
			}

			// 5. Сохранить
			if (newEvents.length > 0) {
				await upsertAbsenceEvents(db, newEvents);
			}

			return c.json({
				sellerId,
				sellerName,
				period: { since, until },
				analyzedSlots: results.length,
				slots: results,
			});
		} catch (err: any) {
			console.error("[absence-analysis] error:", err?.message ?? err);
			return c.json({ error: "Internal error" }, 500);
		}
	})
	// ─── End Seller DNA ──────────────────────────────────────────
	.post("/api/evotor/salesResult", async (c) => {
		try {
			const db = c.get("db");
			const data = await c.req.json();
			const { startDate, endDate, shopUuid, groups } = data;

			const since = formatDateWithTime(new Date(startDate), false);
			const until = formatDateWithTime(new Date(endDate), true);

			// Если выбран «все магазины» — агрегируем по всем
			if (shopUuid === "all") {
				const shopUuids = await getShopUuidsFromDB(db);
				const merged: Record<string, { quantitySale: number; sum: number }> = {};

				// Разрешаем выбранные uuid групп в их имена, чтобы матчить
				// товары по имени группы в каждом магазине (uuid разные).
				let selectedNames: string[] = [];
				if (Array.isArray(groups) && groups.length > 0) {
					const placeholders = groups.map(() => "?").join(",");
					const nameRows = await db
						.prepare(
							`SELECT DISTINCT TRIM(name) as name FROM shopProduct
							 WHERE product_group = 1 AND uuid IN (${placeholders})`,
						)
						.bind(...groups)
						.all<{ name: string }>();
					selectedNames = (nameRows.results ?? []).map((r) => r.name.trim());
				}

				for (const sid of shopUuids) {
					const productNames =
						selectedNames.length > 0
							? await getProductNamesByGroupNames(c.get("db"), sid, selectedNames)
							: await getProductNamesByGroup(c.get("db"), sid, groups ?? []);
					const shopSales = await getSalesByProductFromD1(
						c.env.DB,
						sid,
						since,
						until,
						productNames,
					);
					for (const [name, vals] of Object.entries(shopSales)) {
						if (!merged[name]) merged[name] = { quantitySale: 0, sum: 0 };
						merged[name].quantitySale += vals.quantitySale;
						merged[name].sum += vals.sum;
					}
				}

				return c.json({
					salesData: merged,
					shopName: "Все магазины",
					startDate,
					endDate,
				});
			}

			// Один магазин
			const shopNameRow = await c.get("db").prepare("SELECT name FROM shops WHERE uuid = ?").bind(shopUuid).first<{ name: string }>();
			const shopName = shopNameRow?.name || shopUuid;
			const productNames = await getProductNamesByGroup(
				c.get("db"),
				shopUuid,
				groups,
			);
			const salesData = await getSalesByProductFromD1(
				c.env.DB,
				shopUuid,
				since,
				until,
				productNames,
			);

			return c.json({ salesData, shopName, startDate, endDate });
		} catch (error) {
			console.error("Ошибка при обработке salesResult:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})

	// --- /api/uploads/upload (alias) ---
	.post("/api/uploads/upload", async (c) => {
		return c.json({ url: "", error: "not implemented" }, 501);
	})

	// --- /api/revenue/accessories-report ---
	.get("/api/revenue/accessories-report", async (c) => {
		return c.json({ items: [] });
	})

	// --- /api/evotor/order-v2 ---
	.post("/api/evotor/order-v2", async (c) => {
		try {
			const data = await c.req.json();
			const {
				startDate,
				endDate,
				shopUuid,
				groups,
				forecastHorizonDays,
				leadTimeDays,
				serviceLevel,
				budgetLimit,
				analysisWeeks,
			} = data;

			if (!startDate || !endDate || !shopUuid || !groups?.length) {
				return c.json({ error: "startDate, endDate, shopUuid, groups обязательны" }, 400);
			}

			const result = await runOrderForecastV2({
				db: c.env.DB,
				shopUuid,
				groups,
				startDate,
				endDate,
				forecastHorizonDays,
				leadTimeDays,
				serviceLevel,
				budgetLimit,
				analysisWeeks,
			});

			return c.json(result);
		} catch (error) {
			console.error("[order-v2] error:", error);
			return c.json({ error: "Ошибка прогнозирования заказа" }, 500);
		}
	})
	// --- /api/ai/director/stock-transfer ---
	.post("/api/ai/director/stock-transfer", async (c) => {
		try {
			const data = await c.req.json();
			const { shopUuid, items } = data as {
				shopUuid: string;
				items: { name: string; quantity: number; sold: number; lastSaleDate: string | null; moveCount?: number; moveToStore?: string }[];
			};

			if (!shopUuid || !items?.length) {
				return c.json({ error: "shopUuid и items обязательны" }, 400);
			}

			const moveItems = items.filter((i) => i.moveCount && i.moveCount > 0);
			if (moveItems.length === 0) {
				return c.json({ transfers: [], message: "Нет товаров для переброски" });
			}

			const apiKey = (await resolveDeepseekKey(c.get("db"), c.get("tenantId"), c.env.DEEPSEEK_API_KEY)) || "";
			if (!apiKey) {
				return c.json({ error: "DEEPSEEK_API_KEY not configured" }, 500);
			}

			// Получаем список всех магазинов из D1
			const shopsRes = await c.get("db").prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>();
			const shopNames: Record<string, string> = {};
			for (const row of shopsRes.results ?? []) {
				shopNames[row.uuid] = row.name;
			}
			const allShops = Object.keys(shopNames);

			const currentShopName = shopNames[shopUuid] || shopUuid;
			const otherShops = allShops
				.filter((sid) => sid !== shopUuid)
				.map((sid) => ({ uuid: sid, name: shopNames[sid] || sid }));

			// Формируем промпт для DeepSeek
			const productsList = moveItems
				.map(
					(i) =>
						`- ${i.name}: ${i.moveCount || i.quantity} шт (продано за период: ${i.sold} шт)`,
				)
				.join("\n");

			const storesList = otherShops.map((s) => `- ${s.name} (${s.uuid})`).join("\n");

			const systemPrompt = `Ты — эксперт по управлению товарными запасами розничной сети. Твоя задача — рекомендовать оптимальную переброску мёртвого товара (dead stock) между магазинами.

Правила:
1. Распределяй товары ТОЛЬКО по указанным магазинам.
2. Не перебрасывай весь объём в один магазин — распределяй пропорционально.
3. Учитывай, что в магазине-получателе товар может продаваться лучше.
4. Возвращай ТОЛЬКО валидный JSON-массив.

Формат ответа строго:
[{"productName": "...", "toStoreUuid": "...", "toStoreName": "...", "quantity": N, "reason": "..."}]`;

			const userPrompt = `Магазин-отправитель: ${currentShopName}
Товары для переброски:
${productsList}

Доступные магазины-получатели:
${storesList}

Распредели эти товары по магазинам. Для каждого товара укажи toStoreUuid, toStoreName, quantity (целое число) и краткое обоснование (reason).`;

			const raw = await deepseekChat({
				apiKey,
				system: systemPrompt,
				user: userPrompt,
				maxTokens: 2048,
				temperature: 0.3,
			});

			// Парсим JSON из ответа (может быть обёрнут в ```json ... ```)
			const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
			const clean = (jsonMatch[1] || raw).trim();
			const transfers = JSON.parse(clean);

			return c.json({
				fromStore: { uuid: shopUuid, name: currentShopName },
				transfers,
			});
		} catch (error) {
			console.error("[stock-transfer] error:", error);
			return c.json({ error: "Ошибка анализа переброски товара" }, 500);
		}
	})
	// --- /api/evotor/stock-summary (missing stub) ---
	.post("/api/evotor/stock-summary", async (c) => {
		return c.json({ summary: [] });
	})
	// --- /api/evotor/stock-report GET alias (frontend uses GET, backend has POST) ---
	.get("/api/evotor/stock-report", async (c) => {
		return c.json({ items: [] });
	})
	// --- /api/uploads/upload-photos ---
	.post("/api/uploads/upload-photos", async (c) => {
		try {
			const formData = await c.req.formData();
			const file = formData.get("file") as File | null;
			const category = formData.get("category") as string | null;
			const userId = formData.get("userId") as string | null;
			const shopUuid = formData.get("shopUuid") as string | null;
			const fileKey = formData.get("fileKey") as string | null; // e.g. "shop:area_0"

			if (!file || !category || !userId || !shopUuid) {
				return c.json({ success: false, error: "Missing required fields" }, 400);
			}

			const today = new Date().toISOString().slice(0, 10);
			const arrayBuffer = await file.arrayBuffer();
			const chatId = c.env.TELEGRAM_STORAGE_CHAT_ID;
			const botToken = c.env.TELEGRAM_STORAGE_BOT_TOKEN || c.env.BOT_TOKEN;

			const fileId = await sendPhotoToTelegram(
				arrayBuffer,
				file.name,
				chatId,
				botToken,
			);

			// Extract slot index from fileKey (e.g. "shop:area_0" → "area", 0)
			const slotKey = fileKey?.split(":").pop() || `${category}_0`;
			const [cat, idxStr] = slotKey.includes("_")
				? slotKey.split("_")
				: [category, "0"];
			const slotIndex = Number.parseInt(idxStr, 10) || 0;

			// Upsert: replace if same shop/date/category/slot already exists
			await c.env.DB.prepare(`
				INSERT INTO opening_photos
					(shop_uuid, user_id, date, category, slot_index, telegram_file_id)
				VALUES (?, ?, ?, ?, ?, ?)
				ON CONFLICT(shop_uuid, date, category, slot_index)
				DO UPDATE SET telegram_file_id = excluded.telegram_file_id,
				              user_id = excluded.user_id
			`)
				.bind(shopUuid, userId, today, cat, slotIndex, fileId)
				.run();

			console.log(`[upload-photos] saved: ${cat}_${slotIndex} → ${fileId}`);

			return c.json({ success: true, slotKey: `${cat}_${slotIndex}` });
		} catch (err) {
			console.error("[upload-photos] error:", err);
			return c.json({ success: false, error: "Upload failed" }, 500);
		}
	})

	// --- /api/openings/photos — получить URL фото по file_id из Telegram ---
	.get("/api/openings/photos", async (c) => {
		const date = c.req.query("date");
		const shopUuid = c.req.query("shopUuid");

		if (!date || !shopUuid) {
			return c.json({ photos: [], error: "date and shopUuid required" }, 400);
		}

		const rows = await c.env.DB.prepare(`
			SELECT category, slot_index, telegram_file_id
			FROM opening_photos
			WHERE date = ? AND shop_uuid = ?
			ORDER BY category, slot_index
		`)
			.bind(date, shopUuid)
			.all<{ category: string; slot_index: number; telegram_file_id: string }>();

		if (!rows?.results?.length) {
			return c.json({ photos: [] });
		}

		const botToken = c.env.TELEGRAM_STORAGE_BOT_TOKEN || c.env.BOT_TOKEN;

		const photos = await Promise.all(
			rows.results.map(async (row) => {
				try {
					const url = await getTelegramFile(row.telegram_file_id, botToken);
					return {
						category: row.category,
						slot: row.slot_index,
						url,
					};
				} catch (err) {
					console.error(`[photos] failed getFile for ${row.telegram_file_id}:`, err);
					return {
						category: row.category,
						slot: row.slot_index,
						url: "",
						error: "Failed to retrieve",
					};
				}
			}),
		);

		return c.json({ photos });
	})

	// --- /api/evotor/settings-config (settings page) ---
	.get("/api/evotor/settings-config", async (c) => {
		try {
			const db = c.get("db");
			const tenantId = c.get("tenantId") || "default";
			const { getSettings } = await import("./db/repositories/settings.js");

			// Загружаем группы из shopProduct (D1)
			let groupOptions: Array<{ uuid: string; name: string }> = [];
			try {
				const groupsRaw = await db
					.prepare(
						"SELECT DISTINCT uuid, name FROM shopProduct WHERE product_group = 1"
					)
					.all<{ uuid: string; name: string }>();
				groupOptions = (groupsRaw.results ?? []).map((g) => ({
					uuid: g.uuid,
					name: g.name,
				}));
			} catch {
				groupOptions = [];
			}

			const settings = await getSettings(db, tenantId);

			return c.json({
				groupOptions,
				selectedGroupUuids: settings.accessoryGroupUuids,
				salary: settings.salary,
				bonus: settings.bonus,
			});
		} catch (err) {
			console.error("settings-config error:", err);
			return c.json({
				groupOptions: [],
				selectedGroupUuids: [],
				salary: 0,
				bonus: 0,
			});
		}
	})
	// --- /api/evotor/settings/accessory-groups ---
	.post("/api/evotor/settings/accessory-groups", async (c) => {
		try {
			const body = await c.req.json<{ groups: string[] }>();
			const db = c.get("db"); // raw D1Database
			const tenantId = c.get("tenantId") || "default";
			const { saveAccessoryGroups } = await import("./db/repositories/settings.js");

			const uuids = Array.isArray(body.groups) ? body.groups : [];
			// Save to settings + accessories (tenant-scoped settings)
			await saveAccessoryGroups(null, db, uuids, tenantId);

			// Разрешаем UUID в имена через shopProduct (D1)
			let groupsName: string[] = [];
			try {
				if (uuids.length > 0) {
					const db = c.get("db");
					const placeholders = uuids.map(() => "?").join(",");
					const result = await db
						.prepare(
							`SELECT uuid, name FROM shopProduct WHERE uuid IN (${placeholders})`
						)
						.bind(...uuids)
						.all<{ uuid: string; name: string }>();
					const nameMap = new Map((result.results ?? []).map((r) => [r.uuid, r.name]));
					groupsName = uuids.map((u) => nameMap.get(u)).filter(Boolean) as string[];
				}
			} catch {
				groupsName = [];
			}

			return c.json({ groupsName });
		} catch (err) {
			console.error("save accessory-groups error:", err);
			return c.json({ groupsName: [] }, 500);
		}
	})
	// --- /api/evotor/settings/salary-bonus ---
	.post("/api/evotor/settings/salary-bonus", async (c) => {
		try {
			const body = await c.req.json<{ salary: number; bonus: number }>();
			const db = c.get("db");
			const tenantId = c.get("tenantId") || "default";
			const { saveSalaryBonus } = await import("./db/repositories/settings.js");

			await saveSalaryBonus(db, body.salary ?? 0, body.bonus ?? 0, tenantId);

			return c.json({ ok: true });
		} catch (err) {
			console.error("save salary-bonus error:", err);
			return c.json({ ok: false }, 500);
		}
	})

	// --- /api/evotor/settings/shop-schedules ---
	// GET  ?shopId=... (опционально)
	.get("/api/evotor/settings/shop-schedules", async (c) => {
		try {
			const db = c.get("db");
			await createShopSchedulesTable(db);
			const shopId = c.req.query("shopId");
			const rows = await getShopSchedules(db, shopId || undefined);
			return c.json({ ok: true, rows });
		} catch (err) {
			console.error("get shop-schedules error:", err);
			return c.json({ ok: false, error: String(err) }, 500);
		}
	})
	// POST  принимает { rows: ShopScheduleRow[] }
	.post("/api/evotor/settings/shop-schedules", async (c) => {
		try {
			const db = c.get("db");
			await createShopSchedulesTable(db);
			const body = await c.req.json<{ rows: ShopScheduleRow[] }>();
			const rows = body.rows ?? [];

			// Валидация: open_time < close_time для рабочих дней
			const result = await upsertShopSchedules(db, rows);

			return c.json({
				ok: result.ok,
				count: rows.length,
				errors: result.errors,
			});
		} catch (err) {
			console.error("save shop-schedules error:", err);
			return c.json({ ok: false, error: String(err) }, 500);
		}
	})

	// --- /api/evotor/shops/open-status?date=YYYY-MM-DD ---
	// Возвращает статус открытия магазинов на указанную дату:
	// кто открыл, во сколько, сравнение с расписанием
	.get("/api/evotor/shops/open-status", async (c) => {
		try {
			const db = c.get("db");
			const dateParam = c.req.query("date") || formatDate(new Date());
			const since = formatDateWithTime(new Date(dateParam + "T12:00:00+03:00"), false);
			const until = formatDateWithTime(new Date(dateParam + "T12:00:00+03:00"), true);

			// Получаем расписание на этот день недели
			const targetWeekday = new Date(dateParam + "T12:00:00+03:00").getDay();
			await createShopSchedulesTable(db);
			const allSchedules = await getShopSchedules(db);
			const scheduleByShop = new Map<string, { open: string; close: string; working: boolean }>();
			for (const s of allSchedules) {
				if (s.weekday === targetWeekday) {
					scheduleByShop.set(s.shop_id, { open: s.open_time, close: s.close_time, working: s.is_working_day });
				}
			}

			// Получаем OPEN_SESSION за сегодня
			const sessions = await getOpenSessionsFromD1(db, since, until);
			const sessionByShop = new Map<string, { userUuid: string; time: string }>();
			for (const s of sessions) {
				// Берём самый ранний OPEN_SESSION (если их несколько)
				if (!sessionByShop.has(s.storeUuid) || s.openTime < sessionByShop.get(s.storeUuid)!.time) {
					sessionByShop.set(s.storeUuid, { userUuid: s.openUserUuid, time: s.openTime });
				}
			}

			// Получаем список всех магазинов
			const shopsResult = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>();
			const shops = shopsResult.results ?? [];

			// Собираем имена сотрудников (кэшируем, чтобы не делать N запросов)
			const employeeNames = new Map<string, string>();
			for (const s of sessions) {
				if (!employeeNames.has(s.openUserUuid)) {
					try {
						const name = await getEmployeeNameByUuid(db, s.openUserUuid);
						employeeNames.set(s.openUserUuid, name || s.openUserUuid.slice(0, 8));
					} catch {
						employeeNames.set(s.openUserUuid, s.openUserUuid.slice(0, 8));
					}
				}
			}

			const result = shops.map(shop => {
				const schedule = scheduleByShop.get(shop.uuid);
				const session = sessionByShop.get(shop.uuid);

// Извлекаем время открытия (HH:MM) из close_date с конвертацией UTC→MSK
			const extractTimeMSK = (dateStr: string): string => {
				// Формат: "2026-07-15T04:21:00.000+0000" или "2026-07-15 04:21:00"
				const t = dateStr.match(/[T ](\d{2}):(\d{2})/);
				if (!t) return "—";
				const h = (parseInt(t[1]) + 3) % 24; // UTC → MSK
				return `${String(h).padStart(2, "0")}:${t[2]}`;
				};

				const parseMinutes = (time: string): number => {
					const [h, m] = time.split(":").map(Number);
					return h * 60 + m;
				};

				let openTime: string | null = null;
				let sellerName: string | null = null;
				let sellerUuid: string | null = null;
				let onTime: boolean | null = null;
				let lateByMinutes: number | null = null;
				let notOpenedYet = true;

				if (session) {
					openTime = extractTimeMSK(session.time);
					sellerName = employeeNames.get(session.userUuid) || session.userUuid;
					sellerUuid = session.userUuid;
					notOpenedYet = false;

					if (schedule && schedule.working && schedule.open) {
						const actualMin = parseMinutes(openTime);
						const scheduleMin = parseMinutes(schedule.open);
						lateByMinutes = Math.max(0, actualMin - scheduleMin);
						onTime = lateByMinutes <= 10;
					}
				}

				return {
					shopId: shop.uuid,
					shopName: shop.name,
					opened: !notOpenedYet,
					openTime,
					sellerName,
					sellerUuid,
					scheduleOpen: schedule?.open || null,
					scheduleClose: schedule?.close || null,
					isWorkingDay: schedule?.working ?? true,
					onTime,
					lateByMinutes,
					notOpenedYet,
				};
			});

			return c.json({ shops: result, date: dateParam, targetWeekday });
		} catch (err) {
			console.error("open-status error:", err);
			return c.json({ shops: [], error: String(err) }, 500);
		}
	})

	// --- /api/evotor/accessoriesSales/:role/:userId ---
	.post("/api/evotor/accessoriesSales/:role/:userId", async (c) => {
		try {
			const evo = c.var.evotor;
			const { role, userId } = c.req.param();
			const body = await c.req.json().catch(() => null);

			const today = new Date();
			const since = body?.since
				? formatDateWithTime(new Date(body.since), false)
				: formatDateWithTime(today, false);
			const until = body?.until
				? formatDateWithTime(new Date(body.until), true)
				: formatDateWithTime(today, true);

			let shopNameMap: Record<string, string> = {};

			if (role === "SUPERADMIN") {
				// D1 вместо Evotor API — мгновенно
				const db = c.get("db");
				const shopsResult = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>();
				for (const row of shopsResult.results ?? []) {
					shopNameMap[row.uuid] = row.name;
				}
			} else {
				const employees = await evo.getEmployees();
				const employee = employees.find((emp: any) => emp.lastName === userId);
				if (!employee?.uuid) return c.json({ byShop: [], total: [], nonAccessoriesByShop: [], nonAccessoriesTotal: [] });

				const employeeStores = employee?.stores || [];
				let shopUuid = await evo.getFirstOpenSession(since, until, employee.uuid);
				if (!shopUuid && employeeStores.length > 0) shopUuid = employeeStores[0];
				if (!shopUuid) return c.json({ byShop: [], total: [], nonAccessoriesByShop: [], nonAccessoriesTotal: [] });

				const shopName = await evo.getShopName(shopUuid);
				shopNameMap[shopUuid] = shopName || shopUuid;
			}

			const result = await getAccessoriesSalesFromD1(
				c.env.DB,
				since,
				until,
				shopNameMap,
			);

			// Обогащаем себестоимость из 1С
			await enrichAccessoriesCost(c.env.DB, since, result);

			return c.json(result);
		} catch (err) {
			console.error("accessoriesSales error:", err);
			return c.json({ byShop: [], total: [], nonAccessoriesByShop: [], nonAccessoriesTotal: [] });
		}
	})

	// --- /api/reports/share — генерация шаримой HTML-версии отчёта ---
	.post("/api/reports/share", async (c) => {
		try {
			const db = c.env.DB as D1Database;
			const body = await c.req.json<{
				reportType: string;
				params: { since: string; until: string; shopId?: string };
			}>();
			const { reportType, params } = body;

			if (!reportType || !params?.since || !params?.until) {
				return c.json({ error: "reportType, params.since, params.until обязательны" }, 400);
			}

			let html = "";

			if (reportType === "revenue") {
				html = await generateRevenueShareHtml(db, params);
			} else {
				return c.json({ error: `Неизвестный тип отчёта: ${reportType}` }, 400);
			}

			// Сохраняем в R2
			const reportId = crypto.randomUUID();
			const key = `reports/${reportId}.html`;
			const r2 = c.env.R2 as any;
			const encoder = new TextEncoder();
			await r2.put(key, encoder.encode(html), {
				httpMetadata: { contentType: "text/html; charset=utf-8" },
			});

			// Ссылку строим от реального домена (Host), а не от R2_PUBLIC_URL,
			// чтобы на проде получался https://gimolost2.ru/reports/<id>.html
			const host = c.req.header("Host") || `localhost:${process.env.PORT || 3000}`;
			const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
			const shareUrl = `${proto}://${host}/reports/${reportId}.html`;

			return c.json({ shareUrl, reportId, expiresIn: "14 дней" });
		} catch (err) {
			console.error("[reports/share] error:", err);
			return c.json({ error: String(err) }, 500);
		}
	})

	// --- /reports/:key — публичная раздача сохранённого HTML-отчёта из R2 ---
	.get("/reports/:key", async (c) => {
		try {
			const key = c.req.param("key");
			if (!key || key.includes("/")) return c.text("Отчёт не найден", 404);
			const object = await c.env.R2.get(`reports/${key}`);
			if (!object) return c.text("Отчёт не найден или истёк", 404);

			let data: Uint8Array;
			if (typeof (object as any).arrayBuffer === "function") {
				data = new Uint8Array(await (object as any).arrayBuffer());
			} else {
				// LocalR2Bucket: body — Node stream / ReadableStream
				const chunks: Uint8Array[] = [];
				const stream = (object as any).body as AsyncIterable<Uint8Array>;
				for await (const chunk of stream) chunks.push(chunk);
				const total = chunks.reduce((s, ch) => s + ch.length, 0);
				data = new Uint8Array(total);
				let off = 0;
				for (const ch of chunks) { data.set(ch, off); off += ch.length; }
			}
			return new Response(data, {
				headers: {
					"Content-Type": "text/html; charset=utf-8",
					"Cache-Control": "public, max-age=3600",
				},
			});
		} catch (err) {
			console.error("[reports/:key] error:", err);
			return c.text("Ошибка загрузки отчёта", 500);
		}
	})

	// --- end compatibility routes ---
	;

// ============================================================================
// Helpers for /api/reports/share
// ============================================================================

async function generateRevenueShareHtml(
	db: D1Database,
	params: { since: string; until: string; shopId?: string },
): Promise<string> {
	const since = params.since + "T00:00:00";
	const until = params.until + "T23:59:59";
	const hasShop = !!(params.shopId && params.shopId !== "all");
	const shopFilter = hasShop ? "AND shop_id = ?" : "";

	const docs = await db
		.prepare(`SELECT transactions, type, shop_id FROM index_documents
		          WHERE close_date >= ? AND close_date <= ? ${shopFilter}
		            AND type IN ('SELL', 'PAYBACK')`)
		.bind(...(hasShop ? [since, until, params.shopId as string] : [since, until]))
		.all<{ transactions: string; type: string; shop_id: string }>();

	const byProduct = new Map<string, { qty: number; sum: number }>();
	for (const doc of docs.results ?? []) {
		const isRefund = doc.type === "PAYBACK";
		const sign = isRefund ? -1 : 1;
		let txs: any[];
		try { txs = JSON.parse(doc.transactions); } catch { continue; }
		if (!Array.isArray(txs)) continue;
		for (const tx of txs) {
			if (tx.type !== "REGISTER_POSITION") continue;
			const name = (tx.commodityName || "—").trim();
			const qty = (tx.quantity ?? 0) * sign;
			const sum = (tx.sum ?? 0) * sign;
			if (!byProduct.has(name)) byProduct.set(name, { qty: 0, sum: 0 });
			const p = byProduct.get(name)!;
			p.qty += qty;
			p.sum += sum;
		}
	}

	const sorted = [...byProduct.entries()]
		.filter(([, v]) => v.sum > 0)
		.sort((a, b) => b[1].sum - a[1].sum);

	const totalRevenue = sorted.reduce((s, [, v]) => s + v.sum, 0);
	const totalQty = sorted.reduce((s, [, v]) => s + v.qty, 0);
	const shopName = params.shopId && params.shopId !== "all"
		? (await db.prepare("SELECT name FROM shops WHERE uuid = ?").bind(params.shopId).first<{ name: string }>())?.name || params.shopId
		: "Все магазины";

	const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
	const rows = sorted.map(([name, v], i) => {
		const share = sorted.length > 0 ? ((v.sum / totalRevenue) * 100).toFixed(1) : "0";
		return `<tr class="${i % 2 === 0 ? "even" : ""}">
			<td class="name">${escapeHtml(name)}</td>
			<td class="num">${fmt(v.qty)}</td>
			<td class="num">${fmt(v.sum)} ₽</td>
			<td class="num">${share}%</td>
		</tr>`;
	}).join("");

	const generatedAt = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });

	return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Отчёт по продажам — ${escapeHtml(shopName)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f7;color:#1d1d1f;padding:20px}
  .card{max-width:800px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  h1{font-size:20px;margin-bottom:4px}
  .subtitle{color:#86868b;font-size:14px;margin-bottom:20px}
  .kpi{display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap}
  .kpi-item{flex:1;min-width:120px;background:#f5f5f7;border-radius:12px;padding:12px 16px}
  .kpi-label{font-size:11px;color:#86868b;text-transform:uppercase;margin-bottom:4px}
  .kpi-value{font-size:22px;font-weight:700}
  .kpi-primary{background:#0071e3;color:#fff}
  .kpi-primary .kpi-label{color:rgba(255,255,255,.7)}
  table{width:100%;border-collapse:collapse}
  th{text-align:left;padding:8px 12px;font-size:11px;color:#86868b;text-transform:uppercase;border-bottom:2px solid #e5e5ea}
  td{padding:10px 12px;font-size:14px;border-bottom:1px solid #f0f0f5}
  .name{font-weight:500}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  .even{background:#fafafc}
  tr:hover{background:#f0f0f5}
  .footer{margin-top:24px;padding-top:16px;border-top:1px solid #e5e5ea;text-align:center;color:#aeaeb2;font-size:12px}
  @media(max-width:480px){body{padding:8px}.card{padding:16px}.kpi-item{min-width:100px}}
</style>
</head>
<body>
<div class="card">
  <h1>Отчёт по продажам</h1>
  <p class="subtitle">${escapeHtml(shopName)} · ${params.since} → ${params.until}</p>
  <div class="kpi">
    <div class="kpi-item kpi-primary">
      <div class="kpi-label">Выручка</div>
      <div class="kpi-value">${fmt(totalRevenue)} ₽</div>
    </div>
    <div class="kpi-item">
      <div class="kpi-label">Продано</div>
      <div class="kpi-value">${fmt(totalQty)} шт</div>
    </div>
    <div class="kpi-item">
      <div class="kpi-label">SKU</div>
      <div class="kpi-value">${sorted.length}</div>
    </div>
  </div>
  <table>
    <thead><tr><th>Товар</th><th class="num">Шт</th><th class="num">Сумма</th><th class="num">Доля</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">Сгенерировано ${generatedAt} (МСК) · Evo App</div>
</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Push-уведомления ──────────────────────────────────────────────────

// ─── Push-уведомления (D1-backed) ──────────────────────────────────────

api
	.post("/api/push/subscribe", async (c) => {
		try {
			const db = c.get("db");
			const body = await c.req.json<{ endpoint: string; keys: { p256dh: string; auth: string } }>();
			const { isValidSubscription, saveSubscription, getSubscriptionCount } = await import("./push/pushService.js");
			if (!isValidSubscription(body)) {
				return c.json({ error: "Invalid subscription" }, 400);
			}
			await saveSubscription(db, body);
			const count = await getSubscriptionCount(db);
			console.log(`[push] +1 подписка (всего ${count})`);
			return c.json({ ok: true, count });
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	})
	.post("/api/push/unsubscribe", async (c) => {
		try {
			const db = c.get("db");
			const body = await c.req.json<{ endpoint: string }>();
			const { removeSubscription } = await import("./push/pushService.js");
			await removeSubscription(db, body.endpoint);
			console.log(`[push] −1 подписка`);
			return c.json({ ok: true });
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	})
	.get("/api/push/vapid-public-key", (c) => {
		return c.json({ publicKey: process.env.VAPID_PUBLIC_KEY || "" });
	})
	.post("/api/push/trigger", async (c) => {
		try {
			const db = c.get("db");
			const { runPushCycle } = await import("./push/pushScheduler.js");
			const result = await runPushCycle(db);
			return c.json(result);
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	})
	.get("/api/push/status", async (c) => {
		try {
			const db = c.get("db");
			const { getSubscriptionCount } = await import("./push/pushService.js");
			const { getWeeklyStats } = await import("./push/decisionLogger.js");
			const count = await getSubscriptionCount(db);
			const stats = await getWeeklyStats(db);
			return c.json({
				subscriptions: count,
				vapidConfigured: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
				weeklyStats: stats,
			});
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	})
	.post("/api/push/outcome", async (c) => {
		try {
			const db = c.get("db");
			const body = await c.req.json<{ title: string; outcome: string }>();
			const { logOutcomeByTitle } = await import("./push/decisionLogger.js");
			await logOutcomeByTitle(db, body.title, body.outcome as any);
			return c.json({ ok: true });
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	});

// ─── Настройки продавцов ──────────────────────────────────────────────

api
	.get("/api/sellers/settings", async (c) => {
		try {
			const db = c.get("db");
			const tenantId = c.get("tenantId");
			const empRows = await db
				.prepare("SELECT uuid, name FROM employees WHERE tenant_id = ? ORDER BY name")
				.bind(tenantId)
				.all<{ uuid: string; name: string }>();
			const setRows = await db
				.prepare("SELECT * FROM seller_settings")
				.all<any>();
			const map = new Map((setRows.results ?? []).map((s: any) => [s.employee_uuid, s]));
			const sellers = (empRows.results ?? []).map((emp) => {
				const s = map.get(emp.uuid);
				return {
					uuid: emp.uuid,
					name: emp.name,
					salary_mode: normalizeSalaryMode(s?.salary_mode),
					base_salary: s?.base_salary ?? 0,
				};
			});
			return c.json({ sellers });
		} catch (err) {
			return c.json({ error: String(err), sellers: [] }, 500);
		}
	})
	.put("/api/sellers/:uuid", async (c) => {
		try {
			const db = c.get("db");
			const uuid = c.req.param("uuid");
			const body = await c.req.json<{
				employee_name: string;
				salary_mode: string;
				base_salary: number;
			}>();
			await db
				.prepare(
					`INSERT OR REPLACE INTO seller_settings
					 (employee_uuid, employee_name, salary_mode, base_salary, updated_at)
					 VALUES (?, ?, ?, ?, datetime('now'))`,
				)
				.bind(uuid, body.employee_name, normalizeSalaryMode(body.salary_mode), body.base_salary)
				.run();
			return c.json({ ok: true });
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	});

// ─── Акционные товары ─────────────────────────────────────────────────

api
	// Список товаров в группе (дедуплицировано по имени)
	.get("/api/shop-products", async (c) => {
		try {
			const db = c.get("db");
			const groupUuid = c.req.query("group_uuid");
			if (!groupUuid) {
				return c.json({ products: [] });
			}
			const rows = await db
				.prepare(
					"SELECT name, MIN(uuid) as uuid, MIN(article) as article, MIN(price) as price FROM shopProduct WHERE parentUuid = ? GROUP BY name ORDER BY name",
				)
				.bind(groupUuid)
				.all<{ uuid: string; name: string; article: string; price: number }>();
			return c.json({ products: rows.results ?? [] });
		} catch (err) {
			return c.json({ error: String(err), products: [] }, 500);
		}
	})

	// Список всех акционных товаров
	.get("/api/promo/products", async (c) => {
		try {
			const db = c.get("db");
			const rows = await db
				.prepare(
					`SELECT * FROM promo_products
					 WHERE is_active = 1 OR deactivated_at >= datetime('now', '-7 days')
					 ORDER BY group_name, product_name`,
				)
				.all();
			return c.json({ products: rows.results ?? [] });
		} catch (err) {
			return c.json({ error: String(err), products: [] }, 500);
		}
	})

	// Включить/выключить акцию
	.post("/api/promo/toggle", async (c) => {
		try {
			const db = c.get("db");
			const body = await c.req.json<{
				product_uuid: string;
				product_name: string;
				group_uuid: string;
				group_name: string;
				bonus_amount: number;
				is_active: boolean;
			}>();
			const now = new Date().toISOString().replace("T", " ").slice(0, 19);

			if (body.is_active) {
				// Включаем акцию — новая запись
				await db
					.prepare(
						`INSERT INTO promo_products (product_uuid, product_name, group_uuid, group_name, bonus_amount, is_active, activated_at)
						 VALUES (?, ?, ?, ?, ?, 1, ?)`,
					)
					.bind(body.product_uuid, body.product_name, body.group_uuid, body.group_name, body.bonus_amount, now)
					.run();
			} else {
				// Выключаем — закрываем последнюю активную запись
				await db
					.prepare(
						`UPDATE promo_products SET is_active = 0, deactivated_at = ?
						 WHERE product_uuid = ? AND is_active = 1`,
					)
					.bind(now, body.product_uuid)
					.run();
			}

			return c.json({ ok: true });
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	})

	// Заработок на акционных товарах за сегодня
	.get("/api/promo/today-earnings", async (c) => {
		try {
			const db = c.get("db");
			const employeeUuid = c.req.query("employee_uuid") || "";
			const today = new Date().toISOString().slice(0, 10);

			let items: { product: string; bonus: number; qty: number; earned: number }[] = [];

			// Пробуем с productSold (есть в продакшене)
			try {
				const cond = employeeUuid ? "AND ps.employeeUuid = ?" : "";
				const bindArgs = employeeUuid
					? [today, employeeUuid, today, today]
					: [today, today, today];

				const rows = await db
					.prepare(
						`SELECT pp.product_name, pp.bonus_amount,
							COALESCE(SUM(CASE WHEN ps.type = 'SELL' THEN ps.quantity ELSE 0 END), 0)
							  - COALESCE(SUM(CASE WHEN ps.type = 'PAYBACK' THEN ps.quantity ELSE 0 END), 0) AS qty
						FROM promo_products pp
						LEFT JOIN productSold ps
							ON ps.productUuid = pp.product_uuid AND ps.date = ? ${cond}
						WHERE pp.is_active = 1
							AND pp.activated_at <= datetime(? || ' 23:59:59')
							AND (pp.deactivated_at IS NULL OR pp.deactivated_at > datetime(? || ' 00:00:00'))
						GROUP BY pp.id
						ORDER BY pp.product_name`,
					)
					.bind(...bindArgs)
					.all<{ product_name: string; bonus_amount: number; qty: number }>();

				items = (rows.results ?? []).map((r) => ({
					product: r.product_name,
					bonus: r.bonus_amount,
					qty: Math.max(0, r.qty),
					earned: Math.max(0, r.qty) * r.bonus_amount,
				}));
			} catch {
				// productSold не существует — запрашиваем без него
			}

			// Если продаж нет — показываем все активные акции с 0 продаж
			if (items.length === 0) {
				try {
					const rows = await db
						.prepare(
							`SELECT product_name, bonus_amount
							 FROM promo_products
							 WHERE is_active = 1
							   AND activated_at <= datetime(? || ' 23:59:59')
							   AND (deactivated_at IS NULL OR deactivated_at > datetime(? || ' 00:00:00'))
							 ORDER BY product_name`,
						)
						.bind(today, today)
						.all<{ product_name: string; bonus_amount: number }>();
					items = (rows.results ?? []).map((r) => ({
						product: r.product_name,
						bonus: r.bonus_amount,
						qty: 0,
						earned: 0,
					}));
				} catch { /* ignore */ }
			}

			const total = items.reduce((s, i) => s + i.earned, 0);
			return c.json({ items, total });
		} catch (err) {
			return c.json({ error: String(err), items: [], total: 0 }, 500);
		}
	});

// ─── Настройки приложения ──────────────────────────────────────────────

api
	.get("/api/settings", async (c) => {
		try {
			const db = c.get("db");
			const tenantId = c.get("tenantId") || "default";
			const { getAllSettings } = await import("./services/settingsService.js");
			const settings = await getAllSettings(db, tenantId);
			return c.json(settings);
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	})
	.put("/api/settings/:key", async (c) => {
		try {
			const db = c.get("db");
			const tenantId = c.get("tenantId") || "default";
			const key = c.req.param("key");
			const body = await c.req.json<{ value: string }>();
			const { updateSetting } = await import("./services/settingsService.js");
			await updateSetting(db, key, body.value, tenantId);
			return c.json({ ok: true });
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	})
	.post("/api/settings/batch", async (c) => {
		try {
			const db = c.get("db");
			const tenantId = c.get("tenantId") || "default";
			const body = await c.req.json<Array<{ key: string; value: string }>>();
			const { batchUpdateSettings } = await import("./services/settingsService.js");
			await batchUpdateSettings(db, body, tenantId);
			return c.json({ ok: true });
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	})
	.get("/api/tenant/opening-config", async (c) => {
		try {
			const db = c.get("db");
			const tenantId = c.get("tenantId") || "default";
			const { getOpeningConfig } = await import("./services/openingConfigService.js");
			return c.json(await getOpeningConfig(db, tenantId));
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	})
	.put("/api/tenant/opening-config", requireSuperAdmin, async (c) => {
		try {
			const db = c.get("db");
			const tenantId = c.get("tenantId") || "default";
			const body = await c.req.json();
			const { saveOpeningConfig } = await import("./services/openingConfigService.js");
			const result = await saveOpeningConfig(db, tenantId, body);
			if (!result.ok) {
				return c.json({ success: false, error: result.error }, 400);
			}
			return c.json({ success: true, config: result.config });
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	})
	.get("/api/tenant/feature-permissions", async (c) => {
		try {
			const db = c.get("db");
			const tenantId = c.get("tenantId") || "default";
			const { getFeaturePermissions } = await import("./services/featurePermissionsService.js");
			return c.json(await getFeaturePermissions(db, tenantId));
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	})
	.put("/api/tenant/feature-permissions", requireSuperAdmin, async (c) => {
		try {
			const db = c.get("db");
			const tenantId = c.get("tenantId") || "default";
			const body = await c.req.json();
			const { saveFeaturePermissions } = await import("./services/featurePermissionsService.js");
			const result = await saveFeaturePermissions(db, tenantId, body);
			return c.json({ success: true, config: result.config });
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	});

// Auth / Users / Tenants (modules/auth)
registerAuthRoutes(api);
// ИИ-провайдер (DeepSeek) — ключ тенанта
registerAiProviderRoutes(api);

