import type {
	D1Database,
	D1PreparedStatement,
	R2Bucket,
} from "@cloudflare/workers-types";
import { z } from "zod";
import type { Evotor } from "./evotor";
import type {
	Document,
	IndexDocument,
	ShopQuery,
	Transaction,
} from "./evotor/types";
import type { DeadStockItem } from "./types";

export function assert(
	statement: unknown,
	message?: string,
): asserts statement {
	if (!statement) throw new Error(message);
}

export const buf2hex = (buffer: ArrayBuffer) =>
	[...new Uint8Array(buffer)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

export const isValidSign = async (
	token: string,
	payload: Record<string, string>,
) => {
	const { hash, ...data } = payload;
	const encoder = new TextEncoder();

	const k1 = await crypto.subtle.importKey(
		"raw",
		encoder.encode("WebAppData"),
		{ name: "HMAC", hash: { name: "SHA-256" } },
		false,
		["sign", "verify"],
	);

	const secret = await crypto.subtle.sign("HMAC", k1, encoder.encode(token));

	const k2 = await crypto.subtle.importKey(
		"raw",
		secret,
		{ name: "HMAC", hash: { name: "SHA-256" } },
		false,
		["sign", "verify"],
	);

	const digest = await crypto.subtle.sign(
		"HMAC",
		k2,
		encoder.encode(
			Object.entries(data)
				.sort()
				.filter((pair) => pair[1])
				.map(([k, v]) => `${k}=${v}`)
				.join("\n"),
		),
	);

	const isRecent =
		(Date.now() - Number.parseInt(data.auth_date) * 1000) / 1000 < 86400; // 86400 секунд в 24 часа

	const hashMatched = buf2hex(digest) === hash;

	return hashMatched && isRecent;
};

export function formatDateTime(date: Date): string {
	const pad = (num: number, size = 2): string =>
		String(num).padStart(size, "0"); // Функция для добавления нуля спереди

	const year: number = date.getUTCFullYear();
	const month: string = pad(date.getUTCMonth() + 1);
	const day: string = pad(date.getUTCDate());

	// Получаем время из объекта `Date`
	const hours: string = pad(date.getUTCHours());
	const minutes: string = pad(date.getUTCMinutes());
	const seconds: string = pad(date.getUTCSeconds());
	const milliseconds: string = pad(date.getUTCMilliseconds(), 3); // Три знака для миллисекунд
	const fractionalSeconds: string = `${milliseconds}000`.slice(0, 6); // Точность до 6 знаков

	// Формируем строку в нужном формате
	return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${fractionalSeconds}+00:00`;
}
export function formatDateWithTime(date: Date, isEndOfDay = false): string {
	const pad = (num: number, size = 2): string =>
		String(num).padStart(size, "0"); // Функция для добавления нуля спереди

	const year: number = date.getUTCFullYear();
	const month: string = pad(date.getUTCMonth() + 1);
	const day: string = pad(date.getUTCDate());

	// Устанавливаем время в зависимости от того, начало или конец дня
	const hours: string = pad(isEndOfDay ? 23 : 0);
	const minutes: string = pad(isEndOfDay ? 59 : 0);
	const seconds: string = pad(isEndOfDay ? 59 : 0);
	const milliseconds: string = pad(date.getUTCMilliseconds(), 3); // Получаем миллисекунды (три знака)

	// Формируем строку в нужном формате (Evotor API требует .sss+0000)
	return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}+0000`;
}

/**
 * Возвращает метку времени в формате ISO 8601 (UTC),
 * совместимом с API Evotor (например, "2025-07-26T12:34:56.123000+00:00").
 *
 * @param isEndOfDay - Если true, возвращает метку времени конца дня (23:59:59.999).
 *                     Если false (по умолчанию), используется текущее время.
 * @param dayOffset - Смещение по дням (может быть положительным или отрицательным).
 *                    Например, -1 — вчера, 0 — сегодня, 1 — завтра.
 * @returns ISO-строка метки времени с миллисекундами, дополненными до микросекунд.
 */
export function getIsoTimestamp(isEndOfDay = false, dayOffset = 0): string {
	const now = new Date();
	now.setUTCDate(now.getUTCDate() + dayOffset); // Смещаем дату

	const pad = (num: number, size = 2): string =>
		String(num).padStart(size, "0");

	const year: number = now.getUTCFullYear();
	const month: string = pad(now.getUTCMonth() + 1);
	const day: string = pad(now.getUTCDate());

	const hours: string = pad(isEndOfDay ? 23 : now.getUTCHours());
	const minutes: string = pad(isEndOfDay ? 59 : now.getUTCMinutes());
	const seconds: string = pad(isEndOfDay ? 59 : now.getUTCSeconds());
	const milliseconds: string = pad(now.getUTCMilliseconds(), 3);
	const fractionalSeconds: string = `${milliseconds}000`.slice(0, 6);

	return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${fractionalSeconds}+00:00`;
}

export function formatDate(date: Date): string {
	// console.log(date)
	const day = String(date.getDate()).padStart(2, "0"); // Добавляем ведущий ноль, если день меньше 10
	const month = String(date.getMonth() + 1).padStart(2, "0"); // Месяцы начинаются с 0, поэтому добавляем 1
	const year = date.getFullYear(); // Получаем год

	return `${day}-${month}-${year}`; // Форматируем в dd-mm-yyyy
}

/**
 * Возвращает массив дат сегодня с 03:00 до 21:00 в формате "YYYY-MM-DDTHH:mm:ss.000+0000"
 */
export function getTodayRangeEvotor(): [string, string] {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");

	const start = `${year}-${month}-${day}T03:00:00.000+0000`;
	const end = `${year}-${month}-${day}T21:00:00.000+0000`;

	return [start, end];
}

/**
 * Возвращает кортеж дат для периода: start — это 03:00 (N-1) дней назад, end — сегодня 21:00.
 * @param days - количество дней (например, 1 — только сегодня, 2 — вчера и сегодня)
 * @returns [start, end] в формате "YYYY-MM-DDTHH:mm:ss.000+0000"
 */
export function getPeriodRangeEvotor(days = 1): [string, string] {
	const now = new Date();
	const endYear = now.getFullYear();
	const endMonth = String(now.getMonth() + 1).padStart(2, "0");
	const endDay = String(now.getDate()).padStart(2, "0");
	const end = `${endYear}-${endMonth}-${endDay}T21:00:00.000+0000`;

	const startDate = new Date(now);
	startDate.setDate(startDate.getDate() - (days - 1));
	const startYear = startDate.getFullYear();
	const startMonth = String(startDate.getMonth() + 1).padStart(2, "0");
	const startDay = String(startDate.getDate()).padStart(2, "0");
	const start = `${startYear}-${startMonth}-${startDay}T03:00:00.000+0000`;

	return [start, end];
}

/**
 * Возвращает массив кортежей дат для анализа периодов.
 * @param since - Дата начала периода для прогноза (включительно).
 * @param until - Дата окончания периода для прогноза (включительно).
 * @param periods - Количество анализируемых периодов.
 * @returns Массив кортежей дат [start, end] для каждого периода.
 */
export function calculateDateRanges(
	since: string,
	until: string,
	periods: number,
): [string, string][] {
	const sinceDate = new Date(since);
	const untilDate = new Date(until);

	// Проверяем, что даты корректны
	if (Number.isNaN(sinceDate.getTime()) || Number.isNaN(untilDate.getTime())) {
		throw new Error("Неверный формат даты в параметрах.");
	}

	// Функция для вычисления даты, смещенной на `n` недель назад
	const getStartOfWeekOffset = (date: Date, weeksAgo: number): Date => {
		const result = new Date(date);
		result.setDate(result.getDate() - weeksAgo * 7);
		return result;
	};

	// Генерируем кортежи дат для каждого периода
	const ranges: [string, string][] = Array.from(
		{ length: periods },
		(_, index) => {
			const start = getStartOfWeekOffset(sinceDate, index + 1); // Начало периода
			const end = getStartOfWeekOffset(untilDate, index + 1); // Конец периода
			return [
				formatDateWithTime(start, false), // Начало дня
				formatDateWithTime(end, true), // Конец дня
			];
		},
	);

	return ranges;
}

export function getDateRangesForWeeks(
	startDate: Date,
	weekOffsets: number[],
): [string, string][] {
	const pad = (num: number, size = 2): string =>
		String(num).padStart(size, "0"); // Функция для добавления нуля спереди

	// Форматирование даты с началом и концом дня
	function formatDateWithTime(date: Date, isEndOfDay = false): string {
		const year = date.getUTCFullYear();
		const month = pad(date.getUTCMonth() + 1); // Месяцы начинаются с 0
		const day = pad(date.getUTCDate());

		const hours = pad(isEndOfDay ? 23 : 0);
		const minutes = pad(isEndOfDay ? 59 : 0);
		const seconds = pad(isEndOfDay ? 59 : 0);
		const milliseconds = pad(date.getUTCMilliseconds(), 3);
		const fractionalSeconds = `${milliseconds}000`.slice(0, 6);

		return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${fractionalSeconds}+00:00`;
	}

	// Создание массива кортежей с датами
	return weekOffsets.map((offset): [string, string] => {
		const offsetStartDate = new Date(startDate);
		const offsetEndDate = new Date(startDate);

		offsetStartDate.setUTCDate(startDate.getUTCDate() - offset); // Смещаем начальную дату на N дней назад
		offsetEndDate.setUTCDate(startDate.getUTCDate() - offset); // Смещаем конечную дату на N дней назад

		const startOfDay = formatDateWithTime(offsetStartDate, false); // Начало дня
		const endOfDay = formatDateWithTime(offsetEndDate, true); // Конец дня

		return [startOfDay, endOfDay]; // Возвращаем кортеж (начало, конец)
	});
}

/**
 * Получить интервалы дат между минимальной и максимальной датами с определенным шагом в указанных единицах измерения.
 * Возвращает список кортежей (минимальная дата, максимальная дата).
 *
 * @param minDate - дата начала периода в формате ISO (строка)
 * @param maxDate - дата окончания периода в формате ISO (строка)
 * @param unit - единица измерения интервалов ("days", "weeks", "fortnights", "months")
 * @param measure - шаг интервалов (число)
 * @returns Список кортежей [minDate, maxDate]
 */
