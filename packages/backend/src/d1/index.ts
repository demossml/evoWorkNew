import type {
	D1Database,
	// D1PreparedStatement,
} from "@cloudflare/workers-types";

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
            WHERE date = ?;
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
                WHERE date = ? AND shopUuid = ?; // Добавляем условие для обновления по shopUuid
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
                VALUES (?, ?, ?);
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
	try {
		// SQL-запрос для проверки наличия записи с указанной датой и shopUuid
		const queryCheck = `
            SELECT 
                date,
                shopUuid
            FROM salaryData
            WHERE date = ? AND shopUuid = ?;
        `;

		// Выполнение запроса с привязкой параметров для проверки
		const existingRecord = await db
			.prepare(queryCheck)
			.bind(date, shopUuid)
			.first();

		if (existingRecord) {
			// console.log(
			// 	`Запись с датой ${date} и shopUuid ${shopUuid} уже существует. Пропуск операции.`,
			// );
			return null; // Если запись уже существует, возвращаем null
		}

		// SQL-запрос для получения данных из таблицы salaryData
		const query = `
            SELECT 
                date,
                shopUuid,
                employeeUuid,
                bonusAccessories,
                dataPlan,
                salesDataVape,
                bonusPlan,
                totalBonus
            FROM salaryData
            WHERE employeeUuid = ? AND date = ?;
        `;

		// Выполнение запроса с привязкой параметров
		const result = await db.prepare(query).bind(employeeUuid, date).first();

		// Если данные найдены, возвращаем результат
		if (result) {
			// console.log(
			// 	`Данные зарплаты найдены для сотрудника ${employeeUuid} на дату ${date}:`,
			// 	result,
			// );
			return result;
		}

		// Если данные не найдены, возвращаем null
		// console.log(
		// 	`Данные зарплаты не найдены для сотрудника ${employeeUuid} на дату ${date}.`,
		// );
		return null;
	} catch (err) {
		// Логирование ошибки
		console.error("Ошибка при извлечении данных из таблицы salaryData:", err);
		throw err;
	}
}
