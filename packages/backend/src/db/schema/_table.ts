import { sqliteTableCreator } from "drizzle-orm/sqlite-core";

/**
 * Общий creator для всех SQLite / D1 таблиц
 * Здесь можно задать префикс при необходимости
 */
export const sqliteTable = sqliteTableCreator((name) => name);
