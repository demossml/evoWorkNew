import { eq } from "drizzle-orm";
import { settings } from "../schema/settings";
import type { D1Database } from "@cloudflare/workers-types";

type AnyDrizzleDB = any;

export async function createSettingsTable(
  db: D1Database
): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      value TEXT
    );
  `).run();

  // Also create the accessories table used by getAllUuid()
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS accessories (
      uuid TEXT PRIMARY KEY,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `).run();
}

export async function getSettings(
  db: AnyDrizzleDB
): Promise<{ accessoryGroupUuids: string[]; salary: number; bonus: number }> {
  const result = {
    accessoryGroupUuids: [] as string[],
    salary: 0,
    bonus: 0,
  };

  try {
    const rows = await db.select().from(settings).all();

    const row1 = rows.find((r: any) => r.id === 1);
    if (row1?.value) {
      try {
        result.accessoryGroupUuids = JSON.parse(row1.value);
      } catch {
        result.accessoryGroupUuids = [];
      }
    }

    const row2 = rows.find((r: any) => r.id === 2);
    if (row2?.value) {
      result.salary = Number(row2.value) || 0;
    }

    const row3 = rows.find((r: any) => r.id === 3);
    if (row3?.value) {
      result.bonus = Number(row3.value) || 0;
    }
  } catch (err) {
    console.error("getSettings error:", err);
  }

  return result;
}

export async function saveAccessoryGroups(
  drizzleDb: AnyDrizzleDB,
  rawDb: D1Database,
  uuids: string[]
): Promise<void> {
  const json = JSON.stringify(uuids);

  // Save to settings table (for settings page) via Drizzle
  const existing = await drizzleDb
    .select()
    .from(settings)
    .where(eq(settings.id, 1))
    .get();

  if (existing) {
    await drizzleDb
      .update(settings)
      .set({ value: json })
      .where(eq(settings.id, 1))
      .run();
  } else {
    await drizzleDb.insert(settings).values({ id: 1, value: json }).run();
  }

  // Also save to accessories table (used by getAllUuid for sales calculation)
  await rawDb.prepare("DELETE FROM accessories").run();
  const stmt = rawDb.prepare("INSERT INTO accessories (uuid) VALUES (?)");
  for (const uuid of uuids) {
    await stmt.bind(uuid).run();
  }
}

export async function saveSalaryBonus(
  db: AnyDrizzleDB,
  salary: number,
  bonus: number
): Promise<void> {
  const salaryStr = String(salary);
  const bonusStr = String(bonus);

  // Upsert salary (id=2)
  const salRow = await db
    .select()
    .from(settings)
    .where(eq(settings.id, 2))
    .get();
  if (salRow) {
    await db
      .update(settings)
      .set({ value: salaryStr })
      .where(eq(settings.id, 2))
      .run();
  } else {
    await db.insert(settings).values({ id: 2, value: salaryStr }).run();
  }

  // Upsert bonus (id=3)
  const bonRow = await db
    .select()
    .from(settings)
    .where(eq(settings.id, 3))
    .get();
  if (bonRow) {
    await db
      .update(settings)
      .set({ value: bonusStr })
      .where(eq(settings.id, 3))
      .run();
  } else {
    await db.insert(settings).values({ id: 3, value: bonusStr }).run();
  }
}
