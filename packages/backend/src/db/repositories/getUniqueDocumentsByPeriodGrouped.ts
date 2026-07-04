// deadStocks.repository.ts

import { between, sql } from "drizzle-orm";
import { deadStocks } from "../schema/deadStocks";

export type DeadStockDocument = {
	document_number: string;
	document_date: string;
};

export async function getUniqueDocumentsByPeriodGrouped(
	fromDate: string,
	toDate: string,
	db: ReturnType<typeof import("drizzle-orm/d1").drizzle>,
): Promise<DeadStockDocument[]> {
	return db
		.select({
			document_number: deadStocks.document_number,
			document_date: sql<string>`MIN(${deadStocks.document_date})`,
		})
		.from(deadStocks)
		.where(between(deadStocks.document_date, fromDate, toDate))
		.groupBy(deadStocks.document_number)
		.orderBy(sql`document_date`);
}
