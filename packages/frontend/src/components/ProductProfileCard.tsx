/**
 * ProductProfileCard.tsx — переключатель режима приложения (vape | universal).
 * Только SUPERADMIN. Пока только сохраняет флаг; скрытие виджетов — следующий шаг.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { LayoutGrid, Loader2 } from "lucide-react";
import { getAuthHeaders } from "@shared/api";

type Profile = "vape" | "universal";

const LABELS: Record<Profile, string> = {
  vape: "Моя сеть",
  universal: "Универсальная розница",
};

/** Маленькая метка текущего режима (для шапки Settings). */
export function ModeIndicator() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/tenant/product-profile", { headers: getAuthHeaders() });
        if (!res.ok) return;
        const d = await res.json();
        setLabel(d.product_profile === "universal" ? "Универсальная розница" : "Моя сеть");
      } catch {
        /* ignore */
      }
    };
    void load();
  }, []);

  if (!label) return null;
  return <span className="text-[10px] text-muted-foreground">Режим: {label}</span>;
}

export function ProductProfileCard() {
  const [me, setMe] = useState<{ user: { role: string } } | null>(null);
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState<Profile>("vape");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch("/api/auth/me", { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        setMe(data);
        if (data.user.role === "SUPERADMIN") {
          const p = await fetch("/api/tenant/product-profile", { headers: getAuthHeaders() });
          if (p.ok) {
            const d = await p.json();
            setProfile(d.product_profile === "universal" ? "universal" : "vape");
          }
        }
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

  const select = async (next: Profile) => {
    if (next === profile) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/tenant/product-profile", {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ product_profile: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage("Ошибка сохранения");
        return;
      }
      setProfile(data.product_profile === "universal" ? "universal" : "vape");
      setMessage("Сохранено");
    } catch {
      setMessage("Ошибка сети");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl border-l-4 border-l-slate-400 overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground"><LayoutGrid className="w-5 h-5" /></span>
          <div>
            <h3 className="text-foreground font-semibold text-sm">Режим приложения</h3>
            <p className="text-[11px] text-muted-foreground">
              Пока переключается только режим. Набор экранов изменим на следующих шагах.
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        {(["vape", "universal"] as Profile[]).map((p) => (
          <label
            key={p}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition ${
              profile === p
                ? "border-primary/50 bg-primary/10"
                : "border-border hover:bg-muted"
            }`}
          >
            <input
              type="radio"
              name="product-profile"
              checked={profile === p}
              onChange={() => select(p)}
              disabled={saving}
              className="accent-primary"
            />
            <div>
              <div className="text-sm text-foreground font-medium">{LABELS[p]}</div>
              <div className="text-[10px] text-muted-foreground">
                {p === "vape"
                  ? "Текущие отчёты и блоки (вейп)"
                  : "Как увидит клиент (общие метрики)"}
              </div>
            </div>
          </label>
        ))}

        {saving && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Сохранение...
          </div>
        )}
        {message && (
          <div className={`text-xs ${message === "Сохранено" ? "text-emerald-400" : "text-red-400"}`}>
            {message}
          </div>
        )}
      </div>
    </motion.div>
  );
}
