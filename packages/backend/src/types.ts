import type { Ai, D1Database, R2Bucket } from "@cloudflare/workers-types";
import type { Context } from "hono";
import type { Evotor } from "./evotor";

export type IEnv = {
	Bindings: {
		DB: D1Database;
		BOT_TOKEN: string;
		EVOTOR_API_TOKEN: string;
		TELEGRAM_STORAGE_CHAT_ID: string;
		TELEGRAM_STORAGE_BOT_TOKEN: string;
		DEEPSEEK_API_KEY: string;
		AI: Ai;
		R2: R2Bucket;
		R2_PUBLIC_URL: string;
		R2_ACCOUNT_ID?: string;
	};
	Variables: {
		userId: string;
		shopId: string;
		user: {
			id: string;
			first_name: string;
			last_name: string;
			username: string;
			photo_url: string;
		};
		evotor: Evotor;
		db: D1Database;
		ai: Ai;
		r2: R2Bucket;
		r2Url: string;
		BOT_TOKEN: string;
		drizzle: ReturnType<typeof import("drizzle-orm/d1").drizzle>;
	};
};

export type IContext = Context<IEnv>;

export interface DeadStockItem {
	name: string;
	quantity: number;
	sold: number;
	lastSaleDate: string | null;
	mark?: "keep" | "move" | "sellout" | "writeoff" | null;
	moveCount?: number;
	moveToStore?: string;
}

/** Элемент отчёта мёртвых остатков (ответ API) */
export interface DeadStockReportItem {
	itemId: string;
	name: string;
	article: string;
	quantity: number;
	sold: number;
	lastSaleDate: string | null;
	daysWithoutSales: number;
	shopId: string;
	shopName: string;
}

export interface SaveDeadStocksRequest {
	shopUuid: string;
	items: DeadStockItem[];
}