export function generateDateRanges(
	minDate: string,
	maxDate: string,
	unit: "days" | "weeks" | "fortnights" | "months",
	measure: number,
): [string, string][] {
	const output: [string, string][] = [];
	let currentDate = new Date(minDate);
	const endDate = new Date(maxDate);

	// Функция для добавления времени в зависимости от единицы измерения
	function shiftDate(
		date: Date,
		unit: "days" | "weeks" | "fortnights" | "months",
		measure: number,
	): Date {
		const newDate = new Date(date);
		switch (unit) {
			case "days":
				newDate.setUTCDate(newDate.getUTCDate() + measure);
				break;
			case "weeks":
				newDate.setUTCDate(newDate.getUTCDate() + 7 * measure);
				break;
			case "fortnights":
				newDate.setUTCDate(newDate.getUTCDate() + 14 * measure);
				break;
			case "months":
				newDate.setUTCMonth(newDate.getUTCMonth() + measure);
				break;
			default:
				throw new Error(`Unsupported unit: ${unit}`);
		}
		return newDate;
	}

	// Форматирование даты в ISO
	function formatDate(date: Date): string {
		return date.toISOString();
	}

	// Генерация интервалов
	while (currentDate < endDate) {
		const nextDate = shiftDate(currentDate, unit, measure);
		const intervalEnd = new Date(
			Math.min(nextDate.getTime(), endDate.getTime()),
		); // Выбираем минимальную дату
		output.push([formatDate(currentDate), formatDate(intervalEnd)]); // Добавляем пару интервалов
		currentDate = nextDate; // Обновляем текущую дату
	}

	return output;
}

// Функция для получения интервалов дат
export function getIntervals(
	minDate: string | Date,
	maxDate: string | Date,
	unit: "days" | "weeks" | "fortnights" | "months",
	measure: number,
): string[] {
	const output: string[] = [];
	let currentMinDate = new Date(minDate);
	const maxDateObj = new Date(maxDate);

	// console.log(
	// 	`Starting getIntervals with minDate: ${minDate}, maxDate: ${maxDate}, unit: ${unit}, measure: ${measure}`,
	// );

	// Функция для добавления времени в зависимости от указанных единиц измерения
	function shiftDate(
		date: Date,
		unit: "days" | "weeks" | "fortnights" | "months",
		measure: number,
	): Date {
		const newDate = new Date(date);
		switch (unit) {
			case "days":
				newDate.setUTCDate(newDate.getUTCDate() + measure);
				// console.log(
				// 	`Shifted date by ${measure} days: ${newDate.toISOString()}`,
				// );
				break;
			case "weeks":
				newDate.setUTCDate(newDate.getUTCDate() + 7 * measure);
				// console.log(
				// 	`Shifted date by ${measure} weeks: ${newDate.toISOString()}`,
				// );
				break;
			case "fortnights":
				newDate.setUTCDate(newDate.getUTCDate() + 14 * measure);
				// console.log(
				// 	`Shifted date by ${measure} fortnights: ${newDate.toISOString()}`,
				// );
				break;
			case "months":
				newDate.setUTCMonth(newDate.getUTCMonth() + measure);
				// console.log(
				// 	`Shifted date by ${measure} months: ${newDate.toISOString()}`,
				// );
				break;
			default:
				console.error(`Unsupported unit: ${unit}`);
				throw new Error(`Unsupported unit: ${unit}`);
		}
		return newDate;
	}

	// Функция для форматирования даты (начало дня)
	function formatDateWithTime(date: Date): string {
		date.setUTCHours(0, 0, 0, 0); // Устанавливаем время на 00:00:00.000
		const isoString = date.toISOString(); // Преобразуем в строку формата ISO 8601
		// console.log(`Formatted date to start of day: ${isoString}`);
		return isoString;
	}

	// Основной цикл для получения интервалов
	while (currentMinDate < maxDateObj) {
		// console.log(
		// 	`Current min date before shifting: ${currentMinDate.toISOString()}`,
		// );
		const nextDate = shiftDate(currentMinDate, unit, measure);

		// Форматирование начала дня
		const startOfDay = formatDateWithTime(new Date(currentMinDate));
		output.push(startOfDay);

		// Обновляем минимальную дату для следующей итерации
		currentMinDate = nextDate;
		// console.log(
		// 	`Updated current min date for next iteration: ${currentMinDate.toISOString()}`,
		// );
	}

	// console.log(`Generated intervals: ${JSON.stringify(output)}`);
	return output;
}

type StockItem = {
	quantity: number;
	sum: number;
};

type StockData = Record<string, StockItem>;

export function sortStockData(
	stockData: StockData,
	sortBy: "quantity" | "name" | "sum",
): StockData {
	return Object.entries(stockData)
		.sort((a, b) => {
			const [nameA, dataA] = a;
			const [nameB, dataB] = b;

			if (sortBy === "quantity") {
				// Сортировка по количеству (от большего к меньшему)
				return dataB.quantity - dataA.quantity;
			}
			if (sortBy === "name") {
				// Сортировка по имени (в алфавитном порядке)
				return nameA.localeCompare(nameB);
			}
			if (sortBy === "sum") {
				// Сортировка по цене (от большего к меньшему)
				return dataB.sum - dataA.sum;
			}
			return 0; // На случай неизвестного критерия сортировки
		})
		.reduce((acc: StockData, [key, value]) => {
			acc[key.trim()] = value; // Убираем пробелы в ключах
			return acc;
		}, {} as StockData);
}

export async function createSalaryBonusTable(db: D1Database): Promise<void> {
	try {
		const createTableQuery = `
            CREATE TABLE IF NOT EXISTS salary_bonus (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			data TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			salary INTEGER NOT NULL,
			bonus INTEGER NOT NULL
		);
        `;
		await db.prepare(createTableQuery).run();
		// console.log("Таблица 'salary_bonus' успешно создана или уже существует.");
	} catch (err) {
		console.error("Ошибка при создании таблицы:", err);
	}
}

export async function saveSalaryAndBonus(
	data: string,
	salary: number,
	bonus: number,
	db: D1Database,
): Promise<void> {
	try {
		// Проверяем, существует ли запись с указанной датой
		const checkQuery = "SELECT * FROM salary_bonus WHERE data = ?;";
		const checkStatement = db.prepare(checkQuery);
		const result = await checkStatement.bind(data).first();

		// console.log("Результат проверки существующей записи:", result);

		if (result) {
			// Если запись существует, обновляем её
			const updateQuery = `
                UPDATE salary_bonus
                SET salary = ?, bonus = ?
                WHERE data = ?;
            `;
			const updateStatement = db.prepare(updateQuery);
			await updateStatement.bind(salary, bonus, data).run();
			console.log(`Запись с датой ${data} обновлена.`);
		} else {
			// Если запись не существует, добавляем новую
			const insertQuery = `
                INSERT INTO salary_bonus (data, salary, bonus)
                VALUES (?, ?, ?);
            `;
			const insertStatement = db.prepare(insertQuery);
			await insertStatement.bind(data, salary, bonus).run();
			console.log(`Новая запись с датой ${data} добавлена.`);
		}
	} catch (err) {
		console.error("Ошибка при добавлении или обновлении записи:", err);
	}
}

// Определяем тип результата запроса
interface SalaryBonus {
	salary: number;
	bonus: number;
	data: string; // Можно использовать `Date`, если в базе хранится дата
}

/// Функция для получения самой последней зарплаты и премии из таблицы salary_bonus до указанной даты
export async function getSalaryAndBonus(
	date: string,
	db: D1Database,
): Promise<SalaryBonus | null> {
	try {
		// Запрос для получения самой последней зарплаты и премии до указанной даты
		const query = `
            SELECT salary, bonus, data 
            FROM salary_bonus
            WHERE data <= ?
            ORDER BY data DESC
            LIMIT 1
        `;

		// Выполняем запрос
		const statement = db.prepare(query);
		const result = await statement.bind(date).all();

		// Проверяем, есть ли результаты в поле results
		if (result?.results && result.results.length > 0) {
			// console.log("Полученные данные:", result.results[0]);
			// Преобразуем результат к типу SalaryBonus после приведения к unknown
			return result.results[0] as unknown as SalaryBonus;
		}
		console.log("Нет записей до указанной даты.");
		return null; // Если записей нет, возвращаем null
	} catch (err) {
		console.error("Ошибка при получении зарплаты и премии:", err);
		return null; // Возвращаем null в случае ошибки
	}
}

