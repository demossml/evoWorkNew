/**
 * AiProviderCard.tsx — плитка «ИИ (DeepSeek)» в Настройках.
 * Только SUPERADMIN: вставка API-ключа DeepSeek для своего tenant,
 * проверка статуса и баланса через GET api.deepseek.com/user/balance.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  ChevronDown,
  ChevronRight,
  Loader2,
  Trash2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { getAuthHeaders } from "@shared/api";

interface ProviderInfo {
  provider: string;
  has_key: boolean;
  key_hint: string | null;
  source: "tenant" | "env" | "none";
  status: "unknown" | "active" | "inactive";
  balance: { currency: string; total_balance: string }[] | null;
}

interface VerifyResult {
  ok: boolean;
  status: "active" | "inactive";
  is_available?: boolean;
  balances: { currency: string; total_balance: string }[];
  error?: string | null;
  checked_at?: string;
}

export function AiProviderCard() {
  const [me, setMe] = useState<{ user: { role: string } } | null>(null);
  const [checking, setChecking] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const [info, setInfo] = useState<ProviderInfo | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadInfo = async () => {
    try {
      const res = await fetch("/api/ai/provider", { headers: getAuthHeaders() });
      if (res.ok) setInfo(await res.json());
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch("/api/auth/me", { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        setMe(data);
        if (data.user.role === "SUPERADMIN") await loadInfo();
      } catch {
        /* ignore */
      } finally {
        setChecking(false);
      }
    };
    void init();
  }, []);

  if (checking) return null;
  if (!me || me.user.role !== "SUPERADMIN") return null;

  const sourceLabel =
    info?.source === "tenant"
      ? "Свой ключ"
      : info?.source === "env"
        ? "Системный ключ"
        : "Не настроен";

  const statusBadge =
    verify?.status === "active"
      ? { cls: "bg-emerald-500/15 text-emerald-400", text: "активен" }
      : verify?.status === "inactive"
        ? { cls: "bg-red-500/15 text-red-400", text: "неактивен" }
        : { cls: "bg-muted text-muted-foreground", text: "не проверен" };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setMessage("Введите ключ");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/ai/provider", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ provider: "deepseek", api_key: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error === "api_key_required" ? "Введите ключ" : "Ошибка сохранения");
        return;
      }
      setApiKey("");
      setInfo(data);
      if (data.verify_error) {
        setVerify({ ok: false, status: "inactive", balances: [], error: data.verify_error });
        setMessage("Ключ сохранён, но проверка не удалась");
      } else {
        setVerify({ ok: true, status: data.status, balances: data.balance ?? [], checked_at: new Date().toISOString() });
        setMessage("Ключ сохранён");
      }
    } catch {
      setMessage("Ошибка сети");
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    setMessage(null);
    try {
      const res = await fetch("/api/ai/provider/verify", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerify({ ok: false, status: "inactive", balances: [], error: data.error || "Ошибка" });
        setMessage(data.error === "ai_key_not_configured" ? "Ключ не настроен" : "Проверка не удалась");
        return;
      }
      setVerify({ ok: data.ok, status: data.status, is_available: data.is_available, balances: data.balances ?? [], checked_at: data.checked_at });
      setMessage(null);
    } catch {
      setVerify({ ok: false, status: "inactive", balances: [], error: "network" });
      setMessage("Ошибка сети");
    } finally {
      setVerifying(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm("Удалить свой ключ? ИИ будет использовать системный ключ.")) return;
    setMessage(null);
    try {
      const res = await fetch("/api/ai/provider/clear", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setInfo(await res.json());
        setVerify(null);
        setMessage("Ключ удалён");
      } else {
        setMessage("Ошибка удаления");
      }
    } catch {
      setMessage("Ошибка сети");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl border-l-4 border-l-violet-500 overflow-hidden"
    >
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-border cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-muted-foreground"><Sparkles className="w-5 h-5" /></span>
        <div>
          <h3 className="text-foreground font-semibold text-sm">ИИ (DeepSeek)</h3>
          <p className="text-[11px] text-muted-foreground">Ключ и баланс AI для этой сети</p>
        </div>
        <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium ${statusBadge.cls}`}>
          {statusBadge.text}
        </span>
        <span className="text-muted-foreground">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      </div>

      {expanded && (
        <div className="px-4 py-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Ключ используется для AI-отчётов и подсказок этой сети.
          </p>

          <div className="text-xs text-muted-foreground">
            Источник:{" "}
            <span className="text-foreground font-medium">{sourceLabel}</span>
            {info?.key_hint && (
              <span className="ml-2 font-mono text-[10px]">Сохранён: {info.key_hint}</span>
            )}
          </div>

          <div>
            <label className="text-xs text-muted-foreground">API key DeepSeek</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full mt-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-violet-500/50"
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleSave}
              disabled={saving || !apiKey.trim()}
              className="px-3 py-1.5 text-xs rounded-lg bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 transition disabled:opacity-50"
            >
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
            <button
              onClick={handleVerify}
              disabled={verifying}
              className="px-3 py-1.5 text-xs rounded-lg bg-muted text-muted-foreground hover:bg-muted/70 transition disabled:opacity-50"
            >
              {verifying ? "Проверяю..." : "Проверить"}
            </button>
            {info?.has_key && (
              <button
                onClick={handleClear}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
              >
                <Trash2 className="w-3 h-3" /> Удалить ключ
              </button>
            )}
          </div>

          {verify && (
            <div className="rounded-lg border border-border bg-background/50 p-3 space-y-1">
              <div className="flex items-center gap-2 text-xs">
                {verify.status === "active" ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-foreground font-medium">Ключ активен</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-red-500" />
                    <span className="text-foreground font-medium">
                      {verify.error === "invalid_key" ? "Неверный ключ" : "Ключ неактивен"}
                    </span>
                  </>
                )}
              </div>

              {verify.balances.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Баланс:{" "}
                  {verify.balances
                    .map((b) => `${b.total_balance} ${b.currency}`)
                    .join(", ")}
                </div>
              )}

              {verify.is_available === false && (
                <div className="text-[11px] text-amber-400">
                  Баланса может не хватать для запросов.
                </div>
              )}

              {verify.checked_at && (
                <div className="text-[10px] text-muted-foreground">
                  Проверено: {new Date(verify.checked_at).toLocaleTimeString("ru-RU")}
                </div>
              )}
            </div>
          )}

          {message && (
            <div className={`text-xs ${message.startsWith("Ошибка") || message.includes("не удалась") ? "text-red-400" : "text-emerald-400"}`}>
              {message}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
