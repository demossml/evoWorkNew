// repositories/deadStocks.ts
import type { DeadStockItem } from "../../types";
import { deadStocks } from "../schema/deadStocks";

export const saveDeadStocks = async (
	db: ReturnType<typeof import("drizzle-orm/d1").drizzle>,
	shopUuid: string,
	items: DeadStockItem[],
): Promise<void> => {
	if (!shopUuid || !Array.isArray(items) || items.length === 0) {
		throw new Error("Invalid parameters for saveDeadStocks");
	}

	const document_number = crypto.randomUUID();

	const d = new Date();
	const document_date = [
		String(d.getDate()).padStart(2, "0"),
		String(d.getMonth() + 1).padStart(2, "0"),
		d.getFullYear(),
	].join(".");

	const values = items.map((item) => ({
		shop_uuid: shopUuid,
		name: item.name,
		quantity: item.quantity,
		sold: item.sold,
		lastSaleDate: item.lastSaleDate,
		mark: item.mark ?? null,
		moveCount: item.moveCount ?? null,
		moveToStore: item.moveToStore ?? null,
		document_number,
		document_date,
	}));

	await db.insert(deadStocks).values(values).run();
};
