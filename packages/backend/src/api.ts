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
import { requireAdmin } from "./helpers";
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
} from "./utils";
// import type { CandleBinance } from "./utils";
import {
	getDocumentsByCashOutcomeData,
	getProductNamesByGroup,
	getSalesByProductFromD1,
	getSalesDataG,
	getSalesgardenReportData,
	getTopProductsFromD1,
	getAccessoriesSalesFromD1,
	extractSalesInfoFromD1,
	getCashByShopsFromD1,
	getOpenSessionsFromD1,
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
import { sendDeadStocksToTelegram } from "../utils/sendDeadStocksToTelegram";
import { sendPhotoToTelegram } from "../utils/sendPhotoToTelegram";
import {
  getDataForCurrentDate,
  syncDocuments,
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
			await getEmployeesLastNameAndUuidFromDB(db);
		// console.log("employeeNameAndUuid:", employeeNameAndUuid);

		assert(employeeNameAndUuid, "not an employee");
		return c.json({ employeeNameAndUuid });
	})

	.post("/api/employee/and-store/name-uuid", async (c) => {
		const db = c.get("db");
		const data = await c.req.json();
		const { shop } = data;

		const employeeNameAndUuid = await getEmployeesByShopIdDB(db, shop);
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
		const shopsNameAndUuid = await getShopNameUuidsFromDB(db);
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
		const { getSalesTodayFromD1 } = await import("./evotor/utils.js");
		const salesData = await getSalesTodayFromD1(db);

		assert(salesData, "No sales data found");

		return c.json({ salesData });
	})

	.get("/api/evotor/sales-today-graf", async (c) => {
		const db = c.get("db"); // Получаем подключение к базе данных
		const evo = c.var.evotor;

		const shopUuids = await getShopUuidsFromDB(db);

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

			// Получаем список магазинов из D1
			const shopsResult = await db.prepare(
				"SELECT uuid, name FROM shops"
			).all<{ uuid: string; name: string }>();
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
		// console.log("Полученные данные:", data);
		// await createProductsTableIfNotExists(c.get("db"));

		// const shopUuids = await c.var.evotor.getShopUuids();
		// console.log(shopUuids);

		// for (const shopU of shopUuids) {
		// 	const test = await c.var.evotor.getProductsShopUuidsT(shopU);
		// 	console.log(test);
		// 	await updateOrInsertData(test, c.get("db"));
		// }

		const groupsData = await getGroupsByNameUuid(c.get("db"), shopUuid);
		// console.log(groupsData);
		// Получение списка магазинов
		// const groupsData = await c.var.evotor.getGroupsByNameUuid(shopUuid);
		if (groupsData) {
			const excludedUuids = [
				"3f51bb7f-f3a2-11e8-b973-ccb0da458b5a",
				"be7939b7-d6e6-11ea-b9a5-ccb0da458b5a",
			];

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
						const bonusAccessories = Math.floor(salesDataAks * 0.05);

						const salesDataVape = await getSalesSumFromD1(
							db,
							openShopUuid,
							since,
							until,
							productsVape,
						);

						const bonusPlan =
						(currentPlan > 0 && salesDataVape >= currentPlan) ? 450 : 0;
						Object.assign(dataReport, {
						salesAccessories: salesDataAks,
						bonusAccessories,
						dataPlan: currentPlan,
						salesDataVape,
						bonusPlan,
						totalBonus: bonusAccessories + bonusPlan,
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
		const result = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>();
		const shopOptions: Record<string, string> = {};
		for (const row of result.results ?? []) {
			shopOptions[row.uuid] = row.name;
		}
		return c.json({ shopOptions });
	})

	.get("/api/evotor/shops-names", async (c) => {
		const db = c.get("db");
		const result = await db.prepare("SELECT name FROM shops").all<{ name: string }>();
		const shopsName = (result.results ?? []).map(r => r.name);
		return c.json({ shopsName });
	})

	.get("/api/evotor/sales-report", async (c) => {
		const db = c.get("db");
		const shopsResult = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>();
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

			const since = formatDateWithTime(new Date(startDate), false);
			const until = formatDateWithTime(new Date(endDate), true);

			const shopRow = await c.get("db").prepare("SELECT name FROM shops WHERE uuid = ?").bind(shopUuid).first<{ name: string }>();
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

			return c.json({ salesData, shopName, startDate, endDate });
		} catch (error) {
			console.error("Ошибка при обработке sales-result:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})

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
			// Получаем данные из запроса
			const data = await c.req.json();
			// console.log("Полученные данные:", data);

			const { shopUuid, groups } = data;

			// Получаем список товаров для заданных групп
			const stockDataResponse = await c.var.evotor.getStockByGroup(
				shopUuid,
				groups,
				"price",
			);
			// console.log("данные:", stockDataResponse);

			// Проверяем, что данные о товарах получены
			if (!stockDataResponse || Object.keys(stockDataResponse).length === 0) {
				return c.json({ error: "Не удалось получить данные о товаре." }, 500);
			}

			// // Сортируем данные о товарах
			// const sortedStockData = sortStockData(stockDataResponse, sortCriteria);
			// // console.log("Отсортированные данные:", sortedStockData);
			const shopNameRow = await c.get("db").prepare("SELECT name FROM shops WHERE uuid = ?").bind(shopUuid).first<{ name: string }>();
			const shopName = shopNameRow?.name || shopUuid;

			// Отправляем ответ
			return c.json({ stockData: stockDataResponse, shopName });
		} catch (error) {
			// Логируем ошибку и возвращаем 500
			console.error("Ошибка при обработке запроса:", error);
			return c.json({ error: "Произошла ошибка при обработке запроса." }, 500);
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

			const shopUuids = await getShopUuidsFromDB(db);

			const { salesDataByShopName, grandTotalSell, grandTotalRefund, dailySell } =
				await getSalesgardenReportData(db, shopUuids, since, until);

			const cashOutcomeData = await getDocumentsByCashOutcomeData(
				db,
				shopUuids,
				since,
				until,
			);

			const grandTotalCashOutcome = calculateTotalSum(cashOutcomeData);
			const cash = await getCashByShopsFromD1(db);

			return c.json({
				salesDataByShopName,
				grandTotalSell,
				grandTotalRefund,
				grandTotalCashOutcome,
				dailySell,
				cashOutcomeData,
				cash,
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

			const shopUuids = await getShopUuidsFromDB(db);

			const sincetDate = new Date(startDate); // Преобразуем в объект Date
			const untilDate = new Date(endDate); // Преобразуем в объект Date

			const since = formatDateWithTime(sincetDate, false); // Форматируем начальную дату
			const until = formatDateWithTime(untilDate, true); // Форматируем конечную дату

			// const filteredUuids = shopUuids.filter(
			// 	(uuid: string) => uuid !== "20231001-6611-407F-8068-AC44283C9196",
			// );

			const { salesDataByShopName, grandTotalSell, grandTotaRefund, dailySell } =
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
			);

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

			const cashBalanceByShop = await getCashByShopsFromD1(db);
			const totalCashBalance = Object.values(cashBalanceByShop).reduce((s, v) => s + v, 0);

			const grandTotalCashOutcome = calculateTotalSum(cashOutcomeData);
			return c.json({
				salesDataByShopName,
				grandTotalSell,
				grandTotalRefund: grandTotaRefund,
				grandTotalCashOutcome,
				dailySell,
				startDate,
				endDate,
				cashOutcomeData,
				cashBalanceByShop,
				totalCashBalance,
				topProducts,
			});
		} catch (error) {
			console.error("Ошибка при разборе JSON:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})

	.post("/api/profit-report", async (c) => {
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
	.post("/api/dead-stocks/data", async (c) => {
		try {
			const db = c.get("db");
			const { startDate, endDate, shopUuid, groups } = await c.req.json<{
				startDate: string;
				endDate: string;
				shopUuid: string;
				groups: string[];
			}>();

			// Получаем название магазина
			const shopRow = await db.prepare("SELECT name FROM shops WHERE uuid = ?").bind(shopUuid).first<{ name: string }>();
			const shopName = shopRow?.name || shopUuid;

			// Получаем все товары магазина (shopProduct)
			const products = await db.prepare(
				`SELECT uuid, name FROM shopProduct WHERE shopId = ? AND product_group = 0`
			).bind(shopUuid).all<{ uuid: string; name: string }>();

			if (!products.results || products.results.length === 0) {
				return c.json({ salesData: [], shopName, startDate, endDate });
			}

			// Если выбраны группы — фильтруем товары по группам
			let productUuids = products.results.map(p => p.uuid);
			if (groups.length > 0) {
				const placeholders = groups.map(() => "?").join(",");
				const filtered = await db.prepare(
					`SELECT DISTINCT uuid FROM shopProduct WHERE parentUuid IN (${placeholders}) AND shopId = ?`
				).bind(...groups, shopUuid).all<{ uuid: string }>();
				const filteredSet = new Set((filtered.results ?? []).map(r => r.uuid));
				productUuids = productUuids.filter(uuid => filteredSet.has(uuid));
			}

			// Получаем все SELL документы за период для этого магазина
			const soldUuids = new Set<string>();
			const lastSaleByUuid = new Map<string, string>();
			const soldQtyByUuid = new Map<string, number>();

			const docs = await db.prepare(
				`SELECT type, transactions, close_date FROM index_documents
				 WHERE shop_id = ? AND close_date >= ? AND close_date <= ?
				 AND type IN ('SELL', 'PAYBACK')`
			).bind(shopUuid, startDate + "T00:00:00", endDate + "T23:59:59").all<{
				type: string; transactions: string; close_date: string;
			}>();

			for (const doc of (docs.results ?? [])) {
				const isRefund = doc.type === "PAYBACK";
				const sign = isRefund ? -1 : 1;
				let txs: any[];
				try { txs = JSON.parse(doc.transactions); } catch { continue; }
				if (!Array.isArray(txs)) continue;

				for (const tx of txs) {
					if (tx.type !== "REGISTER_POSITION") continue;
					const uuid = tx.commodityUuid;
					if (!uuid) continue;
					if (!productUuids.includes(uuid)) continue;
					soldUuids.add(uuid);
					soldQtyByUuid.set(uuid, (soldQtyByUuid.get(uuid) ?? 0) + (tx.quantity ?? 0) * sign);
					const day = doc.close_date.slice(0, 10);
					if (!lastSaleByUuid.has(uuid) || day > lastSaleByUuid.get(uuid)!) {
						lastSaleByUuid.set(uuid, day);
					}
				}
			}

			// Товары, которых нет в soldUuids = «мёртвые остатки»
			const productNameMap = new Map(products.results.map(p => [p.uuid, p.name]));
			const salesData = productUuids
				.filter(uuid => !soldUuids.has(uuid))
				.map(uuid => ({
					name: productNameMap.get(uuid) || uuid,
					quantity: 1, // заглушка — реальное кол-во остатков потребует данных из Evotor API
					sold: soldQtyByUuid.get(uuid) ?? 0,
					lastSaleDate: lastSaleByUuid.get(uuid) || null,
				}))
				.sort((a, b) => a.name.localeCompare(b.name));

			return c.json({ salesData, shopName, startDate, endDate });
		} catch (err) {
			console.error("dead-stocks/data error:", err);
			return c.json({ salesData: [], shopName: "", startDate: "", endDate: "" }, 500);
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
			salary: { label: "расчёт ЗП", run: getDataForCurrentDate },
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
		const { ok, discrepancy, userId } = data;
		let cash: number | null = null;
		let sign: string | null = null;
		if (!ok && discrepancy) {
			cash = Number(discrepancy.amount);
			sign = discrepancy.type;
		}
		await updateOpenStore(db, userId, { cash, sign });
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

	// --- /api/deadStocks/update (camelCase alias) ---
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

	// --- /api/analytics/* stubs ---
	.get("/api/analytics/revenue/hourly-plan-fact", async (c) => {
		try {
			const date = c.req.query("date") || new Date().toISOString().slice(0, 10);
			const shopName = c.req.query("shopName");

			const db = c.env.DB;
			const evo = c.var.evotor;

			// Get shops from D1
			const shopsResult = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>();
			const shops = (shopsResult.results ?? []) as ShopUuidName[];
			if (!shops || !shops.length) return c.json({ rows: [], totalPlan: 0, actualNet: 0 });

			// Filter by shopName
			const targetUuids = new Set<string>();
			for (const shop of shops) {
				if (!shopName || shop.name === shopName) {
					targetUuids.add(shop.uuid);
				}
			}

			// Get plan from D1
			const planByShop = await getPlan(date, db);
			const totalPlan = Object.entries(planByShop || {})
				.filter(([uuid]) => targetUuids.has(uuid))
				.reduce((sum, [, amount]) => sum + Number(amount), 0);

			// Get actual sales
			const since = formatDateWithTime(new Date(date), false);
			const until = formatDateWithTime(new Date(date), true);

			const docResult = await db
				.prepare(`
					SELECT shop_id, type, close_date, transactions
					FROM index_documents
					WHERE close_date >= ? AND close_date <= ?
					  AND type IN ('SELL', 'PAYBACK')
				`)
				.bind(since, until)
				.all<{ shop_id: string; type: string; close_date: string; transactions: string }>();

			// Group sales by hour: { hour: { sell, refund } }
			const hourly: Record<number, { sell: number; refund: number }> = {};
			for (let h = 7; h <= 23; h++) hourly[h] = { sell: 0, refund: 0 };

			if (docResult?.results) {
				for (const row of docResult.results) {
					if (!targetUuids.has(row.shop_id)) continue;

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
			}

			// Compute rows
			const totalActualSell = Object.values(hourly).reduce((s, h) => s + h.sell, 0);
			const totalActualRefund = Object.values(hourly).reduce((s, h) => s + h.refund, 0);
			const actualNet = totalActualSell - totalActualRefund;

			const openingHours = 17; // 7–23 inclusive
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

				let hourPlan = 0;
				if (totalPlan > 0) {
					if (totalActualSell > 0) {
						// Distribute plan proportionally to actual hourly sell
						hourPlan = (hourly[h].sell / totalActualSell) * totalPlan;
					} else {
						hourPlan = totalPlan / openingHours;
					}
				}
				cumulativeExpected += hourPlan;

				rows.push({
					hour: h,
					label: `${String(h).padStart(2, "0")}:00`,
					actualHourly: Math.round(hourNet),
					actualCumulative: Math.round(cumulativeActual),
					expectedCumulative: Math.round(cumulativeExpected),
					gap: Math.round(cumulativeActual - cumulativeExpected),
				});
			}

			return c.json({ rows, totalPlan: Math.round(totalPlan), actualNet: Math.round(actualNet) });
		} catch (err) {
			console.error("hourly-plan-fact error:", err);
			return c.json({ rows: [], totalPlan: 0, actualNet: 0 });
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
			} else {
				const today = new Date();
				daySince = formatDateWithTime(today, false);
				dayUntil = formatDateWithTime(today, true);

				const weekStart = new Date(today);
				weekStart.setDate(weekStart.getDate() - 6);
				weekSince = formatDateWithTime(weekStart, false);
				weekUntil = formatDateWithTime(today, true);
			}

			// Get shops from D1
			const shopsResult = await db.prepare("SELECT uuid, name FROM shops").all<{ uuid: string; name: string }>();
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

				// Count SELL documents per shop for checks count
				const checksResult = await db
					.prepare(`
						SELECT shop_id, COUNT(*) as cnt
						FROM index_documents
						WHERE close_date >= ? AND close_date <= ?
						  AND type = 'SELL'
						GROUP BY shop_id
					`)
					.bind(since, until)
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

		if (!since || !until) {
			return c.json({ sellers: [] });
		}

		const cacheKey = `advanced-stats:${since}:${until}:${shopId ?? "all"}:${sellerIdsRaw ?? "all"}:${benchmarkWeekday ?? ""}:${weekday ?? ""}`;
		const cached = statsCache.get(cacheKey);
		if (cached && cached.expiresAt > Date.now()) {
			return c.json(cached.data);
		}

		try {
			const result = await computeSellerAdvancedStats(db, { since, until, shopId, sellerIds, benchmarkWeekday, weekday });
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
		const apiKey = c.env.DEEPSEEK_API_KEY as string;

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
		const apiKey = c.env.DEEPSEEK_API_KEY as string;

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

				for (const sid of shopUuids) {
					const productNames = await getProductNamesByGroup(
						c.get("db"),
						sid,
						groups,
					);
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

	// --- /api/evotor/groups-by-shop (missing stub) ---
	.post("/api/evotor/groups-by-shop", async (c) => {
		return c.json({ groups: [] });
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
				evotor: c.var.evotor,
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

			const apiKey = c.env.DEEPSEEK_API_KEY;
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
			const drizzle = c.get("drizzle");
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

			const settings = await getSettings(drizzle);

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
			const drizzle = c.get("drizzle");
			const db = c.get("db"); // raw D1Database for accessories table
			const { saveAccessoryGroups } = await import("./db/repositories/settings.js");

			const uuids = Array.isArray(body.groups) ? body.groups : [];
			// Save to settings via drizzle + accessories via raw D1
			await saveAccessoryGroups(drizzle, db, uuids);

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
			const drizzle = c.get("drizzle");
			const { saveSalaryBonus } = await import("./db/repositories/settings.js");

			await saveSalaryBonus(drizzle, body.salary ?? 0, body.bonus ?? 0);

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

			return c.json(result);
		} catch (err) {
			console.error("accessoriesSales error:", err);
			return c.json({ byShop: [], total: [], nonAccessoriesByShop: [], nonAccessoriesTotal: [] });
		}
	})

	// --- end compatibility routes ---
	;

export type IAPI = typeof api;
