import type { StockApiItem } from "./types";

import {
	calculateDateRanges,
	// formatDateTime,
	formatDateWithTime,
	generateDateRanges,
	getDateRangesForWeeks,
	getDocumentsBySales,
} from "../utils";
import type {
	Document,
	Employee,
	IndexDocument,
	// PaymentInfo,
	PaymentType,
	Product,
	ProductUuid,
	ProductsResponse,
	SalesInfo,
	Shop,
	ShopQuery,
	ShopUuidName,
	ShopsResponse,
	// TransactionSale,
} from "./types";

import type { D1Database } from "@cloudflare/workers-types";

/**
 * Класс Evotor для работы с API Эвотор
 */
export class Evotor {
	private headers: { "X-Authorization": string }; // Заголовки для авторизации
	private urls: {
		getEmployees: string;
		getShops: string;
		getProducts: string;
		getZReport: string;
		getCashOutcome: string;
		getSell: string;
		getDoc: string;
		getStock: string;
	};

	private cache: Map<string, any> = new Map(); // Кэш для данных
	#lastRequestTime = 0; // timestamp последнего запроса (rate-limit)
	#baseDelay = 500;     // базовая задержка (мс), растёт при 429

	/**
	 * Конструктор класса Evotor
	 * @param token - Токен для авторизации
	 */
	constructor(token: string) {
		this.headers = { "X-Authorization": token }; // Инициализация заголовков
		this.urls = {
			getEmployees: "https://api.evotor.ru/api/v1/inventories/employees/search",
			getShops: "https://api.evotor.ru/api/v1/inventories/stores/search",
			getProducts:
				"https://api.evotor.ru/api/v1/inventories/stores/{}/products",
			getZReport:
				"https://api.evotor.ru/api/v1/inventories/stores/{}/documents?gtCloseDate={}&ltCloseDate={}&types=FPRINT",
			getCashOutcome:
				"https://api.evotor.ru/api/v1/inventories/stores/{}/documents?gtCloseDate={}&ltCloseDate={}&types=CASH_OUTCOME",
			getSell:
				"https://api.evotor.ru/api/v1/inventories/stores/{}/documents?gtCloseDate={}&ltCloseDate={}&types=SELL",
			getDoc:
				"https://api.evotor.ru/api/v1/inventories/stores/{}/documents?gtCloseDate={}&ltCloseDate={}",
			getStock:
				"https://api.evotor.ru/api/v2/inventories/stores/{}/stock",
		};
	}

	private async getCachedData<T>(
		key: string,
		fetchFn: () => Promise<T>,
	): Promise<T> {
		if (this.cache.has(key)) {
			return this.cache.get(key) as T;
		}
		const data = await fetchFn();
		this.cache.set(key, data);
		return data;
	}

	async getProductsUuid(shopId: string): Promise<{ uuid: string; group: boolean; parentUuid: string }[]> {
		const url = this._replacePlaceholders(this.urls.getProducts, [shopId]);
		const products = await this._fetchData(url);
		return products.map(
			(product: { uuid: string; group: boolean; parentUuid: string }) => ({
				uuid: product.uuid,
				group: product.group,
				parentUuid: product.parentUuid,
			}),
		);
	}

	async getProductsShopUuidsT(shopId: string): Promise<ProductUuid[]> {
		try {
			// Заменяем плейсхолдер в URL на shopId
			const url = this._replacePlaceholders(this.urls.getProducts, [shopId]);
			const products = await this._fetchData(url);

			// Возвращаем только нужные поляn
			return products.map(
				(product: {
					uuid: string;
					group: boolean;
					parentUuid: string;
					name: string;
				}) => ({
					uuid: product.uuid,
					group: product.group,
					parentUuid: product.parentUuid,
					name: product.name,
					shopId: shopId,
				}),
			);
		} catch (error) {
			// Логируем ошибку
			this._logError(
				`Ошибка при получении продуктов для магазина с ID: ${shopId}`,
				error,
			);
			throw error; // Пробрасываем ошибку дальше
		}
	}

	async checkToken(): Promise<boolean> {
		try {
			const response = await fetch(this.urls.getShops, {
				method: "GET",
				headers: this.headers,
			});

			if (response.ok) {
				return true;
			}
			throw new Error("Неверный или истекший токен");
		} catch (error) {
			this._logError("Ошибка при проверке токена", error);
			return false;
		}
	}

	/**
	 * Получает остатки товаров для магазина (v2 stock API)
	 */
	async getStoreStock(shopId: string): Promise<StockApiItem[]> {
		try {
			const url = this._replacePlaceholders(this.urls.getStock, [shopId]);
			const data = await this._fetchData(url);
			const items = (data as any)?.items ?? data ?? [];
			return Array.isArray(items) ? items : [];
		} catch (error) {
			this._logError(`Ошибка при получении остатков для ${shopId}`, error);
			return [];
		}
	}

	/**
	 * Получает данные сотрудников.
	 * @returns Массив сотрудников.
	 * @throws Пробрасывает ошибку, если возникает ошибка при получении данных сотрудников.
	 */
	async getEmployees(): Promise<Employee[]> {
		return this.getCachedData("employees", () =>
			this._fetchData(this.urls.getEmployees),
		);
	}

	/**
	 * Получает список uuid сотрудников.
	 * @returns Массив uuid сотрудников.
	 * @throws Пробрасывает ошибку, если возникает ошибка при получении данных.
	 */
	async getEmployeesUuids(): Promise<string[]> {
		try {
			// Получаем данные магазинов
			const employeesResponse: Employee[] = await this.getEmployees();

			// Извлекаем uuid для каждого магазина из массива items
			const employeesUuids: string[] = employeesResponse.map(
				(employee) => employee.uuid,
			); // Исправлено с id на uuid

			return employeesUuids;
		} catch (error) {
			this._logError("Ошибка при получении списка uuid магазинов", error);
			throw error;
		}
	}

	/**
	 * Получает имя сотрудника по его уникальному employeeUuid.
	 * @param employeeUuid Уникальный идентификатор сотрудника.
	 * @returns Имя сотрудника, если найден, или null, если сотрудник не найден.
	 * @throws Пробрасывает ошибку, если возникает ошибка при получении данных.
	 */
	async getEmployeesByName(employeeUuid: string): Promise<string> {
		try {
			const employees = await this.getEmployees(); // Получение списка сотрудников
			const employee = employees.find((emp) => emp.id === employeeUuid); // Поиск сотрудника по UUID
			return employee ? employee.name : "Сотрудник не найден"; // Возврат имени или сообщение о неудаче
		} catch (error) {
			this._logError("Ошибка при получении имени сотрудника", error); // Логирование ошибки
			throw error; // Пробрасывание ошибки дальше
		}
	}

	/**
	 * Получает имена и UUID сотрудников.
	 * Массив объектов, где каждый объект содержит UUID и имя сотрудника.
	 * @returns Массив объектов с UUID и именами сотрудников.
	 * @throws Пробрасывает ошибку, если возникает ошибка при получении данных.
	 */
	async getEmployeesLastNameAndUuid(): Promise<
		Array<{ uuid: string; name: string }>
	> {
		try {
			const employees = await this.getEmployees(); // Получение списка сотрудников
			// console.log("Список сотрудников:", employees); // Логирование списка сотрудников

			// Преобразуем сотрудников в массив объектов с нужными полями
			const result = employees
				.filter((emp) => emp.uuid && emp.name) // Проверка наличия необходимых данных
				.map((emp) => ({
					uuid: emp.uuid, // UUID сотрудника
					name: emp.name, // Имя сотрудника
				}));

			return result; // Возврат массива объектов с UUID и именами
		} catch (error) {
			this._logError("Ошибка при получении имен сотрудников", error); // Логирование ошибки
			throw error; // Пробрасывание ошибки дальше
		}
	}

	/**
	 * Получает список сотрудников в формате { [uuid]: name, ... }
	 * @returns Promise<Record<string, string>>
	 */
	async getEmployeesLastNameAndUuidDict(): Promise<Record<string, string>> {
		try {
			const employees = await this.getEmployees(); // Получение списка сотрудников

			const result: Record<string, string> = {};
			for (const emp of employees) {
				if (emp.uuid && emp.name) {
					result[emp.uuid] = emp.name;
				}
			}

			return result;
		} catch (error) {
			this._logError("Ошибка при получении имен сотрудников", error);
			throw error;
		}
	}

	/**
	 * Получает даннве сотрудника (uuid, name) по фамилии.
	 * @param lastName - Фамилия для поиска сотрудников.
	 * @returns Массив объектов с UUID и именем сотрудников.
	 * @throws Пробрасывает ошибку, если возникает ошибка при получении данных.
	 */
	async getEmployeesByLastName(
		lastName: string,
	): Promise<Array<{ uuid: string; name: string }>> {
		try {
			const employees = await this.getEmployees(); // Получение списка сотрудников

			// Фильтруем сотрудников по фамилии и преобразуем в массив объектов с нужными полями
			const result = employees
				.filter((emp) => emp.lastName === lastName && emp.uuid && emp.name) // Проверка наличия данных и соответствия фамилии
				.map((emp) => ({
					uuid: emp.uuid, // UUID сотрудника
					name: emp.name, // Имя сотрудника
				}));

			return result; // Возврат отфильтрованного массива объектов
		} catch (error) {
			this._logError("Ошибка при получении сотрудников по фамилии", error); // Логирование ошибки
			throw error; // Пробрасывание ошибки дальше
		}
	}

	/**
	 * Получает фамилию сотрудника по его фамилии.
	 *
	 * Этот метод ищет сотрудника по фамилии в списке сотрудников и возвращает его фамилию, если он найден.
	 * Если сотрудник не найден, возвращается null.
	 *
	 * @param lastName - Фамилия сотрудника, по которой выполняется поиск.
	 * @returns Фамилию сотрудника или null, если сотрудник не найден.
	 * @throws Пробрасывает ошибку, если не удается получить список сотрудников.
	 */
	async getEmployeeLastName(lastName: string): Promise<string | null> {
		try {
			const shopsResponse: Employee[] = await this.getEmployees(); // Получение списка сотрудников
			// Проверяем, является ли shopsResponse массивом
			if (!Array.isArray(shopsResponse)) {
				throw new Error("Некорректный ответ: отсутствует список магазинов");
			}

			// Поиск сотрудника по lastName
			const employee = shopsResponse.find(
				(doc: Employee) => doc.lastName === lastName,
			); // Найти первого подходящего сотрудника

			// Если сотрудник найден, вернуть его фамилию, иначе вернуть null
			return employee ? employee.name : null;
		} catch (error) {
			this._logError("Ошибка при получении имени сотрудника", error); // Логирование ошибки
			throw error; // Пробрасывание ошибки дальше
		}
	}

