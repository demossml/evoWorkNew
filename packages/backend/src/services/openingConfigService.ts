/**
 * openingConfigService — tenant-scoped конфиг «Открытие торговой точки».
 * Хранится в app_settings (key = opening_point_config) как JSON.
 */

import type { D1Database } from "@cloudflare/workers-types";

export type OpeningFollowupField = {
  id: string;
  type: "text" | "number";
  label: string;
  required: boolean;
};

export type OpeningStep =
  | {
      id: string;
      type: "photo";
      title: string;
      description: string;
      required: boolean;
      max_photos: number;
    }
  | {
      id: string;
      type: "question";
      title: string;
      required: boolean;
      options: string[];
      followups?: Array<{ when_option: string; fields: OpeningFollowupField[] }>;
    }
  | {
      id: string;
      type: "text";
      title: string;
      description?: string;
      required: boolean;
    };

export type OpeningPointConfig = {
  version: 1;
  setup_completed: boolean;
  title: string;
  photo_storage: {
    mode: "platform" | "external";
    external_folder_url?: string;
    external_hint?: string;
  };
  steps: OpeningStep[];
};

const CONFIG_KEY = "opening_point_config";

function uid(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36).slice(-4)
  );
}

export function defaultOpeningConfig(): OpeningPointConfig {
  return {
    version: 1,
    setup_completed: false,
    title: "Открытие торговой точки",
    photo_storage: { mode: "platform" },
    steps: [
      {
        id: uid(),
        type: "photo",
        title: "Общий вид",
        description: "Сфотографируйте общий вид торговой точки",
        required: true,
        max_photos: 1,
      },
      {
        id: uid(),
        type: "photo",
        title: "Кассовая зона",
        description: "Сфотографируйте кассовую зону",
        required: true,
        max_photos: 1,
      },
      {
        id: uid(),
        type: "question",
        title: "Сходится ли касса?",
        required: true,
        options: ["Да", "Нет"],
        followups: [
          {
            when_option: "Нет",
            fields: [
              { id: uid(), type: "number", label: "Сумма расхождения, ₽", required: true },
              { id: uid(), type: "text", label: "Комментарий", required: true },
            ],
          },
        ],
      },
    ],
  };
}

function sanitizeString(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function normalizeConfig(raw: unknown): OpeningPointConfig {
  const d = defaultOpeningConfig();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;

  d.setup_completed = Boolean(r.setup_completed);
  d.title = sanitizeString(r.title, 80) || "Открытие торговой точки";

  const ps = (r.photo_storage ?? {}) as Record<string, unknown>;
  d.photo_storage = {
    mode: ps.mode === "external" ? "external" : "platform",
    external_folder_url: sanitizeString(ps.external_folder_url, 300) || undefined,
    external_hint: sanitizeString(ps.external_hint, 300) || undefined,
  };

  if (Array.isArray(r.steps) && r.steps.length > 0) {
    d.steps = r.steps
      .slice(0, 25)
      .map((s) => normalizeStep(s as Record<string, unknown>))
      .filter(Boolean) as OpeningStep[];
  }
  return d;
}

function normalizeStep(s: Record<string, unknown>): OpeningStep | null {
  if (!s || typeof s !== "object") return null;
  const type = s.type;
  const id = sanitizeString(s.id, 40) || uid();
  const title = sanitizeString(s.title, 120) || "Шаг";
  const required = Boolean(s.required);

  if (type === "photo") {
    const max_photos = Math.min(5, Math.max(1, Number(s.max_photos) || 1));
    return {
      id,
      type: "photo",
      title,
      description: sanitizeString(s.description, 300),
      required,
      max_photos,
    };
  }
  if (type === "question") {
    const options = Array.isArray(s.options)
      ? (s.options as string[]).map((o) => sanitizeString(o, 80)).filter(Boolean)
      : [];
    const followups = Array.isArray(s.followups)
      ? (s.followups as Array<{ when_option: unknown; fields: unknown }>)
          .map((f) => ({
            when_option: sanitizeString(f.when_option, 80),
            fields: Array.isArray(f.fields)
              ? (f.fields as Array<Record<string, unknown>>)
                  .slice(0, 20)
                  .map((fd) => ({
                    id: sanitizeString(fd.id, 40) || uid(),
                    type: fd.type === "number" ? "number" : "text",
                    label: sanitizeString(fd.label, 120),
                    required: Boolean(fd.required),
                  }))
              : [],
          }))
          .filter((f) => f.when_option)
      : undefined;
    return { id, type: "question", title, required, options: options.length >= 2 ? options : ["Да", "Нет"], followups };
  }
  if (type === "text") {
    return {
      id,
      type: "text",
      title,
      description: sanitizeString(s.description, 300) || undefined,
      required,
    };
  }
  return null;
}

export async function getOpeningConfig(
  db: D1Database,
  tenantId = "default",
): Promise<OpeningPointConfig> {
  try {
    const row = await db
      .prepare("SELECT value FROM app_settings WHERE key = ? AND tenant_id = ?")
      .bind(CONFIG_KEY, tenantId)
      .first<{ value: string }>();
    if (!row?.value) return defaultOpeningConfig();
    return normalizeConfig(JSON.parse(row.value));
  } catch {
    return defaultOpeningConfig();
  }
}

export async function saveOpeningConfig(
  db: D1Database,
  tenantId: string,
  raw: unknown,
): Promise<{ ok: boolean; error?: string; config?: OpeningPointConfig }> {
  const config = normalizeConfig(raw);

  if (config.steps.length > 25) {
    return { ok: false, error: "Максимум 25 шагов" };
  }
  for (const s of config.steps) {
    if (s.type === "photo" && (s.max_photos < 1 || s.max_photos > 5)) {
      return { ok: false, error: "max_photos должен быть 1..5" };
    }
    if (s.type === "question" && s.options.length < 2) {
      return { ok: false, error: "У вопроса минимум 2 варианта" };
    }
  }

  await db
    .prepare(
      `INSERT INTO app_settings (tenant_id, key, value, type, category, label, description, updated_at)
       VALUES (?, ?, ?, 'json', 'general', ?, '', datetime('now'))
       ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    )
    .bind(tenantId, CONFIG_KEY, JSON.stringify(config), CONFIG_KEY)
    .run();

  return { ok: true, config };
}
