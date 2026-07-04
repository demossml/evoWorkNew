/**
 * Интерфейс для описания сотрудника
 */
export interface Employee {
	lastName: string;
	uuid: string;
	id: string; // Уникальный идентификатор сотрудника
	name: string; // Имя сотрудника
	last_name?: string; // Фамилия сотрудника (опционально)
	patronymic_name?: string; // Отчество сотрудника (опционально)
	phone?: number; // Номер телефона сотрудника (опционально)
	stores: string[]; // Массив идентификаторов магазинов, где работает сотрудник
	role: "ADMIN" | "CASHIER" | "MANUAL"; // Роль сотрудника в системе
	role_id: string; // Уникальный идентификатор роли сотрудника
	user_id: string; // Идентификатор пользователя Эвотор
	created_at: string; // Дата и время создания записи о сотруднике
	updated_at: string; // Дата и время последнего обновления записи
}

export interface Document {
	shop_id: string;
	type: /** Открытие смены (кассовой сессии) */
	| "OPEN_SESSION"
		/** Закрытие смены (кассовой сессии) */
		| "CLOSE_SESSION"
		/** Внесение наличных в кассу */
		| "CASH_INCOME"
		/** Приём товара на склад */
		| "ACCEPT"
		/** Продажа товара */
		| "SELL"
		/** Возврат продажи (возврат денег покупателю) */
		| "PAYBACK"
		/** Возврат товара (возврат на склад) */
		| "RETURN"
		/** Покупка товара (закупка) */
		| "BUY"
		/** Возврат закупки (возврат поставщику) */
		| "BUYBACK"
		/** X-отчёт (промежуточный отчёт без обнуления) */
		| "X_REPORT"
		/** Z-отчёт (итоговый отчёт с обнулением) */
		| "Z_REPORT"
		/** Корректировка документа (исправление ошибок) */
		| "CORRECTION"
		/** Операция оплаты (например, оплата по карте/наличными) */
		| "PAYMENT"
		/** Выплата наличных из кассы */
		| "CASH_OUTCOME"
		/** Внесение наличных в кассу (дублируется, возможно для разных сценариев) */
		| "CASH_INCOME";

	id: string; // Уникальный идентификатор документа
	extras: Record<string, unknown>; // Дополнительная информация о документе
	number: number; // Порядковый номер документа
	closeDate: string; // Дата и время закрытия документа
	time_zone_offset: number; // Смещение часового пояса
	session_id: string; // Уникальный идентификатор смены
	session_number: number; // Порядковый номер смены
	close_user_id: string; // Идентификатор сотрудника, создавшего документ
	device_id: string; // Идентификатор смарт-терминала
	store_id: string; // Идентификатор магазина
	storeUuid: string; // UUID магазина
	user_id: string; // Идентификатор пользователя Эвотор
	version?: string; // Версия схемы документа
	counterparties?: Counterparty[]; // Массив контрагентов, если применимо
	body: DocumentBody; // Основная информация о документе
	openUserUuid: string;
	transactions: Transaction[];
}

// Пример интерфейса для Transaction
export interface Transaction {
	total: number;
	userUuid: string;
	type:
		| "PAYMENT"
		| "REFUND"
		| "REGISTER_POSITION"
		| "CASH_OUTCOME"
		| "FPRINT_Z_REPORT"
		| "CASH_INCOME";
	paymentType: string;
	sum: number;
	commodityUuid: string;
	paymentCategoryId: number;
	price: number;
	costPrice: number;
	quantity: number;
	commodityName: string;
	cash: number;
	closeDate: string;
	creationDate: string;
}

export interface SalesData {
	transactions: Transaction[];
}

// Интерфейс для контрагентов
export interface Counterparty {
	id: string; // Идентификатор контрагента
	full_name: string; // Полное наименование контрагента
	inn?: string; // ИНН контрагента
	kpp?: string; // КПП контрагента
	phones?: string[]; // Список номеров телефонов
	addresses?: string[]; // Список адресов
	role: "AGENT" | "SUBAGENT" | "PRINCIPAL" | "TRANSACTION_OPERATOR"; // Роль контрагента
	role_properties?: RoleProperties; // Свойства роли, если применимо
}

// Интерфейс для свойств роли
export interface RoleProperties {
	agent_type?:
		| "AGENT"
		| "COMMISSIONER"
		| "ATTORNEY_IN_FACT"
		| "PAYMENT_AGENT"
		| "BANK_PAYMENT_AGENT"; // Тип агента
	subagentType?: "PAYMENT_SUBAGENT" | "BANK_PAYMENT_SUBAGENT"; // Тип субагента
	short_name?: string; // Краткое наименование контрагента
	type: "LEGAL_ENTITY" | "INDIVIDUAL_ENTREPRENEUR" | "GOVERNMENT_AGENCY"; // Тип контрагента
}

// Основная информация о документе
export interface DocumentBody {
	positions: Position[]; // Массив товаров
}

// Интерфейс для товара
export interface Position {
	quantity: number; // Количество товара
	initial_quantity: number; // Остаток товара до выполнения операции
	sum: number; // Отпускная стоимость товарной позиции
	measure_name: string; // Единица измерения
	product_name: string; // Наименование товара
	product_id: string; // Идентификатор товара
	price: number; // Закупочная стоимость единицы товара
	tare_volume?: number; // Ёмкость тары
	alcohol_product_kind_code?: number; // Код вида алкогольной продукции
	alcohol_by_volume?: number; // Крепость алкогольной продукции
	extra_keys?: ExtraKey[]; // Массив дополнительных атрибутов
}