	/**
	 * Получает имя сотрудника по его уникальному employeeUuid.
	 *
	 * Этот метод обращается к списку сотрудников и ищет сотрудника с указанным UUID.
	 * Если такой сотрудник найден, возвращает его имя. Если сотрудник не найден, возвращает null.
	 *
	 * @param employeeUuid - Уникальный идентификатор сотрудника.
	 * @returns Имя сотрудника или null, если сотрудник не найден.
	 * @throws Пробрасывает ошибку, если не удается получить список сотрудников.
	 */
	async getEmployeeByUuid(employeeUuid: string): Promise<string | null> {
		try {
			const employeesResponse: Employee[] = await this.getEmployees(); // Получение списка сотрудников
			// Проверяем, является ли employeesResponse массивом
			if (!Array.isArray(employeesResponse)) {
				throw new Error("Некорректный ответ: отсутствует список сотрудников");
			}

			// Поиск сотрудника по employeeUuid
			const employee = employeesResponse.find(
				(doc: Employee) => doc.uuid === employeeUuid,
			); // Найти первого подходящего сотрудника

			// Если сотрудник найден, вернуть его имя, иначе вернуть null
			return employee ? employee.name : null;
		} catch (error) {
			this._logError("Ошибка при получении имени сотрудника", error); // Логирование ошибки
			throw error; // Пробрасывание ошибки дальше
		}
	}

	/**
	 * Получает роль сотрудника по фамилии.
	 *
	 * Этот метод обращается к списку сотрудников и ищет сотрудника с указанной фамилией.
	 * Если такой сотрудник найден, возвращает его роль. Если сотрудник не найден, возвращает null.
	 *
	 * @param lastName - Фамилия сотрудника, роль которого нужно получить.
	 * @returns Роль сотрудника или null, если сотрудник не найден.
	 * @throws Пробрасывает ошибку, если не удается получить список сотрудников.
	 */
	async getEmployeeRole(lastName: string): Promise<string> {
		try {
			const shopsResponse: Employee[] = await this.getEmployees(); // Получение списка сотрудников
			// Проверяем, является ли shopsResponse массивом
			if (!Array.isArray(shopsResponse)) {
				throw new Error("Некорректный ответ: отсутствует список магазинов");
			}

			// Поиск сотрудника по lastName
			const employee = shopsResponse.find(
				(doc: Employee) => doc.lastName === lastName,
			); // Найти первого подходящего сотрудника

			// Если сотрудник найден, вернуть его фамилию, иначе вернуть null
			return employee ? employee.role : "null";
		} catch (error) {
			this._logError("Ошибка при получении имени сотрудника", error); // Логирование ошибки
			throw error; // Пробрасывание ошибки дальше
		}
	}

	/**
	 * Получает сотрудников, работающих в указанном магазине.
	 * @param shopId - Идентификатор магазина (UUID), для которого нужно получить сотрудников.
	 * @returns Массив объектов с UUID и именами сотрудников, работающих в указанном магазине.
	 * @throws Пробрасывает ошибку, если возникает ошибка при получении данных.
	 */
	async getEmployeesByShopId(
		shopId: string,
	): Promise<Array<{ uuid: string; name: string }>> {
		try {
			const employees = await this.getEmployees(); // Получение списка сотрудников
			// console.log("Список сотрудников:", employees); // Логирование списка сотрудников

			// Фильтруем сотрудников, у которых есть указанный shopId в массиве stores
			const result = employees
				.filter((emp) => emp.uuid && emp.name && emp.stores?.includes(shopId)) // Проверка наличия данных и shopId
				.map((emp) => ({
					uuid: emp.uuid, // UUID сотрудника
					name: emp.name, // Имя сотрудника
				}));

			return result; // Возврат массива объектов с UUID и именами
		} catch (error) {
			this._logError(
				`Ошибка при получении сотрудников для магазина с ID: ${shopId}`,
				error,
			); // Логирование ошибки
			throw error; // Пробрасывание ошибки дальше
		}
	}

	/**
	 * Получает все документы для магазина с учетом интервалов по 30 дней.
	 *
	 * Этот метод разбивает период между датами на интервалы в 30 дней и для каждого интервала выполняет запрос
	 * на сервер для получения документов. Все полученные документы объединяются в один массив и возвращаются.
	 *
	 * @param shopId - ID магазина, для которого получаем документы.
	 * @param since - Дата начала периода (в формате строки).
	 * @param until - Дата окончания периода (в формате строки).
	 * @returns Массив документов, полученных за весь указанный период.
	 * @throws Пробрасывает ошибку, если не удаётся получить документы.
	 */
	async getDocuments(
		shopId: string,
		since: string,
		until: string,
	): Promise<Document[]> {
		const intervals = generateDateRanges(since, until, "days", 30);
		const results: Document[][] = [];

		for (const [startDate, endDate] of intervals) {
			const start = formatDateWithTime(new Date(startDate), false);
			const end = formatDateWithTime(new Date(endDate), true);
			const url = this._replacePlaceholders(this.urls.getDoc, [
				shopId,
				start,
				end,
			]);
			try {
				const response = await this._fetchData(url);
				results.push(Array.isArray(response) ? response : []);
			} catch (intervalError) {
				results.push([]);
			}
		}
		return results.flat();
	}

	/**
	 * Получает документы с типами "SELL", "PAYBACK", "CASH_OUTCOME" за период по всем магазинам.
	 *
	 * @param since - Дата начала периода (строка)
	 * @param until - Дата окончания периода (строка)
	 * @returns Массив документов по всем магазинам и нужным типам
	 */
	async getAllDocumentsByTypes(
		since: string,
		until: string,
	): Promise<Document[]> {
		const shopUuids = await this.getShopUuids();
		let allDocs: Document[] = [];

		for (const shopId of shopUuids) {
			const docs = await this.getDocumentsBySellPayback(shopId, since, until);
			allDocs = allDocs.concat(docs);
		}
		return allDocs;
	}

	/**
	 * Получает документы с типами "SELL", "PAYBACK" и "CASH_OUTCOME" для магазина за указанный период.
	 *
	 * Этот метод фильтрует документы, полученные с использованием метода getDocuments,
	 * и возвращает только те, которые относятся к продажам, возвратам и денежным расходам.
	 *
	 * @param shopId - ID магазина, для которого получаем документы.
	 * @param since - Дата начала периода (в формате строки).
	 * @param until - Дата окончания периода (в формате строки).
	 * @returns Список документов с типами "SELL", "PAYBACK" и "CASH_OUTCOME".
	 * @throws Пробрасывает ошибку, если не удаётся получить документы.
	 */
	async getDocumentsBySellPayback(
		shopId: string,
		since: string,
		until: string,
	): Promise<Document[]> {
		try {
			// Получаем все документы с использованием getDocuments
			const documents = await this.getDocuments(shopId, since, until);

			// Фильтрация по типам "SELL" и "PAYBACK"
			return documents.filter((doc) => ["SELL", "PAYBACK"].includes(doc.type));
		} catch (error) {
			this._logError(
				`Ошибка при получении документов для магазина с ID: ${shopId}`,
				error,
			);
			throw error;
		}
	}

	async getAllOpenSessions(since: string, until: string): Promise<Document[]> {
		const shopsId = await this.getShopUuids();
		const openSessions: Document[] = [];

		for (const shopId of shopsId) {
			const url = this._replacePlaceholders(this.urls.getDoc, [shopId, since, until]);
			const documents = await this._fetchData(url);
			if (documents && Array.isArray(documents)) {
				openSessions.push(
					...documents.filter((doc: Document) => doc.type === "OPEN_SESSION"),
				);
			}
		}

		return openSessions;
	}

	async getDocumentsIndex(
		shopId: string,
		since: string,
		until: string,
	): Promise<IndexDocument[]> {
		try {
			const documents = await this.getDocuments(shopId, since, until);
			return documents.map((doc) => ({
				closeDate: doc.closeDate,
				number: doc.number,
				openUserUuid: doc?.openUserUuid ?? "",
				shop_id: doc?.storeUuid ?? "",
				type: doc.type,
				transactions: doc?.transactions ?? [],
			}));
		} catch (error) {
			this._logError(`Failed to fetch documents for shop ID: ${shopId}`, error);
			throw error;
		}
	}

	// async getDocumentsIndexForShops(
	// 	shopIds: string[],
	// 	since: string,
	// 	until: string,
	// ): Promise<IndexDocument[]> {
	// 	try {
	// 		const results = await Promise.all(
	// 			shopIds.map((shopId) => this.getDocumentsIndex(shopId, since, until)),
	// 		);

	// 		// Объединяем все массивы IndexDocument[] в один
	// 		return results.flat();
	// 	} catch (error) {
	// 		this._logError(
	// 			"Ошибка при получении документов для нескольких магазинов",
	// 			error,
	// 		);
	// 		throw error;
	// 	}
	// }

	async getDocumentsIndexForShops(
		queries: ShopQuery[],
	): Promise<IndexDocument[]> {
		try {
			const results: IndexDocument[][] = [];
			for (const { shopId, since, until } of queries) {
				const docs = await this.getDocumentsIndex(shopId, since, until);
				results.push(docs);
			}

			return results.flat();
		} catch (error) {
			this._logError(
				"Ошибка при получении документов для нескольких магазинов",
				error,
			);
			throw error;
		}
	}

