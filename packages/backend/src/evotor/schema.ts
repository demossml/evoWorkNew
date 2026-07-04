import { z } from "zod";

export const employeeSchema = z.object({
	lastName: z.string().describe("Employee Surname"),
	uuid: z.string().describe("Employee Unique Identifier in Evotor System"),
	id: z.string().describe("Employee Unique Id in Our Database"),
	name: z.string().describe("Employee Full Name"),
	last_name: z.string().optional().describe("Employee Surname").optional(),
	patronymicName: z
		.string()
		.nullable()
		.optional()
		.describe("Employee Patronymic Name")
		.optional(),
	phone: z
		.number()
		.nullable()
		.optional()
		.describe("Employee Phone Number")
		.optional(),
	stores: z.array(z.string()).optional(),
	role: z.union([
		z.literal("ADMIN"),
		z.literal("CASHIER"),
		z.literal("MANUAL"),
	]),
	role_id: z.string().optional(),
	user_id: z.string().optional(),
	created_at: z.string().optional(),
	updated_at: z.string().optional(),
	code: z.string().nullable(),
});

// export const transactionSchema = z.object({
// 	type: z
// 		.union([
// 			z.literal("PAYMENT"),
// 			z.literal("REFUND"),
// 			z.literal("REGISTER_POSITION"),
// 			z.literal("CASH_OUTCOME"),
// 			z.literal("FPRINT_Z_REPORT"),
// 			z.literal("CASH_INCOME"),
// 			z.literal("DOCUMENT_CLOSE_FPRINT"),
// 			z.literal("DOCUMENT_CLOSE"),
// 		])
// 		.optional(),
// 	paymentType: z.string().optional(),
// 	sum: z.number().optional(),
// 	commodityUuid: z.string().optional(),
// 	paymentCategoryId: z.number().optional(),
// 	price: z.number().optional(),
// 	costPrice: z.number().optional(),
// 	quantity: z.number().optional(),
// 	commodityName: z.string().optional(),
// 	cash: z.number().optional(),
// 	closeDate: z.string().optional(),
// 	creationDate: z.string().optional(),
// });

export const transactionSchema = z.object({
	x_type: z.string().optional(),
	uuid: z.string().nullable().optional(),
	id: z.string().optional(),
	userCode: z.string().nullable().optional(),
	userUuid: z.string().optional(),
	creationDate: z.string().optional(),
	timezone: z.number().optional(),
	baseDocumentNumber: z.string().nullable().optional(),
	baseDocumentUUID: z.string().nullable().optional(),
	clientName: z.string().nullable().optional(),
	clientPhone: z.string().nullable().optional(),
	alcoholByVolume: z.number().optional(),
	alcoholProductKindCode: z.number().optional(),
	balanceQuantity: z.number().optional(),
	barcode: z.string().nullable().optional(),
	commodityCode: z.string().optional(),
	commodityName: z.string().optional(),
	price: z.number().optional(),
	quantity: z.number().optional(),
	sum: z.number().optional(),
});

export const salesDataSchema = z.object({
	transactions: z.array(transactionSchema),
});

export const rolePropertiesSchema = z.object({
	agent_type: z
		.union([
			z.literal("AGENT"),
			z.literal("COMMISSIONER"),
			z.literal("ATTORNEY_IN_FACT"),
			z.literal("PAYMENT_AGENT"),
			z.literal("BANK_PAYMENT_AGENT"),
		])
		.optional(),
	subagentType: z
		.union([z.literal("PAYMENT_SUBAGENT"), z.literal("BANK_PAYMENT_SUBAGENT")])
		.optional(),
	short_name: z.string().optional(),
	type: z
		.union([
			z.literal("LEGAL_ENTITY"),
			z.literal("INDIVIDUAL_ENTREPRENEUR"),
			z.literal("GOVERNMENT_AGENCY"),
		])
		.optional(),
});

export const extraKeySchema = z.object({
	identity: z.string(),
	description: z.string(),
	app_id: z.string(),
});

export const shopSchema = z.object({
	id: z.string().optional(),
	name: z.string(),
	address: z.string().optional(),
	user_id: z.string().optional(),
	created_at: z.string().optional(),
	updated_at: z.string().optional(),
	code: z.string().optional(),
	uuid: z.string(),
});

export const pagingSchema = z.object({
	next_cursor: z.string(),
});

export const shopsResponseSchema = z.object({
	paging: pagingSchema,
	items: z.array(shopSchema),
});

export const productUuidSchema = z.object({
	uuid: z.string(),
	group: z.boolean(),
	parentUuid: z.string(),
	name: z.string(),
	shopId: z.string(),
});

export const productSchema = z.object({
	type: z.string(),
	name: z.string(),
	code: z.string().optional(),
	price: z.number(),
	measureName: z.string(),
	is_excisable: z.boolean().optional(),
	is_age_limited: z.boolean().optional(),
	tax: z.string(),
	allow_to_sell: z.boolean().optional(),
	description: z.string().optional(),
	article_number: z.string().optional(),
	parentUuid: z.string().optional(),
	id: z.string(),
	store_id: z.string().optional(),
	user_id: z.string().optional(),
	created_at: z.string().optional(),
	updated_at: z.string().optional(),
	uuid: z.string(),
	group: z.boolean(),
});

