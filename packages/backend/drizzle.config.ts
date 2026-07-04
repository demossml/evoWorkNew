import { defineConfig } from "drizzle-kit";
// import { getEnv } from "./utils/env"; // Можно удалить, если не нужно

export default defineConfig({
	schema: "./src/db/schema/*.ts",
	out: "./drizzle",
	dialect: "sqlite", // Обязательно для D1 (SQLite-диалект)
});