	/**
	 * Извлекает продажи из массива документов Evotor.
	 * Для каждого товара формирует объект с ключом transactions,
	 * где productName находится внутри каждой транзакции, а paymentData — массив оплат по чеку.
	 */
	async extractSalesInfo(docs: Document[]): Promise<SalesInfo[]> {
		const [shops, employees] = await Promise.all([
			this.getShopNameUuidsDict(),
			this.getEmployeesLastNameAndUuidDict(),
		]);

		if (!shops || !employees) {
			throw new Error("Не удалось получить данные магазинов или сотрудников");
		}

		return docs.map((doc) => ({
			type: doc.type === "SELL" ? "SALE" : "PAYBACK",
			shopName: shops[doc.storeUuid] ?? "Неизвестный магазин",
			closeDate: doc.closeDate,
			employeeName: employees[doc.openUserUuid] ?? "Неизвестный сотрудник",
			paymentData: (doc.transactions || [])
				.filter((tx) => tx.type === "PAYMENT")
				.map((payment) => ({
					paymentType: payment.paymentType || "",
					sum: payment.sum || 0,
				})),
			transactions: (doc.transactions || [])
				.filter((tx) => tx.type === "REGISTER_POSITION")
				.map((pos) => ({
					productName: pos.commodityName,
					quantity: pos.quantity,
					price: pos.price,
					costPrice: pos.costPrice,
					sum: pos.sum,
				})),
		}));
	}
	/**
	 * Получает документы типа FPRINT для магазина, начиная с сегодняшнего дня,
	 * и по мере необходимости проверяет предыдущие дни, пока не найдет документ.
	 *
	 * @param shopId - ID магазина, для которого получаем документы.
	 * @param since - Дата начала периода (в формате строки).
	 * @param until - Дата окончания периода (в формате строки).
	 * @returns {Promise<Document[] | null>} Промис, возвращающий документы типа FPRINT или null, если не найдено.
	 * @throws Пробрасывает ошибку, если не удается получить документы.
	 */
	async getDocumentsByFrint(shopId: string): Promise<Document[] | null> {
		try {
			let foundDocuments: Document[] | null = null;
			const currentDate = new Date();
			let daysBack = 0;
			const MAX_DAYS = 365; // Защита от бесконечного цикла
			let consecutive429 = 0;

			while ((!foundDocuments || foundDocuments.length === 0) && daysBack < MAX_DAYS) {
				const since = formatDateWithTime(currentDate, false);
				const until = formatDateWithTime(currentDate, true);

				try {
					const documents = await this.getDocuments(shopId, since, until);
					consecutive429 = 0;
					foundDocuments = documents.filter((doc) => ["FPRINT"].includes(doc.type));
				} catch (_err) {
					// 429 и прочие — не останавливаем цикл, но после 3 ошибок подряд выходим
					consecutive429++;
					if (consecutive429 >= 3) break;
				}

				if (!foundDocuments || foundDocuments.length === 0) {
					currentDate.setDate(currentDate.getDate() - 1);
					daysBack++;
				}
			}

			return foundDocuments;
		} catch (error) {
			this._logError(
				`Ошибка при получении документов для магазина с ID: ${shopId}`,
				error,
			);
			throw error;
		}
	}

	/**
	 * Получает документы с типом "CASH_OUTCOME" для магазина за указанный период.
	 *
	 * Этот метод фильтрует документы, полученные с использованием метода getDocuments,
	 * и возвращает только те, которые относятся к денежным расходам (CASH_OUTCOME).
	 *
	 * @param shopId - ID магазина, для которого получаем документы.
	 * @param since - Дата начала периода (в формате строки).
	 * @param until - Дата окончания периода (в формате строки).
	 * @returns Список документов с типом "CASH_OUTCOME".
	 * @throws Пробрасывает ошибку, если не удаётся получить документы.
	 */
	async getDocumentsByCashOutcome(
		shopId: string,
		since: string,
		until: string,
	): Promise<Document[]> {
		try {
			// Получаем все документы с использованием getDocuments
			const documents = await this.getDocuments(shopId, since, until);

			// Фильтрация по типам "SELL" и "PAYBACK"
			return documents.filter((doc) => ["CASH_OUTCOME"].includes(doc.type));
		} catch (error) {
			this._logError(
				`Ошибка при получении документов для магазина с ID: ${shopId}`,
				error,
			);
			throw error;
		}
	}

	// /**
	//  * Получает данные о остатке денежных средств в магазине.
	//  *
	//  * @param shopId - ID магазина, для которого получаем документы.
	//  * @returns {number}  остаток денежных средств.
	//  * @throws Пробрасывает ошибку, если не удаётся получить документы.
	//  */
	// async getCash(shopId: string): Promise<number> {
	// 	try {
	// 		// Инициализация переменной для хранения общей суммы
	// 		let totalCash = 0;
	// 		// console.log(`Инициализация общей суммы: ${totalCash}`);

	// 		// Получение последнего документа типа FPRINT_Z_REPORT для данного магазина
	// 		const documentFprint = await this.getDocumentsByFrint(shopId);

	// 		let since = "";

	// 		// Если найден документ FPRINT_Z_REPORT, обновляем начальную дату и общую сумму
	// 		if (documentFprint) {
	// 			for (const doc of documentFprint) {
	// 				// console.log("Обработка документа FPRINT_Z_REPORT:", doc);

	// 				const date = new Date(doc.closeDate);
	// 				date.setMilliseconds(date.getMilliseconds() + 100);
	// 				since = formatDateTime(date);
	// 				// console.log(`Дата начала (since): ${since}`);

	// 				for (const trans of doc.transactions) {
	// 					if (trans.type === "FPRINT_Z_REPORT") {
	// 						totalCash += trans.cash;
	// 						// console.log(
	// 						// 	`Добавлено ${trans.cash} из FPRINT_Z_REPORT. Текущая сумма: ${totalCash}`,
	// 						// );
	// 					}
	// 				}
	// 			}
	// 		}

	// 		const until = formatDateWithTime(new Date(), true); // Форматируем конечную дату
	// 		// console.log(`Дата конца (until): ${until}`);

	// 		// Получение всех документов для данного магазина
	// 		const documents = await this.getDocuments(shopId, since, until);

	// 		// Обработка каждого документа и его транзакций
	// 		for (const doc of documents) {
	// 			if (doc.type === "CASH_OUTCOME") {
	// 				for (const trans of doc.transactions) {
	// 					if (trans.type === "CASH_OUTCOME") {
	// 						totalCash -= trans.sum;
	// 						// console.log(
	// 						// 	`Вычтено ${trans.sum} из CASH_OUTCOME. Текущая сумма: ${totalCash}`,
	// 						// );
	// 					}
	// 				}
	// 			}

	// 			if (doc.type === "CASH_INCOME") {
	// 				for (const trans of doc.transactions) {
	// 					if (trans.type === "CASH_INCOME") {
	// 						totalCash += trans.sum;
	// 						// console.log(
	// 						// 	`Добавлено ${trans.sum} из CASH_INCOME. Текущая сумма: ${totalCash}`,
	// 						// );
	// 					}
	// 				}
	// 			}

	// 			if (doc.type === "SELL") {
	// 				for (const trans of doc.transactions) {
	// 					if (trans.type === "PAYMENT" && trans.paymentType === "CASH") {
	// 						totalCash += trans.sum;
	// 						// console.log(
	// 						// 	`Добавлено ${trans.sum} из SELL (PAYMENT). Текущая сумма: ${totalCash}`,
	// 						// );
	// 					}
	// 				}
	// 			}

	// 			if (doc.type === "PAYBACK") {
	// 				for (const trans of doc.transactions) {
	// 					if (trans.type === "PAYMENT" && trans.paymentType === "CASH") {
	// 						totalCash -= trans.sum;
	// 						// console.log(
	// 						// 	`Вычтено ${trans.sum} из PAYBACK (PAYMENT). Текущая сумма: ${totalCash}`,
	// 						// );
	// 					}
	// 				}
	// 			}
	// 		}

	// 		// console.log("Итоговая сумма по кассе:", totalCash);
	// 		return totalCash;
	// 	} catch (error) {
	// 		console.error(
	// 			"Ошибка при получении данных о остатке денежных средств в магазине:",
	// 			error,
	// 		);
	// 		throw error;
	// 	}
	// }

	/**
	 * Получает остаток наличных в магазине.
	 *
	 * Алгоритм:
	 * 1. Ищет последний Z-отчёт (FPRINT) — без ограничения по дате
	 * 2. Берёт trans.cash из FPRINT_Z_REPORT как якорный остаток
	 * 3. Прибавляет/вычитает все кассовые операции после Z-отчёта
	 *
	 * @param shopId - ID магазина
	 * @returns Остаток наличных в рублях
	 */
	async getCash(shopId: string): Promise<number> {
		try {
			// 1. Ищем последний Z-отчёт (FPRINT) — идём назад по дням
			const fprintDocs = await this.getDocumentsByFrint(shopId);
			if (!fprintDocs || fprintDocs.length === 0) {
				return 0;
			}

			// 2. Берём самый свежий FPRINT и извлекаем якорный остаток
			const lastFprint = fprintDocs.reduce((latest, doc) =>
				new Date(doc.closeDate) > new Date(latest.closeDate) ? doc : latest,
			);

			let totalCash = 0;
			for (const trans of lastFprint.transactions) {
				if (trans.type === "FPRINT_Z_REPORT" && trans.cash != null) {
					totalCash += trans.cash;
				}
			}

			// 3. Дата начала для поиска операций после Z-отчёта
			const sinceDate = new Date(lastFprint.closeDate);
			sinceDate.setMilliseconds(sinceDate.getMilliseconds() + 1);
			const since = formatDateWithTime(sinceDate, false);
			const until = formatDateWithTime(new Date(), true);

			// 4. Получаем все документы после Z-отчёта
			const documents = await this.getDocuments(shopId, since, until);

			for (const doc of documents) {
				for (const trans of doc.transactions) {
					// Наличные платежи в продажах и возвратах
					if (
						trans.type === "PAYMENT" &&
						trans.paymentType === "CASH" &&
						["SELL", "PAYBACK"].includes(doc.type)
					) {
						totalCash +=
							doc.type === "SELL" ? trans.sum || 0 : -(trans.sum || 0);
					}
					// Внесение / изъятие наличных
					else if (
						trans.type === doc.type &&
						["CASH_INCOME", "CASH_OUTCOME"].includes(doc.type)
					) {
						totalCash +=
							doc.type === "CASH_INCOME"
								? trans.sum || 0
								: -(trans.sum || 0);
					}
				}
			}

			return totalCash;
		} catch (error) {
			this._logError(
				`Ошибка при получении остатка наличных для магазина ${shopId}`,
				error,
			);
			return 0;
		}
	}

