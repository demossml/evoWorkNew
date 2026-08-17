/**
 * providerRoutes.ts — настройка ИИ-провайдера (DeepSeek) для текущего tenant.
 * Только SUPERADMIN. Ключ хранится в tenants.deepseek_api_key.
 */

import { Hono } from "hono";
import type { IEnv } from "../../types";
import { requireSuperAdmin } from "../../helpers";
import { getTenantById } from "../auth/repo";
import { deepseekGetBalance } from "../../services/deepseek";

function maskKey(key: string): string {
	if (key.length <= 8) return "…" + key.slice(-4);
	return "…" + key.slice(-4);
}

export function registerAiProviderRoutes(app: Hono<IEnv>) {
	// ─── Статус провайдера ──────────────────────────────────────────
	app.get("/api/ai/provider", requireSuperAdmin, async (c) => {
		const db = c.get("db");
		const tenantId = c.get("tenantId");
		const tenant = await getTenantById(db, tenantId);
		const tenantKey = tenant?.deepseek_api_key?.trim() || "";
		const envKey = c.env.DEEPSEEK_API_KEY?.trim() || "";

		const hasKey = !!tenantKey;
		const source = hasKey ? "tenant" : envKey ? "env" : "none";

		return c.json({
			provider: "deepseek",
			has_key: hasKey,
			key_hint: hasKey ? maskKey(tenantKey) : null,
			source,
			status: "unknown", // не проверяем на каждом GET — только по verify
			balance: null,
		});
	});

	// ─── Сохранение ключа ────────────────────────────────────────────
	app.post("/api/ai/provider", requireSuperAdmin, async (c) => {
		const body = await c.req
			.json<{ provider?: string; api_key?: string }>()
			.catch(() => ({}));
		const key = (body.api_key || "").trim();
		if (!key) {
			return c.json({ success: false, error: "api_key_required" }, 400);
		}

		const db = c.get("db");
		const tenantId = c.get("tenantId");
		await db
			.prepare(
				`UPDATE tenants SET deepseek_api_key = ?, updated_at = datetime('now') WHERE id = ?`,
			)
			.bind(key, tenantId)
			.run();

		// Сразу проверяем ключ (balance)
		const verify = await deepseekGetBalance(key);

		return c.json({
			success: true,
			provider: "deepseek",
			has_key: true,
			key_hint: maskKey(key),
			source: "tenant",
			status: verify.ok && verify.is_available !== false ? "active" : "inactive",
			balance: verify.ok ? verify.balances ?? [] : null,
			verify_error: verify.ok ? null : verify.error,
		});
	});

	// ─── Проверка ключа (баланс) ─────────────────────────────────────
	app.post("/api/ai/provider/verify", requireSuperAdmin, async (c) => {
		const body = await c.req.json<{ api_key?: string }>().catch(() => ({}));
		const db = c.get("db");
		const tenantId = c.get("tenantId");

		let key = (body.api_key || "").trim();
		if (!key) {
			const tenant = await getTenantById(db, tenantId);
			key = tenant?.deepseek_api_key?.trim() || c.env.DEEPSEEK_API_KEY?.trim() || "";
		}
		if (!key) {
			return c.json({ success: false, error: "ai_key_not_configured" }, 400);
		}

		const verify = await deepseekGetBalance(key);
		return c.json({
			success: true,
			ok: verify.ok,
			status:
				verify.ok && verify.is_available !== false ? "active" : "inactive",
			is_available: verify.is_available,
			balances: verify.balances ?? [],
			error: verify.error ?? null,
			checked_at: new Date().toISOString(),
		});
	});

	// ─── Удаление ключа (возврат к env-фолбэку) ─────────────────────
	app.post("/api/ai/provider/clear", requireSuperAdmin, async (c) => {
		const db = c.get("db");
		const tenantId = c.get("tenantId");
		await db
			.prepare(
				`UPDATE tenants SET deepseek_api_key = NULL, updated_at = datetime('now') WHERE id = ?`,
			)
			.bind(tenantId)
			.run();

		const envKey = c.env.DEEPSEEK_API_KEY?.trim() || "";
		return c.json({
			success: true,
			has_key: false,
			key_hint: null,
			source: envKey ? "env" : "none",
			status: "unknown",
			balance: null,
		});
	});
}
