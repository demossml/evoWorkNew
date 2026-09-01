/**
 * featurePermissionsService — tenant-scoped права ролей на отчёты/Home.
 * Хранится в app_settings (key = role_feature_permissions).
 * Прибыльные id не могут быть выданы CASHIER (жёсткий запрет).
 */

import type { D1Database } from "@cloudflare/workers-types";

const KEY = "role_feature_permissions";

export type RoleFeaturePermissions = {
  version: 1;
  ADMIN: string[];
  CASHIER: string[];
};

/** id, которые CASHIER нельзя выдавать (прибыль/маржа/финансы). */
const PROFIT_IDS = new Set([
  "home.finance",
  "home.best_shop",
  "home.high_margin",
  "report.sales_period",
  "report.profit_gross",
]);

export function defaultFeaturePermissions(): RoleFeaturePermissions {
  const all = [
    "home.revenue", "home.tempo", "home.finance", "home.best_shop",
    "home.top_products", "home.accessories", "home.high_margin", "home.focus",
    "home.plan", "home.promo", "home.alerts", "home.stock",
    "home.opening_status", "home.quick_actions", "home.sync_status",
    "report.sales_today", "report.period_comparison", "report.salary",
    "report.sales_period", "report.profit_gross", "report.orders",
    "report.stock_realization", "report.dead_stock", "report.seller_dna",
    "report.product_analysis", "report.store_analysis", "report.store_openings",
  ];
  return {
    version: 1,
    ADMIN: [...all],
    CASHIER: all.filter(
      (id) =>
        !PROFIT_IDS.has(id) &&
        ![
          "report.period_comparison", "report.salary", "report.dead_stock",
          "report.seller_dna", "report.product_analysis", "report.store_analysis",
          "report.store_openings", "home.sync_status", "home.stock",
          "home.promo", "home.best_shop",
        ].includes(id),
    ),
  };
}

function cleanList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === "string" && !seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

export async function getFeaturePermissions(
  db: D1Database,
  tenantId = "default",
): Promise<RoleFeaturePermissions> {
  try {
    const row = await db
      .prepare("SELECT value FROM app_settings WHERE key = ? AND tenant_id = ?")
      .bind(KEY, tenantId)
      .first<{ value: string }>();
    if (!row?.value) return defaultFeaturePermissions();
    const parsed = JSON.parse(row.value) as RoleFeaturePermissions;
    return {
      version: 1,
      ADMIN: cleanList(parsed.ADMIN),
      CASHIER: cleanList(parsed.CASHIER).filter((id) => !PROFIT_IDS.has(id)),
    };
  } catch {
    return defaultFeaturePermissions();
  }
}

export async function saveFeaturePermissions(
  db: D1Database,
  tenantId: string,
  raw: unknown,
): Promise<{ ok: boolean; error?: string; config?: RoleFeaturePermissions }> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const config: RoleFeaturePermissions = {
    version: 1,
    ADMIN: cleanList(r.ADMIN),
    // жёсткий запрет: profit никогда не у CASHIER
    CASHIER: cleanList(r.CASHIER).filter((id) => !PROFIT_IDS.has(id)),
  };

  await db
    .prepare(
      `INSERT INTO app_settings (tenant_id, key, value, type, category, label, description, updated_at)
       VALUES (?, ?, ?, 'json', 'general', ?, '', datetime('now'))
       ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    )
    .bind(tenantId, KEY, JSON.stringify(config), KEY)
    .run();

  return { ok: true, config };
}