	/**
	 * Получает данные о остатке денежных средств во всех магазинах.
	 *
	 * @returns {Promise<Record<string, number>>} Объект, где ключи — названия магазинов, значения — их остаток денежных средств.
	 * @throws Пробрасывает ошибку, если не удаётся получить данные.
	 */
	async getCashByShops(): Promise<Record<string, number>> {
		try {
			// Получаем список магазинов
			const shops = await this.getShopNameUuids();
			const reportData: Record<string, number> = {};

			// Проверяем, что список магазинов не пустой
			if (shops && shops.length > 0) {
				for (const shop of shops) {
					try {
						// Получаем остаток денежных средств для текущего магазина
						const cash = await this.getCash(shop.uuid);
						reportData[shop.name] = cash; // Сохраняем данные в результат
						// console.log(
						// 	`Обновлён остаток для магазина "${shop.name}": ${cash}`,
						// );
					} catch (error) {
						// Логируем ошибку для конкретного магазина
						this._logError(
							`Ошибка при получении остатка денежных средств для магазина "${shop.name}"`,
							error,
						);
						reportData[shop.name] = 0; // Устанавливаем значение в 0 для сбоя
					}
				}
			} else {
				console.warn("Список магазинов пуст или не был получен.");
			}

			// Возвращаем собранные данные
			return reportData;
		} catch (error) {
			// Логируем общую ошибку метода
			this._logError(
				"Ошибка при получении данных о денежных средствах для магазинов",
				error,
			);
			throw error; // Пробрасываем ошибку дальше
		}
	}

	/**
	 * Получает все расходы (выплаты) за период из Evo по указанным категориям и их суммирование для каждого магазина.
	 *
	 * @param {string[]} shopUuids - Список UUID магазинов.
	 * @param {string} since - Начальная дата (в формате строки, например, ISO 8601).
	 * @param {string} until - Конечная дата (в формате строки, например, ISO 8601).
	 * @returns {Promise<Record<string, { byCategory: Record<string, number>, total: number }>>} - Объект, где ключи - UUID магазинов, значения - расходы по категориям и общая сумма.
	 * @throws {Error} - В случае ошибки при получении данных.
	 */
	async getExpensesByCategories(
		shopUuids: string[],
		since: string,
		until: string,
	): Promise<
		Record<string, { byCategory: Record<string, number>; total: number }>
	> {
		// Словарь категорий выплат (только указанные категории)
		const paymentCategory: Record<number, string> = {
			3: "Оплата услуг",
			4: "Аренда",
			5: "Заработная плата",
			6: "Прочее",
		};

		// Результирующий объект для хранения расходов по магазинам
		const resultData: Record<
			string,
			{ byCategory: Record<string, number>; total: number }
		> = {};

		// Создаем массив промисов для параллельной обработки каждого магазина
		const fetchPromises = shopUuids.map(async (shopUuid) => {
			try {
				// Инициализация объекта для текущего магазина
				const expensesByCategory: Record<string, number> = {
					"Оплата услуг": 0,
					Аренда: 0,
					"Заработная плата": 0,
					Прочее: 0,
				};
				let totalExpenses = 0;

				// Получение документов типа CASH_OUTCOME
				const cashOutcomeDocuments: Document[] =
					await this.getDocumentsByCashOutcome(shopUuid, since, until);

				// Обработка документов
				for (const doc of cashOutcomeDocuments) {
					for (const trans of doc.transactions) {
						if (
							trans.type === "CASH_OUTCOME" &&
							paymentCategory[trans.paymentCategoryId]
						) {
							const category = paymentCategory[trans.paymentCategoryId];
							expensesByCategory[category] += trans.sum || 0;
							totalExpenses += trans.sum || 0;
						}
					}
				}

				return {
					shopUuid,
					data: { byCategory: expensesByCategory, total: totalExpenses },
				};
			} catch (error) {
				this._logError(
					`Ошибка при получении расходов для магазина с ID: ${shopUuid}`,
					error,
				);
				throw error;
			}
		});

		// Выполняем все запросы параллельно
		const results = await Promise.all(fetchPromises);

		// Формируем результирующий объект
		for (const { shopUuid, data } of results) {
			resultData[shopUuid] = data;
		}

		return resultData;
	}

	/**
	 * Рассчитывает валовую прибыль для магазина за указанный период по группам продуктов.
	 *
	 * Валовая прибыль рассчитывается как разница между доходами от продаж и затратами на товары.
	 * Доход = цена * количество, затраты = себестоимость * количество.
	 *
	 * @param shopId - ID магазина, для которого рассчитывается валовая прибыль.
	 * @param since - Дата начала периода (в формате строки).
	 * @param until - Дата окончания периода (в формате строки).
	 * @param groupIds - Массив идентификаторов групп продуктов.
	 *
	 * @returns {Record<string, number>} Объект, где ключи — названия товаров, значения — их суммарная валовая прибыль.
	 * @throws Пробрасывает ошибку, если не удаётся получить документы или рассчитать прибыль.
	 */
	async getGrossProfitData(
		shopId: string,
		since: string,
		until: string,
		groupIds: string[], // Параметр для групп продуктов
	): Promise<Record<string, number>> {
		try {
			// Получаем документы для магазина за указанный период
			const documents = await this.getDocuments(shopId, since, until);
			const productUuid = await this.getProductsByGroup(shopId, groupIds);

			// Результат для валовой прибыли по каждому товару
			const grossProfitByProduct: Record<string, number> = {};

			// Проходим по всем документам
			for (const doc of documents) {
				if (["SELL", "PAYBACK"].includes(doc.type)) {
					for (const trans of doc.transactions) {
						let totalRevenue = 0;
						let totalCost = 0;

						// Если транзакция типа REGISTER_POSITION, то считаем прибыль по позиции
						if (trans.type === "REGISTER_POSITION") {
							// Проверка, принадлежит ли товар нужной группе
							if (productUuid.includes(trans.commodityUuid)) {
								// Расчет дохода (цена * количество)
								totalRevenue += (trans.price || 0) * (trans.quantity || 0);

								// Расчет затрат (себестоимость * количество)
								totalCost += (trans.costPrice || 0) * (trans.quantity || 0);

								// Добавляем/суммируем валовую прибыль для текущего товара
								if (!grossProfitByProduct[trans.commodityName]) {
									grossProfitByProduct[trans.commodityName] = 0;
								}

								// Разница дохода и затрат
								grossProfitByProduct[trans.commodityName] +=
									totalRevenue - totalCost;
							}
						}
					}
				}
			}

			return grossProfitByProduct;
		} catch (error) {
			// Логируем ошибку, если она произошла
			this._logError(
				`Ошибка при расчете валовой прибыли для магазина: ${shopId}`,
				error,
			); // Логирование ошибки
			throw error; // Пробрасывание ошибки дальше
		}
	}

	/**
	 * Рассчитывает валовую прибыль для магазина за указанный период.
	 *
	 * Валовая прибыль рассчитывается как разница между доходами от продаж и затратами на товары.
	 * Доход = цена * количество, затраты = себестоимость * количество.
	 *
	 * @param shopId - ID магазина, для которого рассчитывается валовая прибыль.
	 * @param since - Дата начала периода (в формате строки).
	 * @param until - Дата окончания периода (в формате строки).
	 * @returns Сумма валовой прибыли.
	 * @throws Пробрасывает ошибку, если не удаётся получить документы или рассчитать прибыль.
	 */
	async getGrossProfit(
		shopId: string,
		since: string,
		until: string,
	): Promise<number> {
		try {
			const documents = await this.getDocuments(shopId, since, until);

			let sumPrGrossProfitace = 0;

			for (const doc of documents) {
				if (["SELL", "PAYBACK"].includes(doc.type)) {
					for (const trans of doc.transactions) {
						let totalRevenue = 0;
						let totalCost = 0;
						if (trans.type === "REGISTER_POSITION") {
							totalRevenue += (trans.price || 0) * (trans.quantity || 0);
							totalCost += trans.costPrice * (trans.quantity || 0);
						}
						sumPrGrossProfitace += totalRevenue - totalCost;
					}
				}
			}
			return sumPrGrossProfitace;
		} catch (error) {
			this._logError(
				`Ошибка при получении документов валовой прибыли для : ${shopId}`,
				error,
			); // Логирование ошибки
			throw error; // Пробрасывание ошибки дальше
		}
	}

	/**
	 * Получает документы с типом "SELL" для указанного магазина за указанный период.
	 *
	 * @param shopId - ID магазина для получения данных о продажах.
	 * @param since - Дата начала периода (в формате строки).
	 * @param until - Дата окончания периода (в формате строки).
	 * @returns Массив документов с типом "SELL".
	 * @throws Пробрасывает ошибку, если не удаётся получить данные о документах.
	 */
	async getSellDocuments(
		shopId: string,
		since: string,
		until: string,
	): Promise<Document[]> {
		try {
			const documents = await this.getDocuments(shopId, since, until); // Запрос данных о документах

			// Фильтруем документы с типом "SELL" и возвращаем
			return documents.filter((doc: Document) => doc.type === "SELL"); // Указание типа для параметра doc
		} catch (error) {
			this._logError(
				`Ошибка при получении документов о продажах для магазина с ID: ${shopId}`,
				error,
			); // Логирование ошибки
			throw error; // Пробрасывание ошибки дальше
		}
	}

	/**
	 * Получает документы по типам "SELL" и "PAYBACK" и вычисляет сумму продаж для определённых товаров.
	 *
	 * @param shopId - ID магазина, для которого необходимо посчитать сумму продаж.
	 * @param since - Дата начала периода (в формате строки).
	 * @param until - Дата окончания периода (в формате строки).
	 * @param productUuids - Список UUID товаров, для которых нужно вычислить сумму продаж.
	 * @returns Сумму продаж для указанных товаров за указанный период.
	 * @throws Пробрасывает ошибку, если не удаётся получить документы или выполнить расчёт.
	 */
	async getSalesSumByDocuments(
		shopId: string,
		since: string,
		until: string,
		productUuids: string[],
	): Promise<number> {
		try {
			// const url = this._replacePlaceholders(this.urls.getSell, [
			// 	shopId,
			// 	since,
			// 	until,
			// ]);
			const documents = await this.getDocuments(shopId, since, until);

			let sumSales = 0;

			for (const doc of documents) {
				if (["SELL", "PAYBACK"].includes(doc.type)) {
					for (const trans of doc.transactions) {
						if (
							trans.type === "REGISTER_POSITION" &&
							productUuids.includes(trans.commodityUuid)
						) {
							sumSales += trans.sum || 0; // Суммируем продажи
						}
					}
				}
			}

			return sumSales; // Возвращаем итоговую сумму продаж
		} catch (error) {
			this._logError(
				`Ошибка при получении и расчете документов для магазина с ID: ${shopId}`,
				error,
			);
			throw error;
		}
	}

