import type { Next } from "hono";
import type { D1Database } from "@cloudflare/workers-types";
import { Evotor } from "./evotor";
import type { IContext } from "./types";
import { assert, createIndexDocumentsTable, createOpeningPhotosTable, createOpenStorsTable, isValidSign } from "./utils";
import { createSettingsTable } from "./db/repositories/settings";
import { drizzle } from "drizzle-orm/d1";

let tablesInitialized = false;

async function ensureTables(db: D1Database): Promise<void> {
  if (tablesInitialized) return;
  await createIndexDocumentsTable(db);
  await createSettingsTable(db);
  await createOpeningPhotosTable(db);
  await createOpenStorsTable(db);
  tablesInitialized = true;
}

export const initializeDrizzle = (c: IContext) => {
	const db = drizzle(c.env.DB); // c.env.DB — это D1Database
	c.set("drizzle", db); // сохраняем в контекст
	return db;
};

export const initialize = async (c: IContext, next: Next) => {
  c.set("evotor", new Evotor(c.env.EVOTOR_API_TOKEN));
  c.set("db", c.env.DB);
  c.set("drizzle", drizzle(c.env.DB));
  c.set("ai", c.env.AI);
  c.set("r2", c.env.R2);
  c.set("r2Url", c.env.R2_PUBLIC_URL);
  c.set("BOT_TOKEN", c.env.BOT_TOKEN);

  await ensureTables(c.env.DB);

  return next();
};

export const authenticate = async (c: IContext, next: Next) => {
	const initData = c.req.header("initData") || "guest";

	// режим "гость"
	if (initData === "guest") {
		const manualId = c.req.header("telegram-id");

		if (manualId) {
			// пользователь ввёл Telegram ID вручную
			c.set("user", {
				id: manualId,
				first_name: "",
				last_name: "",
				username: "",
				photo_url: "",
			});
			c.set("userId", manualId);
		} else {
			// гость без ID
			c.set("user", {
				id: "",
				first_name: "",
				last_name: "",
				username: "",
				photo_url: "",
			});
			c.set("userId", "");
		}
	} else {
		// проверка WebApp initData
		const payload = Object.fromEntries(new URLSearchParams(initData));
		const isValid = await isValidSign(c.env.BOT_TOKEN, payload);
		assert(isValid, "invalid signature");

		const user = JSON.parse(payload.user);
		c.set("user", user);
		c.set("userId", user.id.toString());
	}

	return next();
};