// Интерфейс атрибутов товара
export interface ExtraKey {
	identity: string; // Уникальный идентификатор дополнительного атрибута
	description: string; // Описание дополнительного атрибута
	app_id: string; // Идентификатор приложения
}

export interface Shop {
	id: string; // Уникальный идентификатор магазина
	name: string; // Имя магазина
	address?: string; // Адрес магазина (необязательное поле)
	user_id: string; // Идентификатор пользователя
	created_at: string; // Дата и время создания объекта
	updated_at: string; // Дата и время обновления данных объекта
	uuid: string;
}

export interface Paging {
	next_cursor: string; // Значение параметра cursor для получения следующей страницы
}

export interface ShopsResponse extends Array<Shop> {
	paging: Paging; // Информация о следующей странице
	items: Shop[]; // Список магазинов пользователя Эвотор
}

// Интерфейс для одного продукта
export interface ProductUuid {
	uuid: string; // Идентификатор продукта
	group: boolean; // Группа товара (или флаг, что он в какой-то группе)
	parentUuid: string; // Идентификатор родительского элемента (если есть)
	name: string;
	shopId: string;
}

export interface Product {
	type: string; // Тип товара или модификации товара
	name: string; // Название товара (услуги) или модификации товара
	code?: string; // Код товара или модификации товара
	price: number; // Отпускная цена товара (услуги) или модификации товара
	measure_name: string; // Единица измерения для товара или модификации товара
	is_excisable?: boolean; // Указывает, является ли товар подакцизным
	is_age_limited?: boolean; // Определяет, установлены ли возрастные ограничения для товара
	tax: string; // Код ставки НДС для товара или модификации товара
	allow_to_sell: boolean; // Признак разрешения продажи
	description?: string; // Описание товара или модификации товара
	article_number?: string; // Артикул товара или модификации товара
	parentUuid?: string; // Уникальный идентификатор группы или группы модификаций
	id: string; // Идентификатор товара, услуги или модификации
	store_id: string; // Идентификатор магазина, в базе которого хранится товар
	user_id: string; // Идентификатор пользователя Эвотор
	created_at: string; // Дата и время создания объекта
	updated_at: string; // Дата и время обновления данных объекта
	uuid: string; // UUID товара
	group: boolean; // Является ли товар группой
}

export interface ProductsResponse {
	paging: Paging; // Информация о следующей странице
	items: Product[]; // Список товаров и услуг
}

// Основной интерфейс для функции getSalesSumQuantity
export interface SalesSummary {
	[productUuid: string]: number; // Ключ — UUID продукта, значение — количество продаж
}

// Интерфейс для типов оплаты
export interface PaymentType {
	CARD: string;
	ADVANCE: string;
	CASH: string;
	COUNTEROFFER: string;
	CREDIT: string;
	ELECTRON: string;
	UNKNOWN: string;
}
export interface ShopUuidName {
	uuid: string; // UUID магазина
	name: string; // Имя магазина
}

export interface PaymentInfo {
	paymentType: string;
	sum: number;
}

export interface TransactionSale {
	productName: string;
	quantity: number;
	price: number;
	costPrice: number;
	sum: number;
}

export interface SalesInfo {
	type: "SALE" | "PAYBACK"; // Тип транзакции: продажа или возврат
	shopName: string;
	closeDate: string;
	employeeName: string;
	paymentData: PaymentInfo[];
	transactions: TransactionSale[];
}

export interface IndexDocument {
	closeDate: string;
	number: number;
	openUserUuid: string;
	shop_id: string;
	type:
		| "OPEN_SESSION"
		/** Закрытие смены (кассовой сессии) */
		| "CLOSE_SESSION"
		/** Внесение наличных в кассу */
		| "CASH_INCOME"
		/** Приём товара на склад */
		| "ACCEPT"
		/** Продажа товара */
		| "SELL"
		/** Возврат продажи (возврат денег покупателю) */
		| "PAYBACK"
		/** Возврат товара (возврат на склад) */
		| "RETURN"
		/** Покупка товара (закупка) */
		| "BUY"
		/** Возврат закупки (возврат поставщику) */
		| "BUYBACK"
		/** X-отчёт (промежуточный отчёт без обнуления) */
		| "X_REPORT"
		/** Z-отчёт (итоговый отчёт с обнулением) */
		| "Z_REPORT"
		/** Корректировка документа (исправление ошибок) */
		| "CORRECTION"
		/** Операция оплаты (например, оплата по карте/наличными) */
		| "PAYMENT"
		/** Выплата наличных из кассы */
		| "CASH_OUTCOME"
		/** Внесение наличных в кассу (дублируется, возможно для разных сценариев) */
		| "CASH_INCOME"; // уточни типы, если они другие
	transactions: Transaction[]; // нужно описать интерфейс Transaction
}
export interface ShopQuery {
	shopId: string;
	since: string;
	until: string;
}

export interface SalesStats {
	totalSum: number;
	quantityByProduct: Record<string, number>;
}