	/**
	 * Получает документы по типам "SELL" и "PAYBACK" и вычисляет количество проданных товаров.
	 *
	 * @param shopId - ID магазина, для которого нужно выполнить расчёт.
	 * @param since - Дата начала периода (в формате строки).
	 * @param until - Дата окончания периода (в формате строки).
	 * @param productUuids - Список идентификаторов товаров (UUID), по которым нужно выполнить расчёт.
	 * @returns Объект, где ключи — названия товаров, значения — их суммарное количество.
	 * @throws Пробрасывает ошибку, если не удаётся получить документы или выполнить расчёт.
	 */
	async getSalesSumQuantity(
		shopId: string,
		since: string,
		until: string,
		productUuids: string[],
	): Promise<Record<string, number>> {
		try {
			const documents = await this.getDocuments(shopId, since, until);

			const salesSummary: Record<string, number> = {};

			for (const doc of documents) {
				if (["SELL", "PAYBACK"].includes(doc.type)) {
					for (const trans of doc.transactions) {
						if (
							trans.type === "REGISTER_POSITION" &&
							productUuids.includes(trans.commodityUuid)
						) {
							const productName = trans.commodityName; // Получаем название продукта
							const quantity = trans.quantity; // Получаем количество проданных товаров

							// Проверяем, если продукт уже есть в итогах
							if (!salesSummary[productName]) {
								salesSummary[productName] = 0; // Инициализируем, если еще нет
							}
							salesSummary[productName] += quantity; // Суммируем количество
						}
					}
				}
			}
			return salesSummary;
		} catch (error) {
			this._logError(
				`Ошибка при получении и расчете количества продаж для магазина с ID: ${shopId}`,
				error,
			); // Логируем ошибку
			throw error; // Пробрасываем ошибку дальше
		}
	}

	/**
	 * Получает документы по типам "SELL" и "PAYBACK" и вычисляет количество проданных товаров и общую сумму.
	 *
	 * @param shopId - ID магазина, для которого нужно выполнить расчёт.
	 * @param since - Дата начала периода (в формате строки).
	 * @param until - Дата окончания периода (в формате строки).
	 * @param productUuids - Список идентификаторов товаров (UUID), по которым нужно выполнить расчёт.
	 * @returns Объект, где ключи — названия товаров, значения — объекты с количеством и суммой.
	 * @throws Пробрасывает ошибку, если не удаётся получить документы или выполнить расчёт.
	 */
	async getSalesSumQuantitySum(
		db: D1Database,
		shopId: string,
		since: string,
		until: string,
		productUuids: string[],
	): Promise<Record<string, { quantitySale: number; sum: number }>> {
		try {
			const documents = await this.getDocuments(shopId, since, until);
			// console.log("Полученные документы:", documents);

			const doc = getDocumentsBySales(db, shopId, since, until);
			console.log("since:", since);
			console.log("until", until);

			console.log("Полученные документы: doc", JSON.stringify(doc));

			const salesSummary: Record<
				string,
				{ quantitySale: number; sum: number }
			> = {};

			for (const doc of documents) {
				if (["SELL", "PAYBACK"].includes(doc.type)) {
					// console.log(`Обработка документа типа: ${doc.type}`);
					for (const trans of doc.transactions) {
						if (
							trans.type === "REGISTER_POSITION" &&
							productUuids.includes(trans.commodityUuid)
						) {
							const productName = trans.commodityName; // Название продукта
							const quantity = trans.quantity; // Количество проданных товаров
							const sum = trans.sum; // Сумма продажи

							// console.log(
							// 	`Продукт: ${productName}, Количество: ${quantity}, Сумма: ${sum}`,
							// );

							// Проверяем, если продукт уже есть в итогах
							if (!salesSummary[productName]) {
								salesSummary[productName] = { quantitySale: 0, sum: 0 }; // Инициализируем объект
							}

							// Увеличиваем количество и сумму
							salesSummary[productName].quantitySale += quantity;
							salesSummary[productName].sum += sum;
						}
					}
				}
			}

			// console.log(`Итоговый отчет о продажах:`, salesSummary);
			return salesSummary;
		} catch (error) {
			console.error(
				`Ошибка при выполнении getSalesSumQuantity для магазина ${shopId}`,
				error,
			);
			this._logError(
				`Ошибка при получении и расчете количества продаж для магазина с ID: ${shopId}`,
				error,
			);
			throw error;
		}
	}

	/**
	 * Вычисляет общую сумму продаж для заданного магазина, периода и списка товаров.
	 *
	 * @param shopId - ID магазина, для которого нужно рассчитать сумму продаж.
	 * @param since - Дата начала периода (в формате строки).
	 * @param until - Дата окончания периода (в формате строки).
	 * @param productUuids - Список идентификаторов товаров (UUID), по которым нужно выполнить расчёт.
	 * @returns Общая сумма продаж (в виде числа).
	 * @throws Пробрасывает ошибку, если не удаётся получить документы или выполнить расчёт.
	 */
	async getSalesSum(
		shopId: string,
		since: string,
		until: string,
		productUuids: string[],
	): Promise<number> {
		try {
			const documents = await this.getDocuments(shopId, since, until);

			let salesSummary = 0;

			for (const doc of documents) {
				if (["SELL", "PAYBACK"].includes(doc.type)) {
					for (const trans of doc.transactions) {
						if (
							trans.type === "REGISTER_POSITION" &&
							productUuids.includes(trans.commodityUuid)
						) {
							salesSummary += trans.sum; // Суммируем количество
						}
					}
				}
			}
			return salesSummary;
		} catch (error) {
			this._logError(
				`Ошибка при получении и расчете количества продаж для магазина с ID: ${shopId}`,
				error,
			); // Логируем ошибку
			throw error; // Пробрасываем ошибку дальше
		}
	}

	/**
	 * Получает данные о продажах за текущий день, сгруппированные по магазинам и методам оплаты.
	 *
	 * @returns {Promise<Record<string, Record<string, number>>>} - Данные по продажам по магазинам и методам оплаты.
	 *
	 * @throws {Error} - В случае ошибки при получении данных.
	 */
	async getSalesToday(): Promise<Record<string, Record<string, number>>> {
		try {
			const newDate = new Date(); // Получаем текущую дату
			const since = formatDateWithTime(newDate, false);
			const until = formatDateWithTime(newDate, true);

			const paymentType: PaymentType = {
				CARD: "Банковской картой:",
				ADVANCE: "Предоплатой (зачетом аванса):",
				CASH: "Нал. средствами:",
				COUNTEROFFER: "Встречным предоставлением:",
				CREDIT: "Постоплатой (в кредит):",
				ELECTRON: "Безналичными средствами:",
				UNKNOWN: "Неизвестно. По-умолчанию:",
			};

			const salesByProduct: Record<string, Record<string, number>> = {};
			const shopUuids: string[] = await this.getShopUuids();

			for (const shopUuid of shopUuids) {
				const salesData: Document[] = await this.getDocumentsBySellPayback(
					shopUuid,
					since,
					until,
				);

				for (const doc of salesData) {
					for (const trans of doc.transactions) {
						if (trans.type === "PAYMENT") {
							if (!salesByProduct[shopUuid]) {
								salesByProduct[shopUuid] = {};
							}

							const paymentKey = trans.paymentType as keyof PaymentType;
							const paymentTypeLabel = paymentType[paymentKey];

							if (!salesByProduct[shopUuid][paymentTypeLabel]) {
								salesByProduct[shopUuid][paymentTypeLabel] = 0;
							}
							salesByProduct[shopUuid][paymentTypeLabel] += trans.sum;
						}
					}
				}
			}

			const salesByShopName: Record<string, Record<string, number>> = {};
			for (const shopUuid in salesByProduct) {
				const shopName = await this.getShopName(shopUuid);
				//
				if (!salesByShopName[shopName]) {
					salesByShopName[shopName] = {};
				}

				salesByShopName[shopName] = { ...salesByProduct[shopUuid] };
			}

			const sortedSalesByShopName = Object.entries(salesByShopName)
				.sort(([, a], [, b]) => {
					const sumA = Object.values(a).reduce((acc, value) => acc + value, 0);
					const sumB = Object.values(b).reduce((acc, value) => acc + value, 0);
					return sumB - sumA;
				})
				.reduce((acc: Record<string, Record<string, number>>, [key, value]) => {
					acc[key] = value;
					return acc;
				}, {});

			return sortedSalesByShopName;
		} catch (error) {
			console.error(
				"getSalesToday: ошибка при получении данных о продажах",
				error,
			);
			throw error;
		}
	}

	/**
	 * Получает данные по выплатам в магазине с разбивкой по категориям.
	 *
	 * @param {string[]} shopUuids - Список UUID магазинов.
	 * @param {string} since - Начальная дата (в формате строки).
	 * @param {string} until - Конечная дата (в формате строки).
	 *
	 * @returns {Promise<Record<string, Record<string, number>>>} - Данные по выплатам для каждого магазина с разбивкой по категориям.
	 *
	 * @throws {Error} - В случае ошибки при получении данных.
	 */
	async getDocumentsByCashOutcomeData(
		shopUuids: string[],
		since: string,
		until: string,
	): Promise<Record<string, Record<string, number>>> {
		// Словарь категорий выплат
		const paymentCategory: Record<number, string> = {
			1: "Инкассация",
			2: "Оплата поставщику",
			3: "Оплата услуг",
			4: "Аренда",
			5: "Заработная плата",
			6: "Прочее",
		};

		// Результирующий объект
		const resultData: Record<string, Record<string, number>> = {};

		for (const shopUuid of shopUuids) {
			// Получение имени магазина
			const shopName = await this.getShopName(shopUuid);

			// Инициализация объекта для текущего магазина
			const sumPaymentCategory: Record<string, number> = {};

			// Получение документов типа CASH_OUTCOME
			const cashOutcomeDocuments: Document[] =
				await this.getDocumentsByCashOutcome(shopUuid, since, until);

			for (const doc of cashOutcomeDocuments) {
				for (const trans of doc.transactions) {
					if (trans.type === "CASH_OUTCOME") {
						// Определение категории
						const category = paymentCategory[trans.paymentCategoryId];
						if (category) {
							// Суммирование по категории
							sumPaymentCategory[category] =
								(sumPaymentCategory[category] || 0) + trans.sum;
						}
					}
				}
			}

			// Сохранение данных для текущего магазина
			resultData[shopName] = sumPaymentCategory;
		}

		return resultData;
	}

