import type { D1Database } from "@cloudflare/workers-types";

export async function createSettingsTable(
  db: D1Database
): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS settings (
      tenant_id TEXT NOT NULL DEFAULT 'default',
      id INTEGER NOT NULL,
      value TEXT,
      PRIMARY KEY (tenant_id, id)
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
  db: D1Database,
  tenantId = "default"
): Promise<{ accessoryGroupUuids: string[]; salary: number; bonus: number }> {
  const result = {
    accessoryGroupUuids: [] as string[],
    salary: 0,
    bonus: 0,
  };

  try {
    const rows = await db
      .prepare("SELECT id, value FROM settings WHERE tenant_id = ?")
      .bind(tenantId)
      .all<{ id: number; value: string | null }>();

    for (const r of rows.results ?? []) {
      if (r.id === 1 && r.value) {
        try {
          result.accessoryGroupUuids = JSON.parse(r.value);
        } catch {
          result.accessoryGroupUuids = [];
        }
      } else if (r.id === 2 && r.value) {
        result.salary = Number(r.value) || 0;
      } else if (r.id === 3 && r.value) {
        result.bonus = Number(r.value) || 0;
      }
    }
  } catch (err) {
    console.error("getSettings error:", err);
  }

  return result;
}

export async function saveAccessoryGroups(
  _drizzleDb: unknown,
  db: D1Database,
  uuids: string[],
  tenantId = "default",
): Promise<void> {
  // Дедупликация: одна группа не может быть выбрана дважды
  const unique = [...new Set((uuids ?? []).map((u) => String(u).trim()).filter(Boolean))];
  const json = JSON.stringify(unique);

  await db
    .prepare(
      `INSERT INTO settings (tenant_id, id, value) VALUES (?, 1, ?)
       ON CONFLICT(tenant_id, id) DO UPDATE SET value = excluded.value`,
    )
    .bind(tenantId, json)
    .run();

  // Также сохраняем в accessories (глобальная классификация «что считать аксессуарами»).
  // ВНИМАНИЕ: эта таблица пока не tenant-scoped (см. DEVIATIONS).
  await db.prepare("DELETE FROM accessories").run();
  const stmt = db.prepare("INSERT OR IGNORE INTO accessories (uuid) VALUES (?)");
  for (const uuid of unique) {
    await stmt.bind(uuid).run();
  }
}

export async function saveSalaryBonus(
  db: D1Database,
  salary: number,
  bonus: number,
  tenantId = "default",
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO settings (tenant_id, id, value) VALUES (?, 2, ?)
       ON CONFLICT(tenant_id, id) DO UPDATE SET value = excluded.value`,
    )
    .bind(tenantId, String(salary))
    .run();
  await db
    .prepare(
      `INSERT INTO settings (tenant_id, id, value) VALUES (?, 3, ?)
       ON CONFLICT(tenant_id, id) DO UPDATE SET value = excluded.value`,
    )
    .bind(tenantId, String(bonus))
    .run();
}
