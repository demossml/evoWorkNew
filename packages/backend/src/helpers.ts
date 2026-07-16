import type { Next } from "hono";
import type { D1Database } from "@cloudflare/workers-types";
import { Evotor } from "./evotor";
import type { IContext } from "./types";
import { assert, createIndexDocumentsTable, createOpeningPhotosTable, createOpenStorsTable, isValidSign } from "./utils";
import { createSettingsTable } from "./db/repositories/settings";
import { runMigrations } from "./db/migrations";
import { drizzle } from "drizzle-orm/d1";

let tablesInitialized = false;

async function ensureTables(db: D1Database): Promise<void> {
  if (tablesInitialized) return;
  await createIndexDocumentsTable(db);
  await createSettingsTable(db);
  await createOpeningPhotosTable(db);
  await createOpenStorsTable(db);
  await runMigrations(db);
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

// SUPERADMIN Telegram IDs (hardcoded)
const SUPERADMIN_IDS = new Set(["5700958253", "475039971"]);

/**
 * requireAdmin — middleware that checks the user has Admin or SuperAdmin rights.
 * Must be placed AFTER authenticate and initialize in the middleware chain.
 *
 * Logic:
 *   1. SuperAdmin → hardcoded by Telegram user ID
 *   2. Admin        → check employee role in DB (ADMIN)
 *   3. Any other    → 403 Forbidden
 */
export const requireAdmin = async (c: IContext, next: Next) => {
	const userId = c.get("userId") as string;

	// SuperAdmin: hardcoded list
	if (SUPERADMIN_IDS.has(userId)) {
		return next();
	}

	// Check DB for employee role
	try {
		const db = c.get("db") as D1Database;
		const role = await getEmployeeRoleFromDBSimple(db, userId);
		if (role === "ADMIN" || role === "SUPERADMIN") {
			return next();
		}
	} catch {
		// fall through to 403
	}

	return c.json(
		{
			success: false,
			message: "Forbidden: требуется роль Admin или SuperAdmin",
		},
		403,
	);
};

/** Lightweight version — doesn't require import from sync/db */
async function getEmployeeRoleFromDBSimple(
	db: D1Database,
	userId: string,
): Promise<string | null> {
	const res = await db
		.prepare("SELECT role FROM employees WHERE uuid = ? OR last_name = ?")
		.bind(userId, userId)
		.first<{ role: string }>();
	return res?.role ?? null;
}
