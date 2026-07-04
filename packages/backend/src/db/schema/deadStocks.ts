// tables.ts
import { integer, text, index } from "drizzle-orm/sqlite-core";
import { sqliteTable } from "./_table";

export const deadStocks = sqliteTable(
	"deadStocks",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		shop_uuid: text("shop_uuid").notNull(),
		name: text("name").notNull(),
		quantity: integer("quantity").notNull(),
		sold: integer("sold").notNull(),
		mark: text("mark", {
			enum: ["keep", "move", "sellout", "writeoff"],
		}),
		lastSaleDate: text("lastSaleDate"),
		moveCount: integer("moveCount"),
		moveToStore: text("moveToStore"),
		document_number: text("document_number").notNull(),
		document_date: text("document_date").notNull(),
	},
	(table) => ({
		shopIdx: index("deadStocks_shop_uuid_idx").on(table.shop_uuid),
		documentNumberIdx: index("deadStocks_document_number_idx").on(
			table.document_number,
		),
		documentDateIdx: index("deadStocks_document_date_idx").on(
			table.document_date,
		),
	}),
);