export const productsResponseSchema = z.object({
	paging: pagingSchema,
	items: z.array(productSchema),
});

export const salesSummarySchema = z.record(z.number());

export const paymentTypeSchema = z.object({
	CARD: z.string().optional(),
	ADVANCE: z.string().optional(),
	CASH: z.string().optional(),
	COUNTEROFFER: z.string().optional(),
	CREDIT: z.string().optional(),
	ELECTRON: z.string().optional(),
	UNKNOWN: z.string().optional(),
});

export const shopUuidNameSchema = z.object({
	uuid: z.string(),
	name: z.string(),
});

export const counterpartySchema = z.object({
	id: z.string(),
	full_name: z.string(),
	inn: z.string().optional(),
	kpp: z.string().optional(),
	phones: z.array(z.string()).optional(),
	addresses: z.array(z.string()).optional(),
	role: z
		.union([
			z.literal("AGENT"),
			z.literal("SUBAGENT"),
			z.literal("PRINCIPAL"),
			z.literal("TRANSACTION_OPERATOR"),
		])
		.optional(),
	role_properties: rolePropertiesSchema.optional(),
});

export const positionSchema = z.object({
	quantity: z.number(),
	initial_quantity: z.number(),
	sum: z.number(),
	measure_name: z.string(),
	product_name: z.string(),
	product_id: z.string(),
	price: z.number(),
	tare_volume: z.number().optional(),
	alcohol_product_kind_code: z.number().optional(),
	alcohol_by_volume: z.number().optional(),
	extra_keys: z.array(extraKeySchema).optional(),
});

export const documentBodySchema = z.object({
	positions: z.array(positionSchema),
});

export const documentSchema = z.object({
	uuid: z.string(),
	type: z
		.union([
			z.literal("OPEN_SESSION"),
			z.literal("CLOSE_SESSION"),
			z.literal("CASH_INCOME"),
			z.literal("ACCEPT"),
			z.literal("SELL"),
			z.literal("PAYBACK"),
			z.literal("RETURN"),
			z.literal("BUY"),
			z.literal("BUYBACK"),
			z.literal("X_REPORT"),
			z.literal("Z_REPORT"),
			z.literal("CORRECTION"),
			z.literal("PAYMENT"),
			z.literal("CASH_OUTCOME"),
			z.literal("CASH_INCOME"),
		])
		.optional(),
	id: z.string().optional(),
	extras: z.record(z.unknown()).nullable().optional(),
	number: z.number(),
	closeDate: z.string(),
	time_zone_offset: z.number().optional(),
	sessionUUID: z.string(),
	sessionNumber: z.union([z.number(), z.string()]),
	close_user_id: z.string().optional(),
	device_id: z.string().optional(),
	openUserCode: z.string().nullable().optional(),
	openUserUuid: z.string().optional(),
	closeUserCode: z.string().nullable().optional(),
	closeUserUuid: z.string().optional(),
	shop_id: z.string().optional(),
	storeUuid: z.string().optional(),
	user_id: z.string().optional(),
	version: z.string().optional(),
	counterparties: z.array(counterpartySchema).optional(),
	body: documentBodySchema.optional(),
	openDate: z.string().optional(),
	transactions: z.array(transactionSchema),
	closeResultSum: z.union([z.string(), z.number()]).optional(),
	closeSum: z.union([z.string(), z.number()]).optional(),
	completeInventory: z.boolean().optional(),
	deviceId: z.string().optional(),
	deviceUuid: z.string().optional(),
});

// Схема для PaymentInfo
export const paymentInfoSchema = z.object({
	paymentType: z.string().describe("Тип оплаты: CARD, CASH, ADVANCE и т.д."),
	sum: z
		.number()
		.describe(
			"Поле sum зависит от типа документа:\n" +
				"- Если тип документа 'SELL', то sum > 0 — это сумма, внесённая клиентом, или sum < 0 — сумма, выданная клиенту как сдача.\n" +
				"- Если тип документа 'PAYBACK', то sum > 0 — это сумма, возвращённая клиенту за товар.",
		),
});

// Схема для TransactionSale с paymentData
export const transactionSaleSchema = z.object({
	productName: z.string().describe("Название товара"),
	quantity: z.number().describe("Количество товара в чеке"),
	price: z.number().describe("Цена товара в чеке"),
	costPrice: z.number().describe("Себестоимость товара в чеке"),
	sum: z.number().describe("Сумма товара в чеке"),
});

// Схема для SalesInfo
export const salesInfoSchema = z.object({
	type: z
		.string()
		.describe("Тип документа: SELL — продажа, PAYBACK — возврат продажи"),
	shopName: z.string().describe("Имя магазина в системе Эвотор"),
	closeDate: z
		.string()
		.describe("Дата и время закрытия документа в формате ISO 8601"),
	employeeName: z.string().describe("Имя сотрудника в системе Эвотор"),
	transactions: z.array(transactionSaleSchema),
	paymentData: z.array(paymentInfoSchema),
});