	/**
	 * Получает отчет по продажам для магазинов по заданным UUID и датам.
	 *
	 * @param {string[]} shopUuids - Список UUID магазинов.
	 * @param {string} since - Начальная дата (в формате строки).
	 * @param {string} until - Конечная дата (в формате строки).
	 *
	 * @returns {Promise<{ salesDataByShopName: Record<string, { sell: Record<string, number>; refund: Record<string, number>; totalSell: number }>, grandTotalSell: number, grandTotaRefund: number, dailySell: Record<string, number> }>}
	 *  - Данные по продажам с разбивкой по магазинам и суммарными данными.
	 *  - dailySell содержит выручку по дням (YYYY-MM-DD → сумма продаж).
	 *
	 * @throws {Error} - В случае ошибки при получении данных.
	 */
	async getSalesgardenReportData(
		shopUuids: string[],
		since: string,
		until: string,
	): Promise<{
		salesDataByShopName: Record<
			string,
			{
				sell: Record<string, number>;
				refund: Record<string, number>;
				totalSell: number;
			}
		>;
		grandTotalSell: number;
		grandTotaRefund: number;
		/**
		 * Выручка по дням (YYYY-MM-DD → сумма продаж) по всем переданным
		 * магазинам вместе.
		 */
		dailySell: Record<string, number>;
	}> {
		try {
			const paymentType: PaymentType = {
				CARD: "Банковской картой:",
				ADVANCE: "Предоплатой (зачетом аванса):",
				CASH: "Нал. средствами:",
				COUNTEROFFER: "Встречным предоставлением:",
				CREDIT: "Постоплатой (в кредит):",
				ELECTRON: "Безналичными средствами:",
				UNKNOWN: "Неизвестно. По-умолчанию:",
			};

			const salesDataByShop: Record<
				string,
				{ sell: Record<string, number>; refund: Record<string, number> }
			> = {};
			const dailySellMap = new Map<string, number>();

			// Проходим по каждому магазину
			for (const shopUuid of shopUuids) {
				const salesData: Document[] = await this.getDocumentsBySellPayback(
					shopUuid,
					since,
					until,
				);

				// Инициализируем структуру данных для текущего магазина
				if (!salesDataByShop[shopUuid]) {
					salesDataByShop[shopUuid] = { sell: {}, refund: {} };
				}

				for (const doc of salesData) {
					const transactionType = doc.type === "PAYBACK" ? "refund" : "sell";
					const day = (doc.closeDate || "").slice(0, 10); // "YYYY-MM-DD"

					for (const trans of doc.transactions) {
						if (trans.type !== "PAYMENT") continue;

						const paymentKey = trans.paymentType as keyof PaymentType;
						const paymentTypeLabel = paymentType[paymentKey];

						// Проверяем корректность paymentKey
						if (!paymentTypeLabel) {
							// console.log(
							// 	`${transactionType.toUpperCase()} Transaction with undefined paymentType:`,
							// 	trans,
							// );
							continue;
						}

						// Инициализируем, если нужно, и добавляем сумму
						if (!salesDataByShop[shopUuid][transactionType][paymentTypeLabel]) {
							salesDataByShop[shopUuid][transactionType][paymentTypeLabel] = 0;
						}

						salesDataByShop[shopUuid][transactionType][paymentTypeLabel] +=
							trans.sum;

						if (transactionType === "sell" && day) {
							dailySellMap.set(day, (dailySellMap.get(day) ?? 0) + trans.sum);
						}
					}
				}
			}

			// Преобразование shopUuid в shopName и сортировка по сумме продаж
			const salesDataByShopName: Record<
				string,
				{
					sell: Record<string, number>;
					refund: Record<string, number>;
					totalSell: number;
				}
			> = {};

			let grandTotalSell = 0;
			let grandTotaRefund = 0;

			for (const shopUuid in salesDataByShop) {
				const shopName = await this.getShopName(shopUuid);

				// Получаем данные по продажам для текущего магазина
				const shopData = salesDataByShop[shopUuid];

				// Считаем сумму всех продаж по всем категориям
				const totalSell = Object.values(shopData.sell).reduce(
					(sum, value) => sum + value,
					0,
				);

				const totalRefund = Object.values(shopData.refund).reduce(
					(sum, value) => sum + value,
					0,
				);

				// Добавляем данные по магазину, включая сумму продаж
				salesDataByShopName[shopName] = {
					...shopData,
					totalSell,
				};
				grandTotalSell += totalSell;
				grandTotaRefund += totalRefund;
			}
			// console.log(grandTotalSell);
			// console.log(grandTotaRefund);

			return {
				salesDataByShopName,
				grandTotalSell,
				grandTotaRefund,
				dailySell: Object.fromEntries(dailySellMap),
			};
		} catch (error) {
			console.error(
				"getSalesData: ошибка при получении данных о продажах",
				error,
			);
			throw error;
		}
	}

	/**
	 * Получает список магазинов.
	 *
	 * @returns {Promise<ShopsResponse>} - Список магазинов.
	 * @throws {Error} - В случае ошибки при получении данных магазинов.
	 */
	async getShops(): Promise<ShopsResponse> {
		return this.getCachedData("shops", () =>
			this._fetchData(this.urls.getShops),
		);
	}

	/**
	 * Получает список UUID магазинов.
	 *
	 * @returns {Promise<string[]>} - Массив UUID магазинов.
	 * @throws {Error} - В случае ошибки при получении данных магазинов.
	 */
	async getShopsName(): Promise<string[]> {
		try {
			// Получаем данные магазинов
			const shopsResponse: ShopsResponse = await this.getShops();

			// Извлекаем uuid для каждого магазина из массива items
			const shopUuids: string[] = shopsResponse.map((shop) => shop.name); // Исправлено с id на uuid

			return shopUuids;
		} catch (error) {
			this._logError("Ошибка при получении списка uuid магазинов", error);
			throw error;
		}
	}

	/**
	 * Получает список UUID магазинов.
	 *
	 * @returns {Promise<string[]>} - Массив UUID магазинов.
	 * @throws {Error} - В случае ошибки при получении данных магазинов.
	 */
	async getShopUuids(): Promise<string[]> {
		try {
			// Получаем данные магазинов
			const shopsResponse: ShopsResponse = await this.getShops();

			// Извлекаем uuid для каждого магазина из массива items
			const shopUuids: string[] = shopsResponse.map((shop) => shop.uuid); // Исправлено с id на uuid

			return shopUuids;
		} catch (error) {
			this._logError("Ошибка при получении списка uuid магазинов", error);
			throw error;
		}
	}

	/**
	 * Получает список UUID и имен магазинов.
	 *
	 * @returns {Promise<ShopUuidName[] | null>} - Массив объектов с UUID и именем магазинов, или null в случае ошибки.
	 * @throws {Error} - В случае ошибки при получении данных.
	 */
	async getShopNameUuids(): Promise<ShopUuidName[] | null> {
		try {
			// Получаем данные магазинов
			const shopsResponse = await this.getShops();

			// Проверяем, был ли запрос успешным
			// Проверяем, является ли shopsResponse массивом объектов с uuid и name
			if (!Array.isArray(shopsResponse)) {
				this._logError(
					"Некорректный формат ответа при получении магазинов",
					shopsResponse,
				);
				return null; // Возвращаем null, если формат ответа не соответствует ожиданиям
			}

			// Предполагаем, что `shopsResponse` содержит метод `.json()` для парсинга тела
			const shopsData: ShopsResponse = await shopsResponse;

			// Формируем массив объектов с UUID и именем
			const result = shopsData.map((shop) => ({
				uuid: shop.uuid,
				name: shop.name,
			}));

			return result; // Возвращаем массив объектов
		} catch (error) {
			this._logError("Ошибка при получении списка uuid магазинов", error);
			return null; // Возвращаем null в случае ошибки
		}
	}

	/**
	 * Получает список магазинов и возвращает объект, где ключ — uuid, значение — name.
	 * @returns {Promise<Record<string, string> | null>} - Объект вида { uuid: name, ... } или null в случае ошибки.
	 */
	async getShopNameUuidsDict(): Promise<Record<string, string> | null> {
		try {
			const shopsResponse = await this.getShops();

			if (!Array.isArray(shopsResponse)) {
				this._logError(
					"Некорректный формат ответа при получении магазинов",
					shopsResponse,
				);
				return null;
			}

			const result: Record<string, string> = {};
			for (const shop of shopsResponse) {
				result[shop.uuid] = shop.name;
			}

			return result;
		} catch (error) {
			this._logError("Ошибка при получении списка uuid магазинов", error);
			return null;
		}
	}

	/**
	 * Получает имя магазина по его UUID.
	 *
	 * @param {string} shopUuid - UUID магазина, имя которого нужно получить.
	 * @returns {Promise<string>} - Имя магазина, или сообщение о ненайденном магазине.
	 * @throws {Error} - Если возникла ошибка при получении списка магазинов.
	 */
	async getShopName(shopUuid: string): Promise<string> {
		try {
			const shopsResponse: Shop[] = await this.getShops(); // Получаем список магазинов напрямую

			// Проверяем, является ли shopsResponse массивом
			if (!Array.isArray(shopsResponse)) {
				throw new Error("Некорректный ответ: отсутствует список магазинов");
			}

			// Ищем магазин по UUID
			const shop: Shop | undefined = shopsResponse.find(
				(shop) => shop.uuid === shopUuid,
			);

			return shop ? shop.name : "Магазин не найден"; // Возвращаем имя или сообщение о ненайденном магазине
		} catch (error) {
			this._logError(
				`Ошибка при получении имени магазина с ID: ${shopUuid}`,
				error,
			);
			throw error; // Пробрасываем ошибку дальше
		}
	}

