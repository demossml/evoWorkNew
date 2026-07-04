import { Hono } from "hono";
import { cors } from "hono/cors";
import type { IEnv, SaveDeadStocksRequest } from "./types";
// import { createWorkersAI } from 'workers-ai-provider';
// import { Ai } from "@cloudflare/ai";
// import { z } from 'zod';
// import jwt from "jsonwebtoken";

// const JWT_SECRET = "your_secret_key"; // Секретный ключ для подписи токена

import { analyzeDocsStaffTask, getHoroscopeByDateTask } from "./ai";
import { runOrderForecastV2 } from "./services/orderForecastV2";
import { deepseekChat } from "./services/deepseek";
import type { ShopUuidName } from "./evotor/types";
import {
	assert,
	buildSinceUntilFromDocuments,
	calculateTotalSum,
	createAccessoriesTable,
	createPlanTable,
	createSalaryBonusTable,
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
	getSalaryData,
	getScheduleByPeriod,
	getScheduleByPeriodAndShopId,
	getTelegramFile,
	getTodayRangeEvotor,
	getUuidsByParentUuidList,
	isOpenStoreExists,
	replaceUuidsWithNames,
	saveFileToR2,
	saveNewIndexDocuments,
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
} from "./evotor/utils";
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

export const api = new Hono<IEnv>()

	.use("*", cors())

	.get("/api/user", (c) => {
		// console.log(c.var.user);
		return c.json(c.var.user);
	})

	// get currently logged in evo toremployee

	.get("/api/employee-name", async (c) => {
		const employeeName = await c.var.evotor.getEmployeeLastName(c.var.userId);
		// console.log("employeeName:", employeeName);

		assert(employeeName, "not an employee");
		return c.json({ employeeName });
	})

	.get("/api/by-last-name-uuid", async (c) => {
		const employeeNameAndUuid = await c.var.evotor.getEmployeesByLastName(
			c.var.user.id.toString(),
		);
		// console.log(employeeNameAndUuid);
		assert(employeeNameAndUuid, "not an employee");
		return c.json({ employeeNameAndUuid });
	})

	.get("/api/documents", async (c) => {
		const db = c.get("db");
		const shopsUuid = await c.var.evotor.getShopUuids();
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
		// const result = await createSloveneGrammarTask(c, {
		// 	topic: "спряжение глаголов",
		// 	level: "продвинутый",
		// 	count: 5,
		// });
		const result = getHoroscopeByDateTask(c, { date: "08-06-2025" });

		// console.log(employeeNameAndUuid);
		return c.json({ result });
	})

	.get("/api/employee/name-uuid", async (c) => {
		const employeeNameAndUuid =
			await c.var.evotor.getEmployeesLastNameAndUuid();
		// console.log("employeeNameAndUuid:", employeeNameAndUuid);

		assert(employeeNameAndUuid, "not an employee");
		return c.json({ employeeNameAndUuid });
	})

	.post("/api/employee/and-store/name-uuid", async (c) => {
		const data = await c.req.json();
		const { shop } = data;

		const employeeNameAndUuid = await c.var.evotor.getEmployeesByShopId(shop);
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

			const evo = c.var.evotor;
			if (!result) {
				return c.json({ error: "No schedule data found" }, 404);
			}
			const scheduleTable = await replaceUuidsWithNames(result, evo);

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

			const evo = c.var.evotor;
			if (!result) {
				return c.json({ error: "No schedule data found" }, 404);
			}
			const scheduleTable = await replaceUuidsWithNames(result, evo);

			// Возвращаем успешный ответ
			return c.json({ scheduleTable });
		} catch (error) {
			console.error("Ошибка при обработке запроса:", error);
			return c.json({ error: "Ошибка при обработке данных" }, 500);
		}
	})

	.get("/api/ai-report", async (c) => {
		console.log("AI report request received");
		const evo = c.var.evotor;

		// const shopsUuid = await c.var.evotor.getShopUuids();
		const [start, end] = getTodayRangeEvotor();

		const docs = await evo.getAllDocumentsByTypes(start, end);

		const docFiltered = await evo.extractSalesInfo(docs);
		// console.log("docs:", JSON.stringify(docFiltered, null, 2));

		const result = await analyzeDocsStaffTask(c, docFiltered);
		// console.log({ result });

		// const result = await sum2Numbers(c, { a: 1, b: 2 });
		return c.json({ result });
	})

	.get("/api/ai-association-rules", async (c) => {
		console.log("AI report request received");
		const evo = c.var.evotor;

		// const shopsUuid = await c.var.evotor.getShopUuids();
		const [start, end] = getPeriodRangeEvotor(3);
		console.log("start:", start, "end:", end);

		const docs = await evo.getAllDocumentsByTypes(start, end);

		const docFiltered = await evo.extractSalesInfo(docs);
		// console.log("docs:", JSON.stringify(docFiltered, null, 2));

		const result = await analyzeDocsStaffTask(c, docFiltered);
		// console.log({ result });

		// const result = await sum2Numbers(c, { a: 1, b: 2 });
		return c.json({ result });
	})

	.get("/api/schedules", async (c) => {
		const date = formatDate(new Date());
		const shopsUuid = await c.var.evotor.getShopUuids();
		const dataReport: Record<string, string> = {};

		for (const uuid of shopsUuid) {
			const shopName = await c.var.evotor.getShopName(uuid);
			const data = await getData(date, uuid, c.get("db"));

			if (data) {
				const date = new Date(data.dateTime);
				date.setHours(date.getHours() + 3);

				// Явное приведение типа data.userId к строке
				const userId = data.userId as string;
				const employeeName = await c.var.evotor.getEmployeeLastName(userId);
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
		const shopsNameAndUuid = await c.var.evotor.getShopNameUuids();
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
				const shopName = await c.var.evotor.getShopName(shop); // Получаем имя магазина
				const employeeName = await c.var.evotor.getEmployeeLastName(
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

		const employeeRoleEvo = await c.var.evotor.getEmployeeRole(userId);

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

		const employeeRoleEvo = await c.var.evotor.getEmployeeRole(userId);
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

	.get("/api/evotor/sales-today", async (c) => {
		const salesData = await c.var.evotor.getSalesToday();

		assert(salesData, "No sales data found");

		return c.json({ salesData });
	})

	.get("/api/evotor/sales-today-graf", async (c) => {
		const db = c.get("db"); // Получаем подключение к базе данных
		const evo = c.var.evotor;

		const shopUuids = await c.var.evotor.getShopUuids();

		const nowDate = new Date(); // Получаем текущую дату
		const sevenDaysAgo = new Date(nowDate.getTime() - 7 * 24 * 60 * 60 * 1000);

		const nowSince = formatDateWithTime(nowDate, false);
		const nowUntil = getIsoTimestamp();

		const sevenDaysSince = formatDateWithTime(sevenDaysAgo, false);
		const sevenDaysUntil = getIsoTimestamp(false, -7);

		const nowDataSales = await getSalesDataG(
			db,
			evo,
			shopUuids,
			nowSince,
			nowUntil,
		);

		const sevenDaysDataSales = await getSalesDataG(
			db,
			evo,
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

			const db = c.get("db"); // Получаем подключение к базе данных
			const newDate: Date = new Date();
			const datePlan: string = formatDate(newDate);
			let salesData: SalesData = {};

			const since = formatDateWithTime(newDate, false); // Начало дня
			const until = formatDateWithTime(newDate, true); // Конец дня

			// Создаем таблицу, если она не существует
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

			// Получение всех UUID продуктов
			const productUuids = await getUuidsByParentUuidList(db, groupIdsVape);

			// Получение плана продаж
			const plan = await getPlan(datePlan, db);
			let datPlan: Record<string, number> = {};

			if (!plan) {
				console.log("План не найден, генерируем новый...");
				datPlan = await c.var.evotor.getPlan(newDate, productUuids);
				await updatePlan(datPlan, datePlan, db);
			} else {
				datPlan = plan;
			}

			// Получение списка магазинов
			const shopUuids: string[] = await c.var.evotor.getShopUuids();
			salesData = {};

			// Сбор данных продаж для каждого магазина
			for (const shopId of shopUuids) {
				try {
					// Получение UUID продуктов для магазина
					const shopProductUuids: string[] = await getProductsByGroup(
						c.get("db"),
						shopId,
						groupIdsVape,
					);

					// Получение названия магазина
					const shopName = await c.var.evotor.getShopName(shopId);

					// Получение данных продаж и количества проданных товаров
					const [sumSalesData, podQuantity] = await Promise.all([
						c.var.evotor.getSalesSum(shopId, since, until, shopProductUuids),
						c.var.evotor.getSalesSumQuantity(
							shopId,
							since,
							until,
							shopProductUuids,
						),
					]);

					// Формирование данных для магазина
					salesData[shopName] = {
						datePlan: datPlan[shopId] || 0, // План на день
						dataSales: sumSalesData || 0, // Сумма продаж
						dataQuantity: podQuantity || {}, // Количество проданных товаров
					};
				} catch (err) {
					console.error(`Ошибка при обработке магазина ${shopId}:`, err);
				}
			}

			// Проверка на наличие данных
			if (Object.keys(salesData).length === 0) {
				throw new Error("Не удалось получить данные продаж.");
			}

			// console.log("Данные продаж успешно сформированы:", salesData);
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
		// Получаем UUID магазинов
		const shopIds: string[] = await c.var.evotor.getShopUuids();

		// Получаем группы по UUID первого магазина
		const groups = await c.var.evotor.getGroupsByNameUuid(shopIds[0]);

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
	})

	.post("/api/evotor/salary", async (c) => {
		try {
			const { employee, startDate, endDate } = await c.req.json();
			console.log("data:", await c.req.json());
			const db = c.get("db");

			const sincetDate = formatDateWithTime(new Date(startDate), false);
			const untilDate = formatDateWithTime(new Date(endDate), true);
			const dates = getIntervals(sincetDate, untilDate, "days", 1);

			const groupIdsAks = await getAllUuid(db);
			const employeeName = await c.var.evotor.getEmployeeByUuid(employee);

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
				totalBonusAccessories: 0,
				totalBonusPlan: 0,
				totalBonus: 0,
			};

			const result = [];

			for (const date_ of dates) {
				const date = new Date(date_);
				const since = formatDateWithTime(date, false);
				const until = formatDateWithTime(date, true);
				const datePlan = formatDate(date);

				const openShopUuid = await c.var.evotor.getFirstOpenSession(
					since,
					until,
					employee,
				);
				if (!openShopUuid) continue;

				const dataReport = {
					date: datePlan,
					shopName: await c.var.evotor.getShopName(openShopUuid),
					bonusAccessories: 0,
					dataPlan: 0,
					salesDataVape: 0,
					bonusPlan: 0,
					totalBonus: 0,
				};

				const salaryData = await getSalaryData(employee, datePlan, until, db);

				if (salaryData) {
					const { date, bonusAccessories, dataPlan, salesDataVape } =
						salaryData;
					const bonusPlan = salesDataVape >= dataPlan ? 450 : 0;

					Object.assign(dataReport, {
						date,
						bonusAccessories,
						dataPlan,
						salesDataVape,
						bonusPlan,
						totalBonus: bonusPlan + bonusAccessories,
					});
				} else {
					let plan = await getPlan(datePlan, db);
					if (!plan || Object.keys(plan).length === 0) {
						plan = await c.var.evotor.getPlan(date, productUuidsVape);
						await updatePlan(plan, datePlan, db);
					}

					const currentPlan = Number.isFinite(plan[openShopUuid])
						? plan[openShopUuid]
						: 0;

					// Бонусы по аксессуарам
					const productsAks = await getProductsByGroup(
						db,
						openShopUuid,
						groupIdsAks,
					);
					const salesDataAks = await c.var.evotor.getSalesSum(
						openShopUuid,
						since,
						until,
						productsAks,
					);
					const bonusAccessories = Math.floor(salesDataAks * 0.05);

					// Продажи Vape
					const productsVape = await getProductsByGroup(
						db,
						openShopUuid,
						groupIdsVape,
					);
					const salesDataVape = await c.var.evotor.getSalesSum(
						openShopUuid,
						since,
						until,
						productsVape,
					);

					const bonusPlan = salesDataVape >= currentPlan ? 450 : 0;

					Object.assign(dataReport, {
						bonusAccessories,
						dataPlan: currentPlan,
						salesDataVape,
						bonusPlan,
						totalBonus: bonusAccessories + bonusPlan,
					});
				}

				result.push(dataReport);

				// Обновление общего отчета
				totalReport.totalBonusAccessories += dataReport.bonusAccessories;
				totalReport.totalBonusPlan += dataReport.bonusPlan;
				totalReport.totalBonus += dataReport.totalBonus;
			}

			return c.json({ result, totalReport });
		} catch (error) {
			console.error("Ошибка при разборе JSON:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
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

			// Получаем UUID магазинов
			const shopIds: string[] = await c.var.evotor.getShopUuids();

			// Фильтруем ненужные UUID
			const filteredUuids = shopIds.filter(
				(uuid: string) => uuid !== "20231001-6611-407F-8068-AC44283C9196",
			);
			const groupsName = await c.var.evotor.getGroupsByName(
				filteredUuids[0],
				uuid,
			);

			// Можно добавить логику обработки данных здесь

			return c.json({ groupsName, salary, bonus });
		} catch (error) {
			console.error("Ошибка при разборе JSON:", error);
			return c.json({ message: "Ошибка обработки данных" }, 400);
		}
	})

	.post("/api/evotor/shops", async (c) => {
		// Объект для хранения сопоставления shopUuid -> shopName
		const shopOptions: Record<string, string> = {};

		// Получение списка магазинов
		const shops: ShopUuidName[] | null = await c.var.evotor.getShopNameUuids();
		if (shops) {
			// console.log(shops);
			// Добавление магазинов в shopOptions
			shops.forEach((shop) => {
				shopOptions[shop.uuid] = shop.name;
			});
		}

		assert(shopOptions, "not an shopOptions");

		return c.json({ shopOptions });
	})

	.get("/api/evotor/shops-names", async (c) => {
		// Получение списка магазинов
		const shopsName = await c.var.evotor.getShopsName();

		assert(shopsName, "not an shopOptions");

		return c.json({ shopsName });
	})

	.get("/api/evotor/sales-report", async (c) => {
		// Получаем список магазинов
		const shops = await c.var.evotor.getShops();

		const shopOptions: Record<string, string> = shops.reduce(
			(acc, shop) => {
				acc[shop.uuid] = shop.name;
				return acc;
			},
			{} as Record<string, string>,
		);

		// Получаем UUID магазинов
		const shopIds: string[] = await c.var.evotor.getShopUuids();

		// Фильтруем ненужные UUID
		const filteredUuids = shopIds.filter(
			(uuid: string) => uuid !== "20231001-6611-407F-8068-AC44283C9196",
		);

		// Получаем группы по UUID первого магазина
		const groups = await c.var.evotor.getGroupsByNameUuid(filteredUuids[0]);

		return c.json({ shopOptions, groups });
	})

	.post("/api/evotor/sales-result", async (c) => {
		try {
			const data = await c.req.json();
			const { startDate, endDate, shopUuid, groups } = data;

			const since = formatDateWithTime(new Date(startDate), false);
			const until = formatDateWithTime(new Date(endDate), true);

			const shopName = await c.var.evotor.getShopName(shopUuid);

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
		const shops = await c.var.evotor.getShops();

		const shopOptions: Record<string, string> = shops.reduce(
			(acc, shop) => {
				acc[shop.uuid] = shop.name;
				return acc;
			},
			{} as Record<string, string>,
		);
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
			const shopName = await c.var.evotor.getShopName(shopUuid);

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

			const shopName = await c.var.evotor.getShopName(shopUuid);

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
			const evo = c.var.evotor;
			const now = new Date();

			const since = formatDateWithTime(now, false);
			const until = formatDateWithTime(now, true);

			const shopUuids = await evo.getShopUuids();

			const { salesDataByShopName, grandTotalSell, grandTotalRefund } =
				await getSalesgardenReportData(db, evo, shopUuids, since, until);

			const cashOutcomeData = await getDocumentsByCashOutcomeData(
				db,
				evo,
				shopUuids,
				since,
				until,
			);

			const grandTotalCashOutcome = calculateTotalSum(cashOutcomeData);
			const cash = await evo.getCashByShops();

			return c.json({
				salesDataByShopName,
				grandTotalSell,
				grandTotalRefund,
				grandTotalCashOutcome,
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
			const data = await c.req.json(); // Разбор JSON тела

			const { startDate, endDate } = data;
			// console.log(data);

			const shopUuids = await c.var.evotor.getShopUuids();

			const sincetDate = new Date(startDate); // Преобразуем в объект Date
			const untilDate = new Date(endDate); // Преобразуем в объект Date

			const since = formatDateWithTime(sincetDate, false); // Форматируем начальную дату
			const until = formatDateWithTime(untilDate, true); // Форматируем конечную дату

			// const filteredUuids = shopUuids.filter(
			// 	(uuid: string) => uuid !== "20231001-6611-407F-8068-AC44283C9196",
			// );

			const { salesDataByShopName, grandTotalSell, grandTotaRefund } =
				await c.var.evotor.getSalesgardenReportData(shopUuids, since, until);

			const cashOutcomeData = await c.var.evotor.getDocumentsByCashOutcomeData(
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

			const cashBalanceByShop = await c.var.evotor.getCashByShops();
			const totalCashBalance = Object.values(cashBalanceByShop).reduce((s, v) => s + v, 0);

			const grandTotalCashOutcome = calculateTotalSum(cashOutcomeData);
			return c.json({
				salesDataByShopName,
				grandTotalSell,
				grandTotalRefund: grandTotaRefund,
				grandTotalCashOutcome,
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
			const shops = (await evo.getShopNameUuids()) as Array<{ uuid: string; name: string }>;
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
			const shops = (await evo.getShopNameUuids()) as Array<{ uuid: string; name: string }>;
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
			const shops = (await evo.getShopNameUuids()) as Array<{ uuid: string; name: string }>;

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

			// Get shops
			const shops = (await evo.getShopNameUuids()) as ShopUuidName[];
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

			// Get shops
			const allShopUuids = shopUuid
				? [shopUuid]
				: await evo.getShopUuids();

			// Compute KPI rows for a period
			const computeRows = async (since: string, until: string) => {
				const { salesDataByShopName, grandTotalSell, grandTotalRefund } =
					await getSalesgardenReportData(db, evo, allShopUuids, since, until);

				const cashOutcomeData = await getDocumentsByCashOutcomeData(
					db, evo, allShopUuids, since, until,
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

				const shopNames = await Promise.all(
					allShopUuids.map((uuid: string) => evo.getShopName(uuid)),
				);
				const uuidToName: Record<string, string> = {};
				allShopUuids.forEach((uuid: string, i: number) => {
					uuidToName[uuid] = shopNames[i] || uuid;
				});

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
					const shopName = uuidToName[uuid];
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
		return c.json({ sellers: [], snapshot: { totalRevenue: 0, avgDailyRev: 0, avgCheck: 0, totalShifts: 0, activeToday: 0 }, prevSnapshot: null, baselines: [], dowData: [], hypotheses: [] });
	})
	.post("/api/evotor/salesResult", async (c) => {
		try {
			const data = await c.req.json();
			const { startDate, endDate, shopUuid, groups } = data;

			const since = formatDateWithTime(new Date(startDate), false);
			const until = formatDateWithTime(new Date(endDate), true);

			// Если выбран «все магазины» — агрегируем по всем
			if (shopUuid === "all") {
				const shopUuids = await c.var.evotor.getShopUuids();
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
			const shopName = await c.var.evotor.getShopName(shopUuid);
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

			// Получаем список всех магазинов
			const allShops = await c.var.evotor.getShopUuids();
			const shopNames: Record<string, string> = {};
			for (const sid of allShops) {
				try {
					shopNames[sid] = await c.var.evotor.getShopName(sid);
				} catch {
					shopNames[sid] = sid;
				}
			}

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
			const evo = c.get("evotor");
			const drizzle = c.get("drizzle");
			const { getSettings } = await import("./db/repositories/settings.js");

			// Загружаем группы из Evotor API (все доступные)
			let groupOptions: Array<{ uuid: string; name: string }> = [];
			try {
				const shopNames = await evo.getShops();
				const firstShopId = Array.isArray(shopNames) && shopNames.length > 0
					? shopNames[0].uuid
					: "";
				if (firstShopId) {
					const groupsRaw = await evo.getGroupsByNameUuid(firstShopId);
					groupOptions = (groupsRaw as any[])?.map((g: any) => ({
						uuid: g.group_uuid || g.uuid,
						name: g.group_name || g.name,
					})) ?? [];
				}
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

			// Разрешаем UUID в имена через Evotor API
			let groupsName: string[] = [];
			try {
				const evo = c.get("evotor");
				const shopNames = await evo.getShops();
				const firstShopId = Array.isArray(shopNames) && shopNames.length > 0
					? shopNames[0].uuid
					: "";
				if (firstShopId && uuids.length > 0) {
					const groupsRaw = await evo.getGroupsByNameUuid(firstShopId);
					const nameMap = new Map((groupsRaw as any[])?.map((g: any) => [
						g.group_uuid || g.uuid,
						g.group_name || g.name,
					]) ?? []);
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
				const shopUuids = await evo.getShopUuids();
				const names = await Promise.all(
					shopUuids.map((uuid: string) => evo.getShopName(uuid))
				);
				shopNameMap = Object.fromEntries(
					shopUuids.map((uuid: string, i: number) => [uuid, names[i] || uuid])
				);
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