// Функция для создания таблицы accessories, если она не существует
export async function createAccessoriesTable(db: D1Database): Promise<void> {
	try {
		const createTableQuery = `
            CREATE TABLE IF NOT EXISTS accessories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
		await db.prepare(createTableQuery).run();
		// console.log("Таблица 'accessories' успешно создана или уже существует.");
	} catch (err) {
		console.error("Ошибка при создании таблицы:", err);
	}
}

export async function saveOrUpdateUUIDs(
	uuids: string[],
	db: D1Database,
): Promise<void> {
	try {
		// Удаляем все существующие записи из таблицы accessories
		const deleteQuery = `
            DELETE FROM accessories;
        `;
		await db.prepare(deleteQuery).run();
		// console.log("Все существующие записи удалены из таблицы.");

		// Проходим по каждому UUID в массиве и вставляем его
		const insertQuery = `
            INSERT INTO accessories (uuid, created_at)
            VALUES (?, CURRENT_TIMESTAMP);
        `;
		const insertStatement = db.prepare(insertQuery);

		for (const uuid of uuids) {
			await insertStatement.bind(uuid).run();
			// console.log(`Добавлен новый UUID: ${uuid}`);
		}
	} catch (err) {
		console.error("Ошибка при сохранении UUID:", err);
	}
}

// Функция для получения всех UUID из таблицы accessories
export async function getAllUuid(db: D1Database): Promise<string[]> {
	try {
		const selectQuery = `
            SELECT uuid
            FROM accessories;
        `;

		const statement = db.prepare(selectQuery);
		const result = await statement.all();

		// Проверяем, есть ли результаты и извлекаем UUID
		if (result.success && Array.isArray(result.results)) {
			// Указываем, что результат будет массивом объектов с полем uuid
			const uuids = result.results as Array<{ uuid: string }>;
			return uuids.map((row) => row.uuid); // Извлекаем UUID из результата
		}
		console.error(
			"Не удалось получить UUID, структура результата некорректна:",
			result,
		);
		return []; // Возвращаем пустой массив в случае, если структура результата некорректна
	} catch (err) {
		console.error("Ошибка при получении UUID:", err);
		return []; // Возвращаем пустой массив в случае ошибки
	}
}

// Функция для создания таблицы plan, если она не существует
export async function createPlanTable(db: D1Database): Promise<void> {
	try {
		const createTableQuery = `
            CREATE TABLE IF NOT EXISTS plan (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                shopUuid TEXT NOT NULL,
                sum REAL NOT NULL
            );
        `;
		await db.prepare(createTableQuery).run();
		// console.log("Таблица 'plan' успешно создана или уже существует.");
	} catch (err) {
		console.error("Ошибка при создании таблицы:", err);
	}
}

interface PlanByShops {
	[shopUuid: string]: number; // Каждому shopUuid соответствует сумма
}

// Интерфейс для результата запроса
interface CheckResult {
	count: number;
}

// Функция для обновления или вставки данных в таблицу plan
export async function updatePlan(
	planByShops: PlanByShops,
	date: string,
	db: D1Database,
): Promise<void> {
	try {
		// Проверяем, есть ли запись с текущей датой
		const checkQuery = `
            SELECT COUNT(*) as count
            FROM plan
            WHERE date = ?
        `;

		const checkStatement = db.prepare(checkQuery);
		const checkResult: CheckResult | null = await checkStatement
			.bind(date)
			.first();

		// Если запись существует, обновляем данные
		if (checkResult && checkResult.count > 0) {
			const updateQuery = `
                UPDATE plan
                SET sum = ?
                WHERE date = ? AND shopUuid = ?
            `;

			const updateStatement = db.prepare(updateQuery);

			// Обновляем сумму для каждого магазина
			for (const [shopUuid, sum] of Object.entries(planByShops)) {
				await updateStatement.bind(sum, date, shopUuid).run();
			}

			// console.log(`Обновлено ${checkResult.count} записей для даты ${date}`);
		} else {
			// Если записи нет, вставляем новые данные
			const insertQuery = `
                INSERT INTO plan (date, shopUuid, sum)
                VALUES (?, ?, ?)
            `;

			const insertStatement = db.prepare(insertQuery);

			// Вставляем данные для каждого магазина
			for (const [shopUuid, sum] of Object.entries(planByShops)) {
				await insertStatement.bind(date, shopUuid, sum).run();
			}

			// console.log(
			// 	`Добавлено ${Object.keys(planByShops).length} новых записей для даты ${date}`,
			// );
		}
	} catch (err) {
		console.error("Ошибка при обновлении плана:", err);
	}
}

interface PlanItem {
	shopUuid: string;
	sum: number;
}

export async function getPlan(
	date: string,
	db: D1Database,
): Promise<Record<string, number> | null> {
	try {
		const query = `
            SELECT * 
            FROM plan
            WHERE date = ?;
        `;

		// Используем метод db.prepare для создания запроса
		const statement = db.prepare(query);
		const result = await statement.bind(date).all<PlanItem>(); // Привязываем параметр даты и выполняем запрос

		const results = result.results; // Доступ к массиву results

		if (!results || results.length === 0) {
			// console.log(`Данных для даты ${date} не найдено.`);
			return null; // Возвращаем null, если данных нет
		}

		// console.log(results); // Просматриваем результаты запроса

		const planByShops: Record<string, number> = {};
		for (const item of results) {
			planByShops[item.shopUuid] = item.sum; // Присваиваем значение sum для каждого shopUuid
		}

		// console.log(planByShops); // Посмотрите итоговое значение

		return planByShops;
	} catch (err) {
		console.error(`Ошибка при получении плана для даты ${date}:`, err);
		return null;
	}
}

/**
 * Получить название магазина из D1 (без Evotor API).
 */
export async function getShopNameFromD1(
	db: D1Database,
	shopUuid: string,
): Promise<string> {
	const row = await db.prepare(
		"SELECT name FROM shops WHERE uuid = ?"
	).bind(shopUuid).first<{ name: string }>();
	return row?.name || shopUuid;
}

/**
 * Определить, в каком магазине работал сотрудник в указанный день.
 * Ищет DOCUMENT_OPEN в index_documents с userUuid сотрудника.
 */
export async function getOpenShopFromD1(
	db: D1Database,
	employeeUuid: string,
	date: string,
): Promise<string | null> {
	// Конвертируем date из DD-MM-YYYY в YYYY-MM-DD для SQLite
	const dateISO = date.length === 10 && date[2] === '-'
		? `${date.slice(6, 10)}-${date.slice(3, 5)}-${date.slice(0, 2)}`
		: date;
	const row = await db.prepare(`
		SELECT shop_id
		FROM index_documents
		WHERE close_date >= ?1 AND close_date <= ?2
		  AND transactions LIKE ?3
		ORDER BY close_date ASC
		LIMIT 1
	`).bind(
		`${dateISO}T00:00:00`,
		`${dateISO}T23:59:59`,
		`%${employeeUuid}%`,
	).first<{ shop_id: string }>();
	return row?.shop_id || null;
}

/**
 * Получить сумму продаж (SELL - PAYBACK) из D1 для магазина за период.
 * Фильтрует по списку productUuids.
 */
export async function getSalesSumFromD1(
	db: D1Database,
	shopUuid: string,
	since: string,
	until: string,
	productUuids: string[],
): Promise<number> {
	if (productUuids.length === 0) return 0;
	const uuidSet = new Set(productUuids);

	const docs = await db.prepare(`
		SELECT type, transactions
		FROM index_documents
		WHERE shop_id = ?1
		  AND close_date >= ?2 AND close_date <= ?3
		  AND type IN ('SELL', 'PAYBACK')
	`).bind(shopUuid, since, until).all<{ type: string; transactions: string }>();

	let total = 0;
	for (const doc of docs.results ?? []) {
		let txs: any[];
		try { txs = JSON.parse(doc.transactions); } catch { continue; }
		if (!Array.isArray(txs)) continue;
		for (const tx of txs) {
			if (tx.type !== "REGISTER_POSITION") continue;
			const uuid = tx.commodityUuid || tx.commodityName;
			if (!uuid || !uuidSet.has(uuid)) continue;
			const sum = tx.sum ?? 0;
			total += doc.type === "SELL" ? sum : -sum;
		}
	}
	return Math.max(0, Math.round(total));
}

/**
 * Получить количество проданных товаров (по именам) из D1 для магазина за период.
 * Фильтрует по списку productUuids.
 */
export async function getSalesQuantityFromD1(
	db: D1Database,
	shopUuid: string,
	since: string,
	until: string,
	productUuids: string[],
): Promise<Record<string, number>> {
	const qty: Record<string, number> = {};
	if (productUuids.length === 0) return qty;
	const uuidSet = new Set(productUuids);

	const docs = await db.prepare(`
		SELECT type, transactions
		FROM index_documents
		WHERE shop_id = ?1
		  AND close_date >= ?2 AND close_date <= ?3
		  AND type IN ('SELL', 'PAYBACK')
	`).bind(shopUuid, since, until).all<{ type: string; transactions: string }>();

	for (const doc of docs.results ?? []) {
		let txs: any[];
		try { txs = JSON.parse(doc.transactions); } catch { continue; }
		if (!Array.isArray(txs)) continue;
		for (const tx of txs) {
			if (tx.type !== "REGISTER_POSITION") continue;
			const uuid = tx.commodityUuid || tx.commodityName;
			if (!uuid || !uuidSet.has(uuid)) continue;
			const name = tx.commodityName || tx.name || uuid;
			const count = (tx.quantity ?? tx.count ?? 1);
			qty[name] = (qty[name] || 0) + (doc.type === "SELL" ? count : -count);
		}
	}
	// Убираем отрицательные и нулевые
	for (const k of Object.keys(qty)) {
		if (qty[k] <= 0) delete qty[k];
	}
	return qty;
}

/**
 * Вычисляет план на основе РЕАЛЬНЫХ продаж ВЕЙПОВ из index_documents.
 *
 * Алгоритм:
 * 1. Берём 4 прошлых таких же дня недели (пн→пн, вт→вт...)
 * 2. Для каждого дня суммируем SELL - PAYBACK только по вейп-UUID
 * 3. Среднее = сумма 4 дней / 4
 * 4. План = среднее + 5%
 * 5. Минимум плана = 5200 ₽
 */
export async function getAveragePlan(
	db: D1Database,
	shopUuid: string,
	date: string,
	productUuids: string[],
): Promise<number> {
	try {
		// Конвертируем date из DD-MM-YYYY в YYYY-MM-DD для SQLite
		const dateISO = date.length === 10 && date[2] === '-'
			? `${date.slice(6, 10)}-${date.slice(3, 5)}-${date.slice(0, 2)}`
			: date;

		const uuidSet = new Set(productUuids);

		/**
		 * Суммирует только вейп-позиции из массива транзакций.
		 */
		const sumVapePositions = (txs: any[]): number => {
			let sum = 0;
			for (const tx of txs) {
				if (tx.type !== 'REGISTER_POSITION') continue;
				const uuid = tx.commodityUuid || tx.commodityName;
				if (!uuid || !uuidSet.has(uuid)) continue;
				sum += tx.sum ?? 0;
			}
			return sum;
		};

		// Ищем документы за такие же дни недели
		const query = `
			SELECT close_date, type, transactions
			FROM index_documents
			WHERE shop_id = ?1
			  AND close_date < ?2
			  AND CAST(strftime('%w', substr(close_date, 1, 10)) AS INTEGER) = CAST(strftime('%w', ?2) AS INTEGER)
			  AND type IN ('SELL', 'PAYBACK')
			ORDER BY close_date DESC
		`;
		const result = await db.prepare(query).bind(shopUuid, dateISO).all<{
			close_date: string;
			type: string;
			transactions: string;
		}>();
		const docs = result.results ?? [];

		// Группируем по дням: день → net (SELL - PAYBACK) только по вейпам
		const dailyNet = new Map<string, number>();
		for (const doc of docs) {
			// Берём ровно 4 разных дня
			if (dailyNet.size >= 4 && !dailyNet.has(doc.close_date.slice(0, 10))) break;
			const day = doc.close_date.slice(0, 10);
			let txs: any[];
			try { txs = JSON.parse(doc.transactions); } catch { continue; }
			if (!Array.isArray(txs)) continue;
			const daySum = sumVapePositions(txs);
			const current = dailyNet.get(day) ?? 0;
			dailyNet.set(day, doc.type === 'SELL' ? current + daySum : current - daySum);
		}

		const values = [...dailyNet.values()].filter(v => v > 0);

		if (values.length >= 2) {
			// Делим на количество найденных дней (до 4)
			const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
			let plan = Math.round(avg * 1.05);
			if (plan < 5200) plan = 5200;
			console.log(`[getAveragePlan] shop=${shopUuid} date=${date}: ${values.length} таких же дней недели, средние продажи = ${avg}, план (+5%) = ${plan}`);
			return plan;
		}

		// Fallback: любые последние дни (до 4), фильтруем по вейпам
		console.warn(`[getAveragePlan] недостаточно данных за тот же день недели (найдено ${values.length}), берём любые последние дни`);
		const fbQuery = `
			SELECT close_date, type, transactions
			FROM index_documents
			WHERE shop_id = ?1
			  AND close_date < ?2
			  AND type IN ('SELL', 'PAYBACK')
			ORDER BY close_date DESC
		`;
		const fbResult = await db.prepare(fbQuery).bind(shopUuid, dateISO).all<{
			close_date: string;
			type: string;
			transactions: string;
		}>();
		const fbDocs = fbResult.results ?? [];

		const fbDailyNet = new Map<string, number>();
		for (const doc of fbDocs) {
			if (fbDailyNet.size >= 4) break;
			const day = doc.close_date.slice(0, 10);
			if (fbDailyNet.has(day)) continue;
			let txs: any[];
			try { txs = JSON.parse(doc.transactions); } catch { continue; }
			if (!Array.isArray(txs)) continue;
			const daySum = sumVapePositions(txs);
			fbDailyNet.set(day, doc.type === 'SELL' ? daySum : -daySum);
		}

		const fbValues = [...fbDailyNet.values()].filter(v => v > 0);
		if (fbValues.length === 0) {
			console.warn(`[getAveragePlan] shop=${shopUuid} date=${date}: нет исторических продаж вейпов — план = 5200`);
			return 5200;
		}

		const avg = Math.round(fbValues.reduce((s, v) => s + v, 0) / fbValues.length);
		let plan = Math.round(avg * 1.05);
		if (plan < 5200) plan = 5200;
		console.log(`[getAveragePlan] shop=${shopUuid} date=${date}: fallback — ${fbValues.length} любых дней, средние продажи = ${avg}, план (+5%) = ${plan}`);
		return plan;
	} catch (err) {
		console.error("getAveragePlan error:", err);
		return 5200;
	}
}

export const groupIdsVape: string[] = [
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

type SalesData = Record<string, number>;

export function sortSalesData(
	salesData: SalesData,
	sortBy: "v" | "k",
): SalesData {
	return Object.entries(salesData)
		.sort((a, b) => {
			if (sortBy === "v") {
				// Сортировка по значению, от большего к меньшему
				return b[1] - a[1];
			}
			// Сортировка по ключу (алфавитный порядок)
			return a[0].localeCompare(b[0]);
		})
		.reduce((acc: SalesData, [key, value]) => {
			acc[key.trim()] = value; // Убираем пробелы в ключах
			return acc;
		}, {} as SalesData);
}

type SalesSummary = Record<string, { quantity: number; sum: number }>;

export function sortSalesSummary(
	salesSummary: SalesSummary,
	sortBy: "quantity" | "sum" | "name",
): SalesSummary {
	return Object.entries(salesSummary)
		.sort((a, b) => {
			const [keyA, valueA] = a;
			const [keyB, valueB] = b;

			if (sortBy === "quantity") {
				// Сортировка по количеству (quantity), от большего к меньшему
				return valueB.quantity - valueA.quantity;
			}
			if (sortBy === "sum") {
				// Сортировка по сумме (sum), от большего к меньшему
				return valueB.sum - valueA.sum;
			}
			// Сортировка по ключу (названию продукта) в алфавитном порядке
			return keyA.localeCompare(keyB);
		})
		.reduce((acc: SalesSummary, [key, value]) => {
			acc[key.trim()] = value; // Убираем пробелы в ключах
			return acc;
		}, {} as SalesSummary);
}

export async function getUuidsByParentUuidList(
	db: D1Database,
	parentUuids: string[],
): Promise<string[]> {
	try {
		// Создаем строку параметров для списка parentUuid
		const placeholders = parentUuids.map(() => "?").join(", ");

		// SQL-запрос для выборки UUID, где parentUuid находится в указанном списке
		const query = `
            SELECT uuid
            FROM products
            WHERE parentUuid IN (${placeholders});
        `;
		const statement = db.prepare(query);
		const result = await statement.bind(...parentUuids).all<{ uuid: string }>();

		// Извлекаем UUID из результата
		const uuids = result.results?.map((row) => row.uuid) || [];
		// console.log('UUIDs успешно получены:', uuids);
		return uuids;
	} catch (err) {
		console.error("Ошибка при получении UUIDs:", err);
		throw err;
	}
}

// Функция для создания таблицы salaryData, если она не существует
export async function createSalaryTable(db: D1Database): Promise<void> {
	try {
		// SQL-запрос для создания таблицы
		const createTableQuery = `
            CREATE TABLE IF NOT EXISTS salaryData (
                id INTEGER PRIMARY KEY AUTOINCREMENT, 
                date TEXT NOT NULL,                  
                shopUuid TEXT NOT NULL,              
                employeeUuid TEXT NOT NULL,          
                bonusAccessories INTEGER NOT NULL,   
                dataPlan INTEGER NOT NULL,           
                salesDataVape INTEGER NOT NULL,      
                bonusPlan INTEGER NOT NULL,          
                totalBonus INTEGER NOT NULL          
            );
        `;
		// Выполнение SQL-запроса для создания таблицы
		await db.prepare(createTableQuery).run();
		// console.log("Таблица 'salaryData' успешно создана или уже существует.");
	} catch (err) {
		// Логирование ошибки при создании таблицы
		console.error("Ошибка при создании таблицы:", err);
	}
}

// Функция для сохранения данных отчета в таблицу salaryData
export async function saveSalaryData(
	db: D1Database,
	dataReport: Record<string, any>,
): Promise<void> {
	try {
		// SQL-запрос для проверки существования записи с заданной датой и shopUuid
		const checkQuery = `
            SELECT 1 FROM salaryData
            WHERE date = ? AND shopUuid = ?;
        `;

		// Выполняем запрос для проверки
		const existingRecord = await db
			.prepare(checkQuery)
			.bind(dataReport.date, dataReport.shopUuid)
			.first();

		// Если запись существует, пропускаем вставку
		if (existingRecord) {
			// console.log(
			// 	`Запись с датой '${dataReport.date}' и shopUuid '${dataReport.shopUuid}' уже существует. Пропуск записи.`,
			// );
			return;
		}

		// SQL-запрос для вставки данных в таблицу
		const insertQuery = `
            INSERT INTO salaryData (
                date,
                shopUuid,
                employeeUuid,
                bonusAccessories,
                dataPlan,
                salesDataVape,
                bonusPlan,
                totalBonus
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        `;

		// Выполнение SQL-запроса с параметрами из объекта dataReport
		await db
			.prepare(insertQuery)
			.bind(
				dataReport.date,
				dataReport.shopUuid,
				dataReport.employeeUuid,
				dataReport.bonusAccessories,
				dataReport.dataPlan,
				dataReport.salesDataVape,
				dataReport.bonusPlan,
				dataReport.totalBonus,
			)
			.run();

		// console.log("Данные успешно сохранены в таблицу 'salaryData'.");
	} catch (err) {
		// Логирование ошибки при сохранении данных
		console.error("Ошибка при сохранении данных в таблицу:", err);
	}
}

// Функция для получения данных о зарплате по UUID сотрудника и дате
export async function getSalaryData(
	employeeUuid: string,
	date: string,
	shopUuid: string,
	db: D1Database,
): Promise<Record<string, any> | null> {
	// Кеш отключён — всегда делаем свежий расчёт
	return null;
}

type Data = Record<string, Record<string, number>>;

export function calculateTotalSum(data: Data): number {
	let totalSum = 0;

	// Итерация по каждому магазину
	for (const shopName in data) {
		const shopData = data[shopName];

		for (const category in shopData) {
			totalSum += shopData[category];
		}
	}

	const roundedSum = totalSum.toFixed(2);

	if (Number.parseFloat(roundedSum) % 1 === 0) {
		return Number.parseInt(roundedSum, 10);
	}

	return Number.parseFloat(roundedSum);
}

export interface OpenShopRecord {
	id: number; // Уникальный идентификатор записи
	date: string; // Дата открытия магазина
	location_lat: number | null; // Широта (может быть null)
	location_lon: number | null; // Долгота (может быть null)
	photoCashRegisterPhoto: string | null; // Фото кассового аппарата (может быть null)
	photoСabinetsPhoto: string | null; // Фото кабинетов (может быть null)
	photoShowcasePhoto1: string | null; // Фото витрины 1 (может быть null)
	photoShowcasePhoto2: string | null; // Фото витрины 2 (может быть null)
	photoShowcasePhoto3: string | null; // Фото витрины 3 (может быть null)
	photoTerritory1: string | null; // Фото территории 1 (может быть null)
	photoTerritory2: string | null; // Фото территории 2 (может быть null)
	countingMoney: number | null; // Сумма подсчитанных денег (может быть null)
	CountingMoneyMessage: string | null; // Сообщение о подсчете денег (может быть null)
	userId: string; // Идентификатор пользователя
	shopUuid: string; // UUID магазина
	dateTime: string; // Дата и время события
}

export async function getData(
	date: string,
	shopUuid: string,
	db: D1Database,
): Promise<OpenShopRecord | null> {
	try {
		// console.log(
		// 	`Начало извлечения данных для даты: ${date} и магазина: ${shopUuid}`,
		// );

		const query = `
		SELECT * 
		FROM openShops
		WHERE date = ? AND shopUuid = ?;
	  `;
		const statement = db.prepare(query);
		const result = await statement.bind(date, shopUuid).first();

		if (result) {
			// console.log(
			// 	`Данные успешно извлечены для даты: ${date} и магазина: ${shopUuid}`,
			// );
			return result as unknown as OpenShopRecord; // Приведение типа
		}
		// console.log(
		// 	`Запись не найдена для даты: ${date} и магазина: ${shopUuid}`,
		// );
		return null;
	} catch (err) {
		console.error(
			`Ошибка при извлечении данных для даты ${date} и магазина ${shopUuid}: ${err}`,
		);
		return null;
	}
}

interface TelegramFileResponse {
	ok: boolean;
	result: {
		file_id: string;
		file_unique_id: string;
		file_size: number;
		file_path: string;
	};
	description?: string;
}

export async function getTelegramFile(
	fileId: string,
	TELEGRAM_BOT_TOKEN: string,
) {
	try {
		const response = await fetch(
			`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`,
		);

		const data = (await response.json()) as TelegramFileResponse;

		if (!data.ok) {
			throw new Error(
				data.description || "Не удалось получить информацию о файле.",
			);
		}

		const filePath = data.result.file_path;
		const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;

		return fileUrl;
	} catch (err) {
		console.error("Ошибка при запросе к Telegram API:", err);
		throw err;
	}
}

export async function getTelegramFileUpl(
	fileId: string,
	TELEGRAM_BOT_TOKEN: string,
) {
	try {
		const response = await fetch(
			`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`,
		);

		const data = (await response.json()) as TelegramFileResponse;

		if (!data.ok || !data.result) {
			throw new Error(
				data.description || "Не удалось получить информацию о файле.",
			);
		}

		return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
	} catch (err) {
		console.error("Ошибка при запросе к Telegram API:", err);
		throw err;
	}
}

// import FormData from "form-data";

// export async function sendToTelegram(
// 	fileContent: Blob | Buffer,
// 	botToken: string,
// 	chatId: string,
// ) {
// 	const formData = new FormData();

// 	// Создаем File-like объект
// 	const file = new File([fileContent], "report.png", {
// 		type: "image/png",
// 		lastModified: Date.now(),
// 	});

// 	formData.append("chat_id", chatId);
// 	formData.append("document", file);

// 	try {
// 		const response = await fetch(
// 			`https://api.telegram.org/bot${botToken}/sendDocument`,
// 			{
// 				method: "POST",
// 				body: formData,
// 			},
// 		);

// 		if (!response.ok) {
// 			const errorText = await response.text();
// 			throw new Error(`Telegram API error: ${errorText}`);
// 		}

// 		return await response.json();
// 	} catch (err) {
// 		console.error("Ошибка отправки в Telegram:", err);
// 		throw err;
// 	}
// }

export async function getSalesDataByDate(
	date: string,
	db: D1Database,
): Promise<Record<
	string,
	{ datePlan: number; dataSales: number; dataQuantity: Record<string, number> }
> | null> {
	try {
		// SQL-запрос для получения всех записей для заданной даты
		const query = `
		SELECT * 
		FROM SaleByPlan
		WHERE date = ?;
		`;

		// Выполнение запроса
		const result = await db.prepare(query).bind(date).all();

		// Проверка наличия результатов
		const rows = result.results; // Доступ к результатам запроса

		if (!rows || rows.length === 0) {
			// console.log(`Данных для даты ${date} не найдено.`);
			return null;
		}

		// Формирование результата
		const salesDataByShops: Record<
			string,
			{
				datePlan: number;
				dataSales: number;
				dataQuantity: Record<string, number>;
			}
		> = {};

		for (const item of rows) {
			// Проверяем существование shopName и dataQuantity
			const shopName = item.shopName as string; // Название магазина
			const dataQuantity = JSON.parse(item.dataQuantity as string); // Преобразование строки JSON в объект

			// Убедимся, что данные корректные
			if (!shopName || !dataQuantity) {
				console.warn("Некорректные данные в записи:", item);
				continue;
			}

			// Сохраняем данные в объекте
			salesDataByShops[shopName] = {
				datePlan: item.datePlan as number,
				dataSales: item.dataSales as number,
				dataQuantity,
			};
		}

		// console.log(`Данные для даты ${date} успешно получены:`, salesDataByShops);
		return salesDataByShops;
	} catch (err) {
		console.error(`Ошибка при получении данных для даты ${date}:`, err);
		return null;
	}
}

export async function createProductsTableIfNotExists(db: D1Database) {
	try {
		// console.log("Начало создания таблицы shop");

		const createTableSQL = `
            CREATE TABLE IF NOT EXISTS shopProduct (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                shopId TEXT NOT NULL,
                uuid TEXT NOT NULL,
                product_group INTEGER NOT NULL,
                parentUuid TEXT,
                name TEXT
            );
        `;

		await db.prepare(createTableSQL).run();

		// // Создаем индекс для shopId
		await db
			.prepare(
				`
		    CREATE INDEX IF NOT EXISTS idx_shopProduct_shopId
		    ON shopProduct (shopId)
		`,
			)
			.run();

		// Создаем индекс для uuid
		await db
			.prepare(
				`
		    CREATE INDEX IF NOT EXISTS idx_shopProduct_uuid
		    ON shopProduct (uuid)
		`,
			)
			.run();

		// console.log("Таблица 'shopProduct' и индексы успешно созданы");
	} catch (error) {
		console.error("Ошибка при создании таблицы или индексов:", error);
	}
}

export async function updateOrInsertData(
	data: {
		uuid: string;
		group: boolean;
		parentUuid: string;
		shopId: string;
		name: string;
	}[],
	db: D1Database,
): Promise<void> {
	try {
		console.log("Запуск операции по вставке данных...");

		// Подготовка запроса на вставку данных с условием
		const insertQuery = `
            INSERT INTO shopProduct (uuid, product_group, parentUuid, shopId, name)
            SELECT ?1, ?2, ?3, ?4, ?5
            WHERE NOT EXISTS (
                SELECT 1 
                FROM shopProduct 
                WHERE shopId = ?4 AND uuid = ?1
            );
        `;

		console.log("Запрос на вставку данных подготовлен.");

		const statement = db.prepare(insertQuery);

		// Создание массива с данными для вставки
		console.log("Создаём массив с данными для вставки...");
		const batch = data.map((item) =>
			statement.bind(
				item.uuid,
				item.group ? 1 : 0,
				item.parentUuid,
				item.shopId,
				item.name,
			),
		);

		console.log(`Обрабатываем пакет данных. Всего записей: ${data.length}`);

		// Выполняем все запросы в одном пакете
		await db.batch(batch);

		console.log(`Успешно обработано ${data.length} записей.`);
	} catch (err) {
		console.error("Ошибка при вставке данных:", err);

		if (err instanceof Error) {
			console.error("Детали ошибки:", err.message);
			console.error("Стек вызовов:", err.stack);
		} else {
			console.error("Неизвестная ошибка:", err);
		}

		throw err;
	}
}

export async function getGroupsByNameUuid(
	db: D1Database,
	shopId: string,
): Promise<{ name: string; uuid: string }[] | null> {
	try {
		// console.log(`Получение групп продуктов для магазина с ID: ${shopId}...`);

		// SQL-запрос для выборки только групп продуктов
		const query = `
			SELECT name, uuid 
			FROM shopProduct 
			WHERE shopId = ?1 AND product_group = 1;
		`;

		const result = await db.prepare(query).bind(shopId).all();

		// Проверяем, есть ли данные в результате
		if (!result || !result.results || result.results.length === 0) {
			console.log(`Группы продуктов для магазина ${shopId} не найдены.`);
			return null;
		}

		// console.log(`Найдено ${result.results.length} групп продуктов.`);
		return result.results as { name: string; uuid: string }[];
	} catch (err) {
		console.error(
			`Ошибка при получении групп продуктов для магазина ${shopId}:`,
			err,
		);
		return null;
	}
}

export async function getProductsByGroup(
	db: D1Database,
	shopId: string,
	groupIds: string[],
): Promise<string[]> {
	try {
		// console.log(
		// 	`Получение продуктов для магазина ${shopId}, относящихся к группам: ${groupIds.join(", ")}...`,
		// );

		if (groupIds.length === 0) {
			console.log("Список групп пуст, возвращаем пустой массив.");
			return [];
		}

		// SQL-запрос для получения UUID продуктов, относящихся к указанным группам
		const query = `
			SELECT uuid 
			FROM shopProduct 
			WHERE shopId = ?1 AND parentUuid IN (${groupIds.map(() => "?").join(", ")});
		`;

		const result = await db
			.prepare(query)
			.bind(shopId, ...groupIds)
			.all();

		// Проверяем, есть ли данные в результате
		if (!result || !result.results || result.results.length === 0) {
			console.log(`Продукты для магазина ${shopId} не найдены.`);
			return [];
		}

		// console.log(`Найдено ${result.results.length} продуктов.`);

		// Приводим `result.results` к нужному типу и извлекаем UUID
		return (result.results as { uuid: string }[]).map((row) => row.uuid);
	} catch (err) {
		console.error(
			`Ошибка при получении продуктов по группам для магазина ${shopId}:`,
			err,
		);
		throw err;
	}
}

interface ScheduleDay {
	date: string;
	employee: string;
}

interface StoreSchedule {
	[storeId: string]: ScheduleDay[];
}

interface TransformedSchedule {
	id?: number; // Уникальный идентификатор записи (опционально)
	shopUuid: string; // UUID магазина
	employeeUuid: string; // UUID сотрудника
	date: string; // Дата в формате YYYY-MM-DD
	shiftType: string; // Тип смены (например, "1", "выходной")
}

export function transformScheduleData(
	year: number,
	month: number,
	inputData: StoreSchedule, // Правильный тип!
): TransformedSchedule[] {
	const result: Array<{
		shopUuid: string;
		employeeUuid: string;
		date: string;
		shiftType: string;
	}> = [];

	// Проверка года и месяца
	if (
		typeof year !== "number" ||
		typeof month !== "number" ||
		month < 1 ||
		month > 12
	) {
		throw new Error("Invalid year or month");
	}

	// Перебор магазинов
	for (const storeId of Object.keys(inputData)) {
		const days = inputData[storeId];

		// Фильтрация дней с сотрудниками
		for (const day of days) {
			// if (!day.employee?.trim()) continue;

			result.push({
				shopUuid: storeId,
				employeeUuid: day.employee,
				date: `${year}-${month.toString().padStart(2, "0")}-${day.date.padStart(2, "0")}`,
				shiftType: "1", // или динамическое значение из данных
			});
		}
	}

	return result;
}

export function transformScheduleDataD(
	inputData: StoreSchedule, // Правильный тип!
): TransformedSchedule[] {
	const result: TransformedSchedule[] = [];

	// Перебираем магазины
	for (const storeId of Object.keys(inputData)) {
		const days = inputData[storeId];

		// Перебираем дни для каждого магазина
		for (const day of days) {
			// Если поле employee пустое, пропускаем запись
			// if (!day.employee?.trim()) continue;

			// Добавляем запись в результат
			result.push({
				shopUuid: storeId,
				employeeUuid: day.employee,
				date: day.date, // Дата уже в формате YYYY-MM-DD
				shiftType: "1", // Тип смены (можно заменить на динамическое значение)
			});
		}
	}

	return result;
}

export async function createScheduleTable(db: D1Database): Promise<void> {
	try {
		const createTableSQL = `
            CREATE TABLE IF NOT EXISTS schedule (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                shopUuid TEXT NOT NULL,
                employeeUuid TEXT NULL,
                date TEXT NOT NULL,
                shiftType TEXT NULL
            );
        `;
		await db.prepare(createTableSQL).run();

		// Создаем индекс для shopUuid
		await db
			.prepare(
				`
		        CREATE INDEX IF NOT EXISTS idx_schedule_shopUuid
		        ON schedule (shopUuid)
		        `,
			)
			.run();

		// Создаем индекс для date
		await db
			.prepare(
				`
		        CREATE INDEX IF NOT EXISTS idx_schedule_date
		        ON schedule (date)
		        `,
			)
			.run();

		console.log("Таблица 'schedule' успешно создана или уже существует.");
	} catch (err) {
		console.error("Ошибка при создании таблицы 'schedule':", err);
	}
}

export async function deleteScheduleTable(db: D1Database): Promise<void> {
	try {
		const deleteQuery = `
            DROP TABLE IF EXISTS schedule;
        `;
		await db.prepare(deleteQuery).run();
		console.log("Таблица 'schedule' успешно удалена.");
	} catch (err) {
		console.error("Ошибка при удалении таблицы 'schedule':", err);
	}
}

export async function updateSchedule(
	db: D1Database,
	schedules: TransformedSchedule[],
): Promise<void> {
	try {
		// SQL-запрос для проверки существования записи
		const checkQuery = `
            SELECT id 
            FROM schedule
            WHERE shopUuid = ? AND date = ?;
        `;

		// SQL-запрос для обновления записи
		const updateQuery = `
            UPDATE schedule
            SET employeeUuid = ?, shiftType = ?
            WHERE shopUuid = ? AND date = ?;
        `;

		// SQL-запрос для вставки новой записи
		const insertQuery = `
            INSERT INTO schedule (shopUuid, employeeUuid, date, shiftType)
            VALUES (?, ?, ?, ?);
        `;

		for (const schedule of schedules) {
			// Проверяем, существует ли запись с указанными shopUuid и date
			const checkStatement = db.prepare(checkQuery);
			const existingRecord = await checkStatement
				.bind(schedule.shopUuid, schedule.date)
				.first();

			if (existingRecord) {
				// Если запись существует, обновляем её
				const updateStatement = db.prepare(updateQuery);
				await updateStatement
					.bind(
						schedule.employeeUuid,
						schedule.shiftType,
						schedule.shopUuid,
						schedule.date,
					)
					.run();
			} else {
				// Если записи нет, вставляем новую
				const insertStatement = db.prepare(insertQuery);
				await insertStatement
					.bind(
						schedule.shopUuid,
						schedule.employeeUuid,
						schedule.date,
						schedule.shiftType,
					)
					.run();
			}
		}

		console.log("Расписание успешно обновлено.");
	} catch (err) {
		console.error("Ошибка при обновлении расписания:", err);
	}
}

export async function getScheduleByPeriodAndShopId(
	db: D1Database,
	dateStart: string,
	dateEnd: string,
	shopUuid: string,
): Promise<TransformedSchedule[] | null> {
	try {
		console.log("Параметры запроса:", { dateStart, dateEnd, shopUuid });

		const query = `
            SELECT * 
            FROM schedule
            WHERE date BETWEEN ?1 AND ?2 AND shopUuid = ?3;
        `;

		const result = await db
			.prepare(query)
			.bind(dateStart, dateEnd, shopUuid)
			.all();

		if (result.results && result.results.length > 0) {
			return result.results as unknown as TransformedSchedule[];
		}
		console.log(
			`Данные не найдены для периода с ${dateStart} по ${dateEnd} и магазина ${shopUuid}`,
		);
		return null;
	} catch (err) {
		console.error(
			`Ошибка при получении расписания за период с ${dateStart} по ${dateEnd} и магазина ${shopUuid}:`,
			err instanceof Error ? err.message : err,
		);
		throw err;
	}
}

export async function getSchedule(
	db: D1Database,
	date: string,
	shopUuid: string,
): Promise<TransformedSchedule[] | null> {
	try {
		console.log("Параметры запроса:", { date, shopUuid });

		const query = `
      SELECT * 
      FROM schedule
      WHERE date = ?1 AND shopUuid = ?2;
    `;

		const result = await db.prepare(query).bind(date, shopUuid).all();

		if (result.results && result.results.length > 0) {
			return result.results as unknown as TransformedSchedule[];
		}
		console.log(`Данные не найдены для ${date} и магазина ${shopUuid}`);
		return null;
	} catch (err) {
		console.error(
			`Ошибка при получении расписания (${date}, ${shopUuid}):`,
			err instanceof Error ? err.message : err,
		);
		throw err;
	}
}

export async function getScheduleByPeriod(
	db: D1Database,
	dateStart: string,
	dateEnd: string,
): Promise<TransformedSchedule[] | null> {
	try {
		console.log("Параметры запроса:", { dateStart, dateEnd });

		const query = `
            SELECT * 
            FROM schedule
            WHERE date BETWEEN ?1 AND ?2;
        `;

		const result = await db.prepare(query).bind(dateStart, dateEnd).all();

		if (result.results && result.results.length > 0) {
			return result.results as unknown as TransformedSchedule[];
		}
		console.log(`Данные не найдены для периода с ${dateStart} по ${dateEnd}`);
		return null;
	} catch (err) {
		console.error(
			`Ошибка при получении расписания за период с ${dateStart} по ${dateEnd}:`,
			err instanceof Error ? err.message : err,
		);
		throw err;
	}
}

export async function replaceUuidsWithNamesDB(
	data: TransformedSchedule[],
  db: D1Database,
): Promise<
	Array<{
		id: number;
		shopName: string;
		employeeName: string;
		date: string;
		shiftType: string;
	}>
> {
	// Кэш для хранения уже полученных имён
	const shopNameCache: Record<string, string> = {};
	const employeeNameCache: Record<string, string> = {};

	// Преобразуем данные
	const result = await Promise.all(
		data.map(async (item) => {
			// Получаем имя магазина из кэша или через запрос
      const shopUuid = item.shopUuid;
      let shopName = shopNameCache[shopUuid];
			if (!shopName) {
        shopName = (await db.prepare("SELECT name FROM shops WHERE uuid = ?").bind(shopUuid).first<{ name: string }>())?.name ?? "Неизвестный магазин";
        shopNameCache[shopUuid] = shopName;
			}

      // Получаем имя сотрудника из кэша или через запрос (D1)
      const employeeUuid = item.employeeUuid;
      let employeeName = employeeNameCache[employeeUuid];
      if (!employeeName) {
        employeeName = (await db.prepare("SELECT name FROM employees WHERE uuid = ?").bind(employeeUuid).first<{ name: string }>())?.name ?? "Неизвестный сотрудник";
        employeeNameCache[employeeUuid] = employeeName;
      }
      
			// Возвращаем преобразованный объект
			return {
				id: item.id ?? 0, // Устанавливаем значение по умолчанию для id
				shopName,
				employeeName,
				date: item.date,
				shiftType: item.shiftType,
			};
		}),
	);

	return result;
}

export function getMonthStartAndEnd(
	year: number,
	month: number,
): { start: string; end: string } {
	// Создаём даты в UTC, чтобы избежать смещения из-за локального времени
	const startDate = new Date(Date.UTC(year, month - 1, 1));
	console.log("startDate", startDate);
	const endDate = new Date(Date.UTC(year, month, 0));
	console.log("endDate", endDate);

	// Форматируем даты вручную в формате ДД.ММ.ГГГГ
	const format = (d: Date) =>
		`${d.getUTCDate().toString().padStart(2, "0")}.${(d.getUTCMonth() + 1)
			.toString()
			.padStart(2, "0")}.${d.getUTCFullYear()}`;

	return {
		start: format(startDate),
		end: format(endDate),
	};
}

interface FullDocument extends Document {
	transactions: Transaction[];
}

export function expandDocuments(documents: any[]): FullDocument[] {
	return documents.map((doc) => {
		return {
			...doc,
			transactions: doc.transactions.map((t: any) => ({ ...t })),
		};
	});
}

/**
 * Подготовка документов для анализа AI
 * @param documents Массив документов из Эвотора
 * @returns Массив с упрощёнными данными, готовыми к анализу
 */
export function prepareDocumentsForAI(documents: Document[]): any[] {
	return documents.map((doc) => ({
		type: doc.type,
		number: doc.number,
		closeDate: doc.closeDate,
		storeId: doc.store_id,
		sessionNumber: doc.session_number,
		transactions: doc.transactions.map((t: Transaction) => ({
			type: t.type,
			paymentType: t.paymentType,
			sum: t.sum,
			price: t.price,
			quantity: t.quantity,
			commodityName: t.commodityName,
			closeDate: t.closeDate,
		})),
	}));
}

/**
 * Формирует текстовую сводку по заказам для LLM анализа
 * @param simplifiedDocs Результат prepareDocumentsForAI
 * @returns Готовый промт для AI анализа
 */

export function generateStoreAnalysisPrompt(
	simplifiedDocs: ReturnType<typeof prepareDocumentsForAI>,
): string {
	if (!simplifiedDocs.length) return "Нет данных для анализа.";

	let prompt = "Проанализируй работу магазина на основе данных о продажах:\n\n";

	simplifiedDocs.forEach((doc) => {
		prompt += `🧾 Документ №${doc.number} (${doc.type}) от ${new Date(doc.closeDate).toLocaleString()}:\n`;

		if (!doc.transactions.length) {
			prompt += "- Нет транзакций\n";
		} else {
			doc.transactions.forEach((t: Transaction) => {
				const name = t.commodityName ?? "неизвестный товар";
				const quantity = t.quantity ?? 0;
				const price = t.price ?? 0;
				const sum = t.sum ?? quantity * price;
				const payment = t.paymentType ?? "неизвестно";

				prompt += `- ${name} × ${quantity} по ${price}₽ = ${sum}₽ [${payment}]\n`;
			});
		}

		// Суммируем только числовые суммы
		const total = doc.transactions.reduce((acc: number, t: Transaction) => {
			const sum =
				typeof t.sum === "number" ? t.sum : (t.quantity ?? 0) * (t.price ?? 0);
			return acc + sum;
		}, 0);

		prompt += `Итого: ${total.toFixed(2)}₽\n\n`;
	});

	prompt +=
		"\nОтветь кратко:\n1. Какие товары продавались чаще всего?\n2. Каков средний чек?\n3. Какие способы оплаты преобладают?\n4. Есть ли пики продаж по времени?";

	return prompt;
}

const schema = z.record(
	z.string(),
	z.array(
		z.object({
			interval: z.string(),
			revenue: z.number().nonnegative(),
			checks: z.number().int().nonnegative(),
			averageCheck: z.number().nonnegative(),
			uniqueItems: z.number().int().nonnegative(),
		}),
	),
);

/**
 * Генерирует промпт для LLM на основе массива документов
 */
export function generateLLMPromptFromDocuments(
	docs: Document[],
	maxDocs = 128000,
): string {
	const trimmed = docs.slice(0, maxDocs);

	let result = "Исторические данные продаж магазина:\n\n";

	for (const doc of trimmed) {
		const date = new Date(doc.closeDate);
		date.setHours(date.getHours() + 3); // корректировка на часовой пояс
		const formatted = date.toLocaleString("ru-RU");
		result += `Чек №${doc.number} (${doc.type}) от ${formatted}:\n`;

		const positions = doc.transactions.filter(
			(t) => t.type === "REGISTER_POSITION",
		);
		const payments = doc.transactions.filter((t) => t.type === "PAYMENT");

		for (const p of positions) {
			const name = p.commodityName ?? "неизвестный товар";
			const qty = p.quantity ?? 1;
			const price = p.price ?? 0;
			const sum = p.sum ?? price * qty;
			result += `- ${name} × ${qty} по ${price}₽ = ${sum}₽\n`;
		}

		for (const pay of payments) {
			const method = pay.paymentType ?? "неизвестно";
			result += `Оплата: ${pay.sum}₽ [${method}]\n`;
		}

		const total = positions.reduce(
			(acc, p) => acc + (p.sum ?? (p.price ?? 0) * (p.quantity ?? 0)),
			0,
		);

		result += `Итого: ${total.toFixed(2)}₽\n\n`;
	}

	result += `---
Твоя задача — провести глубокий анализ продаж:

1. Для каждого чека:
   - Определи точную дату и время.
   - Вычисли день недели (например: Понедельник).
   - Определи 20-минутный интервал в течение суток, в который попадает время продажи (например: 14:20–14:40).

2. Сгруппируй все продажи по дням недели и 20-минутным интервалам.

3. Для каждого интервала посчитай:
   - Общую выручку.
   - Количество чеков.
   - Средний чек.
   - Количество уникальных товаров, проданных в этот интервал.

4. Определи интервалы с:
   - Наивысшей выручкой (пиковые часы продаж).
   - Минимальной выручкой (провальные часы).
   - Наибольшей средней стоимостью чека.

5. Если возможно, выдели тренды:
   - Какие дни наиболее прибыльные?
   - В какие часы наблюдается спад продаж?
   - Есть ли повторяющиеся пиковые часы в разные дни?

6. Верни **результат в формате JSON**, строго следующем этой структуре:
{
  "Понедельник": [
    {
      "interval": "05:20–05:40",
      "revenue": 1200.5,
      "checks": 4,
      "averageCheck": 300.13,
      "uniqueItems": 5
    },
    ...
  ],
  "Вторник": [...],
  ...
}

Не добавляй пояснений, только JSON.
`;

	return result;
}

/**
 * Выполняет анализ массива документов с продажами с помощью Workers AI
 */
export async function analyzeSalesDocuments(docs: Document[], aiWithRun: any) {
	const ai = aiWithRun;
	const prompt = generateLLMPromptFromDocuments(docs);

	const response = await ai.run(
		"@cf/mistralai/mistral-small-3.1-24b-instruct",
		{
			messages: [
				{
					role: "system",
					content:
						"Ты лучший бизнес-аналитик. Отвечай строго на русском и строго по формату.",
				},
				{
					role: "user",
					content: prompt,
				},
			],
		},
	);

	try {
		// Важно: парсим строку JSON, а не сразу передаём в schema.parse
		const parsedJson = JSON.parse(response.response);
		const parsed = schema.parse(parsedJson);

		console.log(JSON.stringify(parsed, null, 2));

		return parsed;
	} catch (err) {
		console.error("Ошибка при парсинге ответа:", err);
		console.error("Ответ модели :", response.response);
		return null;
	}
}

export async function createIndexDocumentsTable(db: D1Database): Promise<void> {
	try {
		await db.batch([
			db.prepare(`
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
      `),
			db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_index_documents_shop_id 
        ON index_documents (shop_id)
      `),
			db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_index_documents_number 
        ON index_documents (number)
      `),
		]);

		console.log("Таблица 'index_documents' успешно создана или уже существует");
	} catch (err) {
		console.error("Ошибка при создании таблицы 'index_documents':", err);
		throw err; // Пробрасываем ошибку для обработки на уровень выше
	}
}

export async function createIndexOnType(db: D1Database): Promise<void> {
	try {
		await db
			.prepare(
				`
			CREATE INDEX IF NOT EXISTS idx_index_documents_type 
			ON index_documents (type)
		`,
			)
			.run();

		console.log("Индекс по полю 'type' успешно создан или уже существует");
	} catch (err) {
		console.error("Ошибка при создании индекса по полю 'type':", err);
		throw err;
	}
}

/**
 * Сохраняет новые документы в таблицу `index_documents`.
 * При возникновении дубликатов по уникальному ключу (number, shop_id) запись пропускается.
 *
 * @param db - Экземпляр базы данных D1
 * @param documents - Массив документов для вставки
 * @throws Ошибка базы данных при неудачной вставке
 */
export async function saveNewIndexDocuments(
	db: D1Database,
	documents: IndexDocument[],
): Promise<void> {
	if (!documents?.length) {
		console.log("No documents provided to saveNewIndexDocuments");
		return;
	}

	const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO index_documents 
    (number, shop_id, close_date, open_user_uuid, type, transactions) 
    VALUES (?, ?, ?, ?, ?, ?)
  `);

	try {
		const statements = documents
			.map((doc, index) => {
				if (doc.number === undefined || doc.number === null) {
					console.warn(
						`Skipping document at index ${index}: number is missing`,
						doc,
					);
					return null;
				}
				if (!doc.shop_id) {
					console.warn(
						`Skipping document at index ${index}: shop_id is missing`,
						doc,
					);
					return null;
				}

				return insertStmt.bind(
					String(doc.number),
					doc.shop_id,
					doc.closeDate ?? null,
					doc.openUserUuid ?? null,
					doc.type ?? null,
					doc.transactions ? JSON.stringify(doc.transactions) : null,
				);
			})
			.filter((stmt): stmt is D1PreparedStatement => stmt !== null);

		if (statements.length === 0) {
			console.log("No valid documents to insert");
			return;
		}

		await db.batch(statements);
		console.log(
			`Successfully inserted ${statements.length} documents (duplicates skipped)`,
		);
	} catch (err) {
		console.error("Error in saveNewIndexDocuments:", err);
		throw err;
	}
}

// export async function saveNewIndexDocuments(
// 	db: D1Database,
// 	documents: IndexDocument[],
// ): Promise<void> {
// 	if (!documents?.length) {
// 		console.log("No documents provided to saveNewIndexDocuments");
// 		return;
// 	}

// 	const insertStmt = db.prepare(`
//     INSERT INTO index_documents
//     (number, shop_id, close_date, open_user_uuid, type, transactions)
//     VALUES (?, ?, ?, ?, ?, ?)
//   `);

// 	const checkStmt = db.prepare(`
//     SELECT 1 FROM index_documents WHERE number = ? AND shop_id = ? LIMIT 1
//   `);

// 	try {
// 		const batch = await Promise.all(
// 			documents.map(async (doc, index) => {
// 				// Валидация обязательных полей
// 				if (doc.number === undefined || doc.number === null) {
// 					console.warn(
// 						`Skipping document at index ${index}: number is missing`,
// 						doc,
// 					);
// 					return null;
// 				}
// 				if (!doc.shop_id) {
// 					console.warn(
// 						`Skipping document at index ${index}: shop_id is missing`,
// 						doc,
// 					);
// 					return null;
// 				}

// 				// Проверяем уникальность number + shop_id
// 				const exists = await checkStmt
// 					.bind(String(doc.number), doc.shop_id)
// 					.first();
// 				if (!exists) {
// 					return insertStmt.bind(
// 						String(doc.number), // Преобразуем number в строку
// 						doc.shop_id,
// 						doc.closeDate ?? null,
// 						doc.openUserUuid ?? null,
// 						doc.type ?? null,
// 						doc.transactions ? JSON.stringify(doc.transactions) : null,
// 					);
// 				}
// 				return null;
// 			}),
// 		);

// 		const validInserts = batch.filter(
// 			(stmt): stmt is D1PreparedStatement => stmt !== null,
// 		);

// 		if (validInserts.length) {
// 			await db.batch(validInserts);
// 			console.log(`Successfully inserted ${validInserts.length} documents`);
// 		} else {
// 			console.log("No new documents to insert");
// 		}
// 	} catch (err) {
// 		console.error("Error in saveNewIndexDocuments:", err);
// 		throw err;
// 	}
// }

interface ShopLastDocument {
	shop_id: string;
	closeDate: string;
}

export async function getLatestCloseDates(
	db: D1Database,
	shopIds: string[],
): Promise<ShopLastDocument[]> {
	if (!shopIds?.length) {
		console.log("No shop IDs provided to getLatestCloseDates");
		return [];
	}

	const validShopIds = shopIds.filter((id) => id);
	if (!validShopIds.length) {
		console.warn("No valid shop IDs provided");
		return [];
	}

	try {
		const result = await db
			.prepare(
				`
        SELECT shop_id, MAX(close_date) as close_date
        FROM index_documents
        WHERE shop_id IN (${validShopIds.map(() => "?").join(",")})
        GROUP BY shop_id
      `,
			)
			.bind(...validShopIds)
			.all<{ shop_id: string; close_date: string }>();

		console.log("Query results:", result.results);

		const closeDatesMap = new Map(
			result.results.map((row) => [row.shop_id, row.close_date]),
		);

		const now = new Date();
		now.setUTCHours(3, 0, 0, 0); // начало дня + 3 часа UTC

		// Преобразуем дату в нужный формат
		function formatDate(date: Date): string {
			return date.toISOString().replace("Z", "+0000");
		}

		return validShopIds.map((shopId) => {
			const closeDate = closeDatesMap.get(shopId);
			return {
				shop_id: shopId,
				closeDate: closeDate ?? formatDate(now),
			};
		});
	} catch (err) {
		console.error("Error in getLatestCloseDates:", err);
		throw err;
	}
}

function formatDateToCustomUTC(date: Date): string {
	const pad = (n: number, z = 2) => String(n).padStart(z, "0");
	return (
		`${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T` +
		`${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.` +
		`${pad(date.getUTCMilliseconds(), 3)}+0000`
	);
}

export function buildSinceUntilFromDocuments(
	documents: ShopLastDocument[],
): ShopQuery[] {
	const now = new Date();
	const endOfDayUTC = new Date(
		Date.UTC(
			now.getUTCFullYear(),
			now.getUTCMonth(),
			now.getUTCDate(),
			23,
			59,
			59,
			999,
		),
	);
	const until = new Date(endOfDayUTC.getTime() + 3 * 60 * 60 * 1000); // +3 часа

	return documents.map(({ shop_id, closeDate }) => {
		const sinceDate = new Date(new Date(closeDate).getTime() + 1);
		return {
			shopId: shop_id,
			since: formatDateToCustomUTC(sinceDate),
			until: formatDateToCustomUTC(until),
		};
	});
}

export async function getDocumentsByPeriod(
	db: D1Database,
	shopId: string,
	since: string,
	until: string,
): Promise<IndexDocument[]> {
	try {
		const stmt = await db
			.prepare(
				`
			SELECT * FROM index_documents
			WHERE shop_id = ? 
			AND close_date BETWEEN ? AND ?
			ORDER BY close_date ASC
		`,
			)
			.bind(shopId, since, until);

		const result = await stmt.all();

		const documents: IndexDocument[] = result.results.map((row) => ({
			closeDate: String(row.close_date),
			number: Number(row.number),
			openUserUuid: String(row.open_user_uuid),
			shop_id: String(row.shop_id),
			type: row.type as IndexDocument["type"],
			transactions: parseTransactions(row.transactions),
		}));

		return documents;
	} catch (error) {
		console.error("Ошибка при получении документов за период:", error);
		throw error;
	}
}

function parseTransactions(value: unknown): Transaction[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(String(value));
		if (Array.isArray(parsed)) {
			return parsed;
		}
		console.warn("transactions is not an array:", parsed);
		return [];
	} catch (e) {
		console.warn("Ошибка парсинга transactions:", e);
		return [];
	}
}

export async function getDocumentsByCashOutcomeByPeriod(
	db: D1Database,
	shopId: string,
	since: string,
	until: string,
): Promise<IndexDocument[]> {
	try {
		const stmt = await db
			.prepare(
				`
			SELECT close_date, number, open_user_uuid, shop_id, type, transactions
			FROM index_documents
			WHERE shop_id = ? 
			AND close_date BETWEEN ? AND ?
			AND type = 'CASH_OUTCOME'
			ORDER BY close_date ASC		
		`,
			)
			.bind(shopId, since, until);

		const result = await stmt.all();

		const documents: IndexDocument[] = result.results.map((row) => ({
			closeDate: String(row.close_date),
			number: Number(row.number),
			openUserUuid: String(row.open_user_uuid),
			shop_id: String(row.shop_id),
			type: row.type as IndexDocument["type"],
			transactions: parseTransactions(row.transactions),
		}));

		return documents;
	} catch (error) {
		console.error("Ошибка при получении документов за период:", error);
		throw error;
	}
}

export async function getDocumentsBySalesPeriod(
	db: D1Database,
	shopId: string,
	since: string,
	until: string,
): Promise<IndexDocument[]> {
	try {
		const stmt = await db
			.prepare(
				`
			SELECT close_date, number, open_user_uuid, shop_id, type, transactions
			FROM index_documents
			WHERE shop_id = ? 
			AND close_date BETWEEN ? AND ?
			AND type IN ('SELL', 'PAYBACK')
			ORDER BY close_date ASC		
		`,
			)
			.bind(shopId, since, until);

		const result = await stmt.all();

		const documents: IndexDocument[] = result.results.map((row) => ({
			closeDate: String(row.close_date),
			number: Number(row.number),
			openUserUuid: String(row.open_user_uuid),
			shop_id: String(row.shop_id),
			type: row.type as IndexDocument["type"],
			transactions: parseTransactions(row.transactions),
		}));

		return documents;
	} catch (error) {
		console.error("Ошибка при получении документов за период:", error);
		throw error;
	}
}

export async function getDocumentsBySales(
	db: D1Database,
	shopId: string,
	since: string,
	until: string,
): Promise<IndexDocument[]> {
	try {
		const stmt = await db
			.prepare(
				`
			SELECT close_date, number, open_user_uuid, shop_id, type, transactions
			FROM index_documents
			WHERE shop_id = ? 
			AND close_date BETWEEN ? AND ?
			AND type IN ('SELL')
			ORDER BY close_date ASC		
		`,
			)
			.bind(shopId, since, until);

		const result = await stmt.all();

		const documents: IndexDocument[] = result.results.map((row) => ({
			closeDate: String(row.close_date),
			number: Number(row.number),
			openUserUuid: String(row.open_user_uuid),
			shop_id: String(row.shop_id),
			type: row.type as IndexDocument["type"],
			transactions: parseTransactions(row.transactions),
		}));

		return documents;
	} catch (error) {
		console.error("Ошибка при получении документов за период:", error);
		throw error;
	}
}

export const saveToR2 = async (
	r2: R2Bucket,
	key: string,
	data: string,
): Promise<void> => {
	console.log(" Сохраняем в R2:", key);

	try {
		await r2.put(key, data, {
			httpMetadata: {
				contentType: "text/csv; charset=utf-8",
			},
		});
		console.log(" Успешно сохранено:", key);
	} catch (err) {
		console.error(err);
	}
};

export async function saveFileToR2(
	r2: R2Bucket,
	file: File,
	key: string,
): Promise<void> {
	if (!file || !(file instanceof File)) {
		throw new Error("Передан некорректный файл");
	}

	try {
		const arrayBuffer = await file.arrayBuffer();

		console.log("Saving to R2:", key, "type:", file.type, "size:", file.size);

		await r2.put(key, arrayBuffer, {
			httpMetadata: {
				contentType: file.type || "application/octet-stream",
			},
		});

		// Успешно — ничего не возвращаем
		return;
	} catch (error) {
		console.error("Ошибка сохранения в R2:", error);
		throw new Error("Не удалось сохранить файл в R2");
	}
}

// Функция для создания таблицы plan, если она не существует
export async function createOpenStorsTable(db: D1Database): Promise<void> {
	try {
		// Сначала добавляем колонку, если таблица уже существует
		try {
			await db.prepare("ALTER TABLE openStors ADD COLUMN shop_uuid TEXT").run();
		} catch {
			// колонка уже существует — ок
		}
		try {
			await db.prepare("ALTER TABLE openStors ADD COLUMN shop_name TEXT").run();
		} catch {
			// колонка уже существует — ок
		}
		try {
			await db.prepare("ALTER TABLE openStors ADD COLUMN user_name TEXT").run();
		} catch {
			// колонка уже существует — ок
		}

		const createTableQuery =
			"CREATE TABLE IF NOT EXISTS openStors (" +
			"id INTEGER PRIMARY KEY AUTOINCREMENT, " +
			"date TEXT NOT NULL, " +
			"userId TEXT NOT NULL, " +
			"shop_uuid TEXT, " +
			"shop_name TEXT, " +
			"user_name TEXT, " +
			"cash REAL, " +
			"sign TEXT CHECK(sign IN ('+', '-')), " +
			"ok INTEGER" +
			");";
		await db.prepare(createTableQuery).run();
	} catch (err) {
		console.error("Ошибка при создании таблицы:", err);
	}
}

export async function updateOpenStore(
	db: D1Database,
	userId: string,
	data: { cash: number | null; sign: string | null },
): Promise<void> {
	try {
		await db
			.prepare(
				"UPDATE openStors " +
					"SET cash = ?, sign = ? " +
					"WHERE userId = ? " +
					"ORDER BY id DESC " +
					"LIMIT 1",
			)
			.bind(data.cash, data.sign, userId)
			.run();
	} catch (err) {
		console.error("Ошибка при обновлении openStors:", err);
	}
}

export async function saveOpenStorsTable(
	db: D1Database,
	data: {
		date: string;
		userId: string;
		shopUuid?: string | null;
		shopName?: string | null;
		userName?: string | null;
		cash?: number | null;
		sign?: string | null;
		ok?: number | null;
	},
): Promise<void> {
	try {
		await db
			.prepare(
				"INSERT INTO openStors (date, userId, shop_uuid, shop_name, user_name, cash, sign, ok) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			)
			.bind(
				data.date,
				data.userId,
				data.shopUuid ?? null,
				data.shopName ?? null,
				data.userName ?? null,
				data.cash ?? null,
				data.sign ?? null,
				data.ok ?? null,
			)
			.run();
	} catch (err) {
		console.error("Ошибка при сохранении данных в openStors:", err);
	}
}

// export async function isOpenStoreExists(
// 	db: D1Database,
// 	userId: string,
// 	dateDDMMYYYY: string,
// ): Promise<boolean> {
// 	try {
// 		// Разбираем дату dd-mm-yyyy
// 		const [day, month, year] = dateDDMMYYYY.split("-").map(Number);

// 		// Начало и конец дня в формате ISO
// 		const startDate = new Date(
// 			Date.UTC(year, month - 1, day, 0, 0, 0),
// 		).toISOString();
// 		const endDate = new Date(
// 			Date.UTC(year, month - 1, day, 23, 59, 59),
// 		).toISOString();

// 		// Проверяем, есть ли запись для пользователя в этот день
// 		const res = await db
// 			.prepare(
// 				"SELECT COUNT(*) AS count FROM openStors WHERE userId = ? AND date BETWEEN ? AND ?",
// 			)
// 			.bind(userId, startDate, endDate)
// 			.first<{ count: number }>();

// 		// Если res или res.count undefined, считаем что записи нет
// 		const count = res?.count ?? 0;

// 		return count > 0;
// 	} catch (err) {
// 		console.error("Ошибка при проверке открытия магазина:", err);
// 		return false;
// 	}
// }

export async function isOpenStoreExists(
	db: D1Database,
	userId: string,
	dateDDMMYYYY: string,
): Promise<boolean> {
	try {
		// Разбираем дату dd-mm-yyyy
		const [day, month, year] = dateDDMMYYYY.split("-").map(Number);

		// Начало и конец дня в формате ISO
		const startDate = new Date(
			Date.UTC(year, month - 1, day, 0, 0, 0),
		).toISOString();
		const endDate = new Date(
			Date.UTC(year, month - 1, day, 23, 59, 59),
		).toISOString();

		// Проверяем, есть ли запись с хотя бы одним не-null полем из cash, sign, ok
		const res = await db
			.prepare(
				`SELECT COUNT(*) AS count 
				 FROM openStors 
				 WHERE userId = ? 
				   AND date BETWEEN ? AND ? 
				   AND (cash IS NOT NULL OR sign IS NOT NULL OR ok IS NOT NULL)`,
			)
			.bind(userId, startDate, endDate)
			.first<{ count: number }>();

		// Если res или res.count undefined, считаем что записи нет
		const count = res?.count ?? 0;

		return count > 0;
	} catch (err) {
		console.error("Ошибка при проверке открытия магазина:", err);
		return false;
	}
}

export async function createDeadStocksTable(db: D1Database): Promise<void> {
	try {
		const createTableQuery =
			"CREATE TABLE IF NOT EXISTS deadStocks (" +
			"id INTEGER PRIMARY KEY AUTOINCREMENT, " +
			"shop_uuid TEXT NOT NULL, " +
			"name TEXT NOT NULL, " +
			"quantity INTEGER NOT NULL, " +
			"sold INTEGER NOT NULL, " +
			"lastSaleDate TEXT, " +
			"mark TEXT, " +
			"moveCount INTEGER, " +
			"moveToStore TEXT, " +
			"document_number TEXT, " +
			"document_date TEXT" +
			");";
		await db.prepare(createTableQuery).run();
		// console.log("Таблица 'deadStocks' успешно создана или уже существует.");
	} catch (err) {
		console.error("Ошибка при создании таблицы:", err);
	}
}

export async function saveDeadStocks(
	db: D1Database,
	shopUuid: string,
	items: DeadStockItem[],
): Promise<void> {
	if (!shopUuid || !items || !Array.isArray(items) || items.length === 0) {
		throw new Error("Неверные данные");
	}

	// Генерация номера и даты документа для батча
	const document_number = crypto.randomUUID(); // Или другой формат, например, 'DS-' + Date.now()
	const document_date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

	const insertQuery = `
    INSERT INTO deadStocks 
    (shop_uuid, name, quantity, sold, lastSaleDate, mark, moveCount, moveToStore, document_number, document_date) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

	const statements = items.map((item) =>
		db
			.prepare(insertQuery)
			.bind(
				shopUuid,
				item.name,
				item.quantity,
				item.sold,
				item.lastSaleDate,
				item.mark,
				item.moveCount ?? null,
				item.moveToStore ?? null,
				document_number,
				document_date,
			),
	);

	await db.batch(statements);
}

export async function createOpeningPhotosTable(db: D1Database): Promise<void> {
	try {
		await db.prepare(`
			CREATE TABLE IF NOT EXISTS opening_photos (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				shop_uuid TEXT NOT NULL,
				user_id TEXT NOT NULL,
				date TEXT NOT NULL,
				category TEXT NOT NULL,
				slot_index INTEGER NOT NULL,
				telegram_file_id TEXT NOT NULL,
				created_at TEXT NOT NULL DEFAULT (datetime('now')),
				UNIQUE(shop_uuid, date, category, slot_index)
			)
		`).run();
	} catch (err) {
		console.error("Ошибка при создании opening_photos:", err);
	}
}