	/**
	 * Получает первый документ с типом "OPEN_SESSION" для каждого магазина в заданный период.
	 *
	 * @param {string} since - Начальная дата периода в формате строки (например, ISO 8601).
	 * @param {string} until - Конечная дата периода в формате строки (например, ISO 8601).
	 * @param {string} userUuid - UUID пользователя, для которого ищется документ.
	 * @returns {Promise<string | null>} Возвращает UUID магазина, если найден первый документ "OPEN_SESSION" для указанного пользователя, или null, если такого документа нет.
	 * @throws {Error} Пробрасывает ошибку, если запросы или обработка данных не удались.
	 */
	async getFirstOpenSession(
		since: string,
		until: string,
		userUuid: string,
	): Promise<string | null> {
		try {
			const shopsId = await this.getShopUuids(); // Получаем все ID магазинов
			for (const shopId of shopsId) {
				// console.log(shopId);
				const documents = await this.getDocuments(shopId, since, until);
				// console.log("OPEN_SESSION", documents.length);

				if (documents && documents.length > 0) {
					const openSession = documents.find(
						(doc: Document) =>
							doc.type === "OPEN_SESSION" && doc.openUserUuid === userUuid,
					);

					if (openSession) {
						return shopId; // Возвращаем storeUuid
					}
				}
			}

			// Если подходящий документ не найден для всех магазинов, возвращаем null
			return null;
		} catch (error) {
			this._logError(
				"Ошибка при получении первого документа OPEN_SESSION",
				error,
			); // Логируем ошибку
			throw error; // Пробрасываем ошибку дальше
		}
	}

	/**
	 * Получает список продуктов для указанного магазина.
	 *
	 * @param {string} shopId - ID магазина, для которого нужно получить продукты.
	 * @returns {Promise<ProductsResponse>} - Продукты магазина, или ошибка в случае неудачи.
	 * @throws {Error} - Если возникла ошибка при получении данных о продуктах.
	 */
	async getProducts(shopId: string): Promise<ProductsResponse> {
		try {
			// Заменяем плейсхолдер в URL на shopId
			const url = this._replacePlaceholders(this.urls.getProducts, [shopId]);
			// Получаем данные с помощью fetch
			return await this._fetchData(url);
		} catch (error) {
			// Логируем ошибку
			this._logError(
				`Ошибка при получении продуктов для магазина с ID: ${shopId}`,
				error,
			);
			throw error; // Пробрасываем ошибку дальше
		}
	}

	/**
	 * Получает список групп продуктов с их UUID для указанного магазина.
	 *
	 * @param {string} shopId - ID магазина для получения групп продуктов.
	 * @returns {Promise<{name: string; uuid: string}[] | null>} - Массив групп с их названиями и UUID, или null в случае ошибки.
	 */
	async getGroupsByNameUuid(
		shopId: string,
	): Promise<{ name: string; uuid: string }[] | null> {
		try {
			// Получаем ответ от getProducts
			const response: ProductsResponse = await this.getProducts(shopId);

			// Проверяем, что response является массивом
			if (!Array.isArray(response)) {
				this._logError(
					"Некорректный формат ответа при получении магазинов",
					response,
				);
				return null; // Возвращаем null, если формат ответа не соответствует ожиданиям
			}

			// Фильтруем продукты, оставляя только группы, и возвращаем {name, uuid}
			const groups = response
				.filter((product: Product) => product.group === true)
				.map((group: Product) => ({
					name: group.name,
					uuid: group.uuid,
				}));

			return groups;
		} catch (error) {
			// Логируем ошибку и возвращаем null в случае ошибки
			this._logError(
				`Ошибка при получении групп продуктов для магазина с ID: ${shopId}`,
				error,
			);
			return null; // Возвращаем null в случае ошибки
		}
	}

	/**
	 * Получает названия групп продуктов по переданным UUID для магазина.
	 *
	 * @param {string} shopId - ID магазина, для которого выполняется запрос.
	 * @param {string[]} uuids - Массив UUID групп, которые нужно отфильтровать.
	 * @returns {Promise<string[]>} - Массив названий групп.
	 * @throws {Error} - Ошибка при запросе продуктов или фильтрации.
	 */
	async getGroupsByName(shopId: string, uuids: string[]): Promise<string[]> {
		try {
			// Получаем ответ от getProducts
			const response: ProductsResponse = await this.getProducts(shopId);

			// Проверяем, что response является массивом
			if (!Array.isArray(response)) {
				throw new Error("Ответ от getProducts не является массивом.");
			}

			// Фильтруем продукты, оставляя только группы, и возвращаем {name, uuid}
			const groups = response
				.filter((product: Product) => product.group === true)
				.map((group: Product) => ({
					name: group.name,
					uuid: group.uuid,
				}));

			// Отбираем только те группы, uuid которых содержится в переданном списке uuids
			const filteredGroupUuids = groups
				.filter((group) => uuids.includes(group.uuid))
				.map((group) => group.name);

			return filteredGroupUuids;
		} catch (error) {
			this._logError(
				`Ошибка при получении групп продуктов для магазина с ID: ${shopId}`,
				error,
			);
			throw error;
		}
	}

	/**
	 * Получает данные о товарных остатках по группе и возвращает информацию о цене и количестве
	 * для каждого продукта в указанной группе.
	 *
	 * @param {string} shopId - ID магазина, для которого получаем данные
	 * @param {string[]} groupIds - Массив идентификаторов групп товаров
	 * @param {string} priceKey - Ключ для получения цены товара
	 * @returns {Promise<Record<string, { price: number; quantity: number }>>} - Объект с данными о товарах (цена и количество)
	 * @throws {Error} - Если ответ от API не является массивом или если группа не найдена
	 */
	async getStockByGroup(
		shopId: string,
		groupIds: string[],
		priceKey: string, // Переименовано для более ясного обозначения, что это ключ цены
	): Promise<Record<string, { sum: number; quantity: number }>> {
		// Получаем продукты для магазина
		const products: ProductsResponse = await this.getProducts(shopId);

		// Проверяем, что response является массивом
		if (!Array.isArray(products)) {
			throw new Error("Ответ от getProducts не является массивом.");
		}

		return products
			.filter(
				(prod) => groupIds.includes(prod.parentUuid) && prod.quantity !== 0, // Проверяем принадлежность группе и наличие ненулевого количества
			)
			.reduce(
				(acc, prod) => {
					const sum = prod[priceKey] * prod.quantity;
					acc[prod.name] = { sum, quantity: prod.quantity };
					return acc;
				},
				{} as Record<string, { sum: number; quantity: number }>,
			);
	}

	async getProductStockByGroups(
		shopId: string,
		groupIds: string[],
	): Promise<
		Record<string, { name: string; quantity: number; costPrice: number }>
	> {
		// Получаем продукты для магазина
		const products: ProductsResponse = await this.getProducts(shopId);

		// Проверяем, что response является массивом
		if (!Array.isArray(products)) {
			throw new Error("Ответ от getProducts не является массивом.");
		}

		// Фильтруем продукты и формируем результат
		return products
			.filter(
				(prod) => groupIds.includes(prod.parentUuid) && prod.quantity !== 0, // Проверяем принадлежность группе и наличие ненулевого количества
			)
			.reduce(
				(acc, prod) => {
					acc[prod.uuid] = {
						name: prod.name,
						quantity: prod.quantity,
						costPrice: prod.costPrice,
					};
					return acc;
				},
				{} as Record<
					string,
					{ name: string; quantity: number; costPrice: number }
				>,
			);
	}

	/**
	 * Расчет оптимального заказа на основе истории продаж и анализа периодов.
	 * @param params - Объект с параметрами:
	 * - shopId: Идентификатор магазина.
	 * - groups: Массив групп товаров.
	 * - since: Дата начала периода для прогноза (включительно).
	 * - until: Дата окончания периода для прогноза (включительно).
	 * - periods: Количество анализируемых периодов.
	 * @returns ??????
	 */
	async getOrder(params: {
		shopId: string;
		groups: string[];
		since: string;
		until: string;
		periods: number;
	}): Promise<Record<string, Record<string, number>>> {
		// Расчет периодов
		const dateRanges = calculateDateRanges(
			params.since,
			params.until,
			params.periods,
		);

		// Получаем UUID товаров из групп
		const productUuids = await this.getProductsByGroup(
			params.shopId,
			params.groups,
		);

		const stockProduct = await this.getProductStockByGroups(
			params.shopId,
			params.groups,
		);
		// console.log(stockProduct);
		const resultData: Record<string, number[]> = {};

		// Обрабатываем каждый период
		for (const [since, until] of dateRanges) {
			// Получаем документы (продажи) для текущего периода
			const documents = await this.getDocuments(params.shopId, since, until);

			// Если документы найдены, продолжаем обработку
			if (documents) {
				// Обрабатываем каждый документ
				for (const doc of documents) {
					// Оставляем только продажи
					if (["SELL"].includes(doc.type)) {
						// Обрабатываем каждую транзакцию в документе
						for (const trans of doc.transactions) {
							// Фильтруем транзакции по типу "REGISTER_POSITION" и проверяем товар по UUID
							if (
								trans.type === "REGISTER_POSITION" &&
								productUuids.includes(trans.commodityUuid)
							) {
								// Добавляем продажи в resultData для соответствующего товара
								if (!resultData[trans.commodityUuid]) {
									// Инициализируем массив для товара, если его еще нет
									resultData[trans.commodityUuid] = new Array(
										params.periods,
									).fill(0);
								}

								// Суммируем продажи для товара в каждом периоде
								for (let i = 0; i < dateRanges.length; i++) {
									const [start, end] = dateRanges[i];
									const transDate = new Date(trans.creationDate);
									if (
										transDate >= new Date(start) &&
										transDate <= new Date(end)
									) {
										// Добавляем количество продажи в текущий период
										resultData[trans.commodityUuid][i] += trans.quantity;
									}
								}
							}
						}
					}
				}
			}
		}

		// После того как мы собрали данные по продажам, применяем расчёт SMA
		const smaData: Record<string, number> = {};

		// Для каждого товара рассчитываем SMA
		for (const [commodityUuid, sales] of Object.entries(resultData)) {
			const sma = this.calculateSMA(sales, params.periods);
			smaData[commodityUuid] = sma[sma.length - 1]; // Берем последнее значение SMA
		}

		const optimalOrder: Record<string, Record<string, number>> = {};

		for (const [commodityUuid, smaValue] of Object.entries(smaData)) {
			// Получаем остаток на складе для товара
			const stockQuantity = stockProduct[commodityUuid].quantity || 0;

			// console.log(
			// 	`${stockProduct[commodityUuid].name}sma:${Math.ceil(smaValue)}/ stock:${stockProduct[commodityUuid].quantity}/ sum:${sum}`,
			// );

			// Вычисляем оптимальный заказ
			const orderQuantity = Math.max(0, Math.ceil(smaValue) - stockQuantity);
			const sum =
				orderQuantity === 0
					? 0
					: Number(
							(orderQuantity * stockProduct[commodityUuid].costPrice).toFixed(
								2,
							),
						);

			optimalOrder[stockProduct[commodityUuid].name] = {
				orderQuantity: orderQuantity,
				smaQuantity: Number(smaValue.toFixed(1)),
				quantity: stockQuantity,
				sum: sum,
			};
		}

		return optimalOrder;
	}

