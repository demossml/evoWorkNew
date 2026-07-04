import { text, integer, real } from "drizzle-orm/sqlite-core";
import { sqliteTable } from "./_table";

/**
 * Таблица settings — одна строка с глобальными настройками.
 * Используем key-value модель: каждая строка — это один ключ + значение.
 * id=1: accessory_group_uuids (JSON-массив строк)
 * id=2: salary (число)
 * id=3: bonus (число)
 */
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  value: text("value"),
});