	/**
	 * Получает список UUID продуктов, относящихся к заданным группам для магазина.
	 *
	 * @param {string} shopId - ID магазина
	 * @param {string[]} groupIds - Массив идентификаторов групп продуктов
	 * @returns {Promise<string[]>} - Массив UUID продуктов
	 * @throws {Error} - Если ответ от API не является массивом или происходит ошибка при запросе
	 */
	async getProductsByGroup(
		shopId: string,
		groupIds: string[],
	): Promise<string[]> {
		try {
			// Получаем продукты для магазина
			const response: ProductsResponse = await this.getProducts(shopId);
			// ProductsResponse = { paging, items: Product[] }
			const items = Array.isArray(response) ? response : (response as any).items;

			// Проверяем, что items является массивом
			if (!Array.isArray(items)) {
				throw new Error("Ответ от getProducts не является массивом.");
			}

			// Формируем список идентификаторов продуктов, относящихся к заданным группам
			const productsUuid: string[] = items
				.filter(
					(product: Product) =>
						product.parentUuid !== undefined &&
						groupIds.includes(product.parentUuid),
				)
				.map((product: Product) => product.uuid);

			return productsUuid;
		} catch (error) {
			this._logError(
				`Ошибка при получении продуктов по группам для магазина с ID: ${shopId}`,
				error,
			);
			throw error;
		}
	}

	/**
	 * Получает план продаж для продуктов на основе заданной даты и UUID продуктов.
	 *
	 * @param {Date} datePlan - Дата плана, для которого рассчитывается прогноз.
	 * @param {string[]} productUuids - Массив UUID продуктов, для которых рассчитываются продажи.
	 * @returns {Promise<Record<string, number>>} - Объект, где ключ - ID магазина, а значение - скорректированные продажи.
	 * @throws {Error} - При ошибке получения данных или вычислений.
	 */
	async getPlan(
		datePlan: Date,
		productUuids: string[],
	): Promise<Record<string, number>> {
		const shopUuids: string[] = await this.getShopUuids();
		const datPlan: Record<string, number> = {};

		// Предполагается, что getDateRangesForWeeks возвращает массив дат или интервалов для анализа
		const weekOffsets = [7, 14, 21, 28];
		const dateRanges = getDateRangesForWeeks(datePlan, weekOffsets);

		// Параллельно считаем продажи по каждому магазину, кроме исключения
		await Promise.all(
			shopUuids.map(async (shopId) => {
				if (shopId === "20231001-6611-407F-8068-AC44283C9196") return;

				const sumSales = await this.calculateSalesForShop(
					shopId,
					productUuids,
					dateRanges,
				);

				// Корректируем полученное значение
				const adjustedSales = this.adjustSales(sumSales);

				datPlan[shopId] = adjustedSales;
			}),
		);

		return datPlan;
	}

	// Вспомогательный метод для расчета продаж по магазину
	private async calculateSalesForShop(
		shopId: string,
		productUuids: string[],
		dateRanges: [string, string][],
	): Promise<number> {
		let sumSalesToday = 0;

		for (const [since, until] of dateRanges) {
			const sumSalesData: number = await this.getSalesSum(
				shopId,
				since,
				until,
				productUuids,
			);
			sumSalesToday += sumSalesData;
		}

		return sumSalesToday;
	}

	// Вспомогательный метод для корректировки продаж
	private adjustSales(sumSalesLast4Weeks: number): number {
		if (sumSalesLast4Weeks <= 0) {
			return 5200; // минимальный план
		}

		// Среднее за ДЕНЬ (4 недели = 28 дней)
		let dailyAverage = Math.floor(sumSalesLast4Weeks / 28);

		// Небольшая корректировка
		if (dailyAverage > 15000) {
			dailyAverage = Math.floor(dailyAverage * 1.05); // +5% при хороших продажах
		} else if (dailyAverage < 5200) {
			dailyAverage = 5200;
		}

		return dailyAverage;
	}

	/**
	 * Функция для вычисления Simple Moving Average (SMA) для данных.
	 * @param data - Массив данных для вычисления среднего.
	 * @param period - Количество периодов, по которым нужно вычислять SMA.
	 * @returns Массив SMA для каждого товара по периодам.
	 */
	private calculateSMA(data: number[], period: number): number[] {
		const sma: number[] = [];

		for (let i = 0; i < data.length; i++) {
			if (i + 1 >= period) {
				const sum = data
					.slice(i + 1 - period, i + 1)
					.reduce((acc, value) => acc + value, 0);
				sma.push(sum / period);
			} else {
				sma.push(0); // Если недостаточно данных для вычисления SMA
			}
		}

		return sma;
	}

	private async _fetchData(url: string): Promise<any> {
		const now = Date.now();
		const wait = Math.max(0, this.#baseDelay - (now - this.#lastRequestTime));
		if (wait > 0) {
			await new Promise((resolve) => setTimeout(resolve, wait));
		}
		this.#lastRequestTime = Date.now();
		try {
			const response = await fetch(url, { headers: this.headers });
			const responseBody = await response.text();

			if (response.status === 429) {
				const retryAfter = response.headers.get("Retry-After");
				const retrySec = retryAfter ? parseInt(retryAfter, 10) : 0;
				this.#baseDelay = Math.min((this.#baseDelay || 100) * 2, 30_000);
				this.#lastRequestTime = Date.now() + (retrySec > 0 ? retrySec * 1000 : this.#baseDelay);
				throw new Error(`Ошибка HTTP: 429, тело ответа: ${responseBody}`);
			}

			if (!response.ok) {
				throw new Error(`Ошибка HTTP: ${response.status}, тело ответа: ${responseBody}`);
			}

			// Успех — сбрасываем задержку
			this.#baseDelay = 500;
			return JSON.parse(responseBody);
		} catch (error) {
			this._logError(`Ошибка запроса к URL ${url}`, error);
			throw error;
		}
	}

	/**
	 * Получение сводной информации по товарам за указанный диапазон дат.
	 * Возвращает:
	 * - остаток на складе,
	 * - общее количество продаж за период,
	 * - дату последней продажи.
	 *
	 * @param params - Объект параметров:
	 *   - shopId: ID магазина
	 *   - groups: массив групп товаров
	 *   - since: дата начала анализа (включительно)
	 *   - until: дата окончания анализа (включительно)
	 *
	 * @returns Массив объектов:
	 *   [
	 *     {
	 *       name: string,            // название товара
	 *       quantity: number,        // остаток на складе
	 *       sold: number,            // количество продаж за период
	 *       lastSaleDate: string|null // дата последней продажи dd.mm.yyyy
	 *     }
	 *   ]
	 */
	async getSalesSummary(params: {
		shopId: string;
		groups: string[];
		since: string;
		until: string;
	}): Promise<
		Array<{
			name: string;
			quantity: number;
			sold: number;
			lastSaleDate: string | null;
		}>
	> {
		// Получаем UUID товаров
		const productUuids = await this.getProductsByGroup(
			params.shopId,
			params.groups,
		);

		// Остатки товаров
		const stockProduct = await this.getProductStockByGroups(
			params.shopId,
			params.groups,
		);

		// Словарь для накопления информации по продажам
		const salesInfo: Record<
			string,
			{
				sold: number;
				lastSale: Date | null;
			}
		> = {};

		// Инициализируем для всех товаров
		for (const uuid of productUuids) {
			salesInfo[uuid] = {
				sold: 0,
				lastSale: null,
			};
		}

		// Загружаем документы только один раз за весь период
		const documents = await this.getDocuments(
			params.shopId,
			params.since,
			params.until,
		);

		if (documents) {
			for (const doc of documents) {
				if (doc.type !== "SELL") continue;

				for (const trans of doc.transactions) {
					if (
						trans.type === "REGISTER_POSITION" &&
						productUuids.includes(trans.commodityUuid)
					) {
						const uuid = trans.commodityUuid;

						// Суммируем количество продаж
						salesInfo[uuid].sold += trans.quantity;

						const transDate = new Date(trans.creationDate);

						// Обновляем дату последней продажи
						if (
							!salesInfo[uuid].lastSale ||
							transDate > salesInfo[uuid].lastSale
						) {
							salesInfo[uuid].lastSale = transDate;
						}
					}
				}
			}
		}

		// Формируем результат
		const result: Array<{
			name: string;
			quantity: number;
			sold: number;
			lastSaleDate: string | null;
		}> = [];

		for (const uuid of Object.keys(stockProduct)) {
			const item = stockProduct[uuid];
			const sales = salesInfo[uuid];

			const formattedDate =
				sales.lastSale != null
					? sales.lastSale.toLocaleDateString("ru-RU")
					: null;

			result.push({
				name: item.name,
				quantity: item.quantity ?? 0,
				sold: sales.sold ?? 0,
				lastSaleDate: formattedDate,
			});
		}

		return result;
	}

	/**
	 * Логирует ошибки
	 */
	private _logError(message: string, error: unknown): void {
		if (error instanceof Error) {
			console.error(`${message}: ${error.message}`); // Логирование сообщения ошибки
			if ((error as any).response) {
				console.error(`Ответ API: ${JSON.stringify((error as any).response)}`); // Логирование ответа API
			}
		} else {
			console.error(`${message}: Неизвестная ошибка`, error); // Логирование неизвестной ошибки
		}
	}

	/**
	 * Заменяет плейсхолдеры в URL
	 * @param url - URL с плейсхолдерами
	 * @param params - Массив параметров для подстановки
	 * @returns Обновленный URL
	 */
	private _replacePlaceholders(url: string, params: string[]): string {
		return url.replace(/{}/g, () => params.shift()!); // Подстановка параметров в URL
	}
}
