/**
 * SettingsNew.tsx — страница настроек приложения в стиле dashboard-плиток.
 *
 * 6 секций-карточек:
 * 1. Бонусы
 * 2. Пороги (маржа, план, мёртвый сток и др.)
 * 3. Синхронизация
 * 4. Загрузка
 * 5. Общие
 * 6. Push-уведомления
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import {
  useSettings,
  useUpdateSetting,
  useBatchUpdateSettings,
  type AppSetting,
} from "../../hooks/useSettings";
import { subscribeToPush, unsubscribeFromPush } from "../../pwa";
import {
  Settings2, Gift, Gauge, RefreshCcw, Upload, Globe, Bell,
  Save, RotateCcw, Check, AlertTriangle, Loader2,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────

function formatLabel(key: string): string {
  const map: Record<string, string> = {
    bonus_accessories_rate: "Бонус с аксессуаров, %",
    bonus_plan_amount: "Бонус за план, ₽",
    margin_green: "Маржа: зелёный, ≥ %",
    margin_yellow: "Маржа: жёлтый, ≥ %",
    plan_green: "План: зелёный, ≥ %",
    plan_yellow: "План: жёлтый, ≥ %",
    accessory_share_target: "Цель аксессуаров, %",
    dead_stock_days: "Мёртвый сток, дней",
    category_threshold: "Значимость категории, доля",
    refund_trend: "Тренд возвратов, коэф.",
    sync_delay_shops: "Задержка: магазины, мс",
    sync_delay_requests: "Задержка: запросы, мс",
    upload_max_attempts: "Макс. попыток загрузки",
    upload_lock_ttl: "Блокировка очереди, мс",
    api_timeout: "Таймаут API, мс",
  };
  return map[key] ?? key;
}

function getCategoryLabel(cat: string): string {
  const map: Record<string, string> = {
    bonus: "Бонусы",
    thresholds: "Пороги",
    sync: "Синхронизация",
    upload: "Загрузка",
    general: "Общие",
  };
  return map[cat] ?? cat;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  bonus: <Gift className="w-5 h-5" />,
  thresholds: <Gauge className="w-5 h-5" />,
  sync: <RefreshCcw className="w-5 h-5" />,
  upload: <Upload className="w-5 h-5" />,
  general: <Globe className="w-5 h-5" />,
  push: <Bell className="w-5 h-5" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  bonus: "border-l-emerald-500",
  thresholds: "border-l-amber-500",
  sync: "border-l-blue-500",
  upload: "border-l-purple-500",
  general: "border-l-slate-400",
  push: "border-l-rose-500",
};

// ─── Card: Setting Row ────────────────────────────────────────────────

function SettingRow({
  setting,
  value,
  onChange,
  onSave,
  saving,
}: {
  setting: AppSetting;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const dirty = value !== setting.value;
  const isNumber = setting.type === "number";
  const isJson = setting.type === "json";

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white/90 truncate">
          {formatLabel(setting.key)}
        </div>
        {setting.description && (
          <div className="text-xs text-white/40 mt-0.5">{setting.description}</div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isJson ? (
          <textarea
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white w-48 h-16 resize-none
                       focus:outline-none focus:border-blue-500/50 font-mono text-xs"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white w-28
                       focus:outline-none focus:border-blue-500/50 text-right"
            type={isNumber ? "number" : "text"}
            step={isNumber ? "any" : undefined}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        {dirty && (
          <button
            onClick={onSave}
            disabled={saving}
            className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30
                       disabled:opacity-50 transition-colors"
            title="Сохранить"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          </button>
        )}
        {!dirty && setting.updated_at && (
          <Check className="w-4 h-4 text-white/20" title="Сохранено" />
        )}
      </div>
    </div>
  );
}

// ─── Card: Category Section ───────────────────────────────────────────

function SettingsCard({
  category,
  settings,
  editedValues,
  onEdit,
  onSaveOne,
  savingKeys,
}: {
  category: string;
  settings: AppSetting[];
  editedValues: Record<string, string>;
  onEdit: (key: string, value: string) => void;
  onSaveOne: (key: string) => void;
  savingKeys: Set<string>;
}) {
  const icon = CATEGORY_ICONS[category] ?? <Settings2 className="w-5 h-5" />;
  const borderColor = CATEGORY_COLORS[category] ?? "border-l-slate-400";

  if (settings.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/10 border-l-4 ${borderColor}
                  overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
        <span className="text-white/60">{icon}</span>
        <h3 className="text-white font-semibold text-sm">{getCategoryLabel(category)}</h3>
        <span className="text-white/20 text-xs ml-auto">{settings.length}</span>
      </div>

      {/* Rows */}
      <div className="px-4 py-2">
        {settings.map((s) => (
          <SettingRow
            key={s.key}
            setting={s}
            value={editedValues[s.key] ?? s.value}
            onChange={(v) => onEdit(s.key, v)}
            onSave={() => onSaveOne(s.key)}
            saving={savingKeys.has(s.key)}
          />
        ))}
      </div>
    </motion.div>
  );
}

// ─── Push Section ─────────────────────────────────────────────────────

function PushSection() {
  const [subscribed, setSubscribed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Проверяем текущий статус подписки
  useEffect(() => {
    const check = async () => {
      try {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
          setSubscribed(false);
          setChecking(false);
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        setSubscribed(!!sub);
      } catch {
        setSubscribed(false);
      } finally {
        setChecking(false);
      }
    };
    void check();
  }, []);

  const handleSubscribe = async () => {
    setBusy(true);
    setStatusMessage(null);
    try {
      const ok = await subscribeToPush();
      if (ok) {
        setSubscribed(true);
        setStatusMessage("Подписка активирована");
      } else {
        setStatusMessage("Не удалось подписаться. Возможно, Push не поддерживается.");
      }
    } catch {
      setStatusMessage("Ошибка подписки");
    } finally {
      setBusy(false);
    }
  };

  const handleUnsubscribe = async () => {
    setBusy(true);
    setStatusMessage(null);
    try {
      await unsubscribeFromPush();
      setSubscribed(false);
      setStatusMessage("Подписка отключена");
    } catch {
      setStatusMessage("Ошибка отписки");
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <div className="bg-white/[0.03] rounded-xl border border-white/10 p-4 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-white/30" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/10 border-l-4 border-l-rose-500
                  overflow-hidden"
    >
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
        <span className="text-white/60"><Bell className="w-5 h-5" /></span>
        <h3 className="text-white font-semibold text-sm">Push-уведомления</h3>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
          subscribed
            ? "bg-emerald-500/20 text-emerald-400"
            : "bg-white/5 text-white/40"
        }`}>
          {subscribed ? "Активна" : "Не активна"}
        </span>
      </div>

      <div className="px-4 py-4 space-y-3">
        <div className="flex gap-2">
          {subscribed ? (
            <button
              onClick={handleUnsubscribe}
              disabled={busy}
              className="px-3 py-1.5 text-xs rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30
                         transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />}
              Отписаться
            </button>
          ) : (
            <button
              onClick={handleSubscribe}
              disabled={busy}
              className="px-3 py-1.5 text-xs rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30
                         transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />}
              Подписаться на push
            </button>
          )}
        </div>

        {statusMessage && (
          <div className={`text-xs ${statusMessage.includes("активирована") ? "text-emerald-400" : "text-amber-400"}`}>
            {statusMessage}
          </div>
        )}

        <div className="text-xs text-white/30 leading-relaxed">
          Push-уведомления позволяют получать важные оповещения (план выполнен, мёртвый сток,
          падение выручки) даже когда приложение закрыто. Не чаще 2–3 уведомлений в день.
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────

export default function SettingsNew() {
  useTelegramBackButton();

  const { data: settings, isLoading, error } = useSettings();
  const updateMutation = useUpdateSetting();
  const batchMutation = useBatchUpdateSettings();

  // Локальное состояние редактируемых значений
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ text: string; type: "ok" | "err" } | null>(null);

  const showToast = useCallback((text: string, type: "ok" | "err" = "ok") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  // Сброс всех изменений
  const resetAll = useCallback(() => {
    setEditedValues({});
  }, []);

  // Сохранить все изменённые
  const saveAll = useCallback(async () => {
    const updates = Object.entries(editedValues).map(([key, value]) => ({ key, value }));
    if (updates.length === 0) return;
    try {
      await batchMutation.mutateAsync(updates);
      setEditedValues({});
      showToast(`Сохранено ${updates.length} настр.`);
    } catch {
      showToast("Ошибка сохранения", "err");
    }
  }, [editedValues, batchMutation, showToast]);

  // Сохранить одну
  const saveOne = useCallback(
    async (key: string) => {
      const value = editedValues[key];
      if (value === undefined) return;
      setSavingKeys((prev) => new Set(prev).add(key));
      try {
        await updateMutation.mutateAsync({ key, value });
        setEditedValues((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        showToast(`${formatLabel(key)} сохранено`);
      } catch {
        showToast(`Ошибка: ${key}`, "err");
      } finally {
        setSavingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [editedValues, updateMutation, showToast],
  );

  const handleEdit = useCallback((key: string, value: string) => {
    setEditedValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Группировка по категориям
  const grouped = useMemo(() => {
    const map: Record<string, AppSetting[]> = {};
    for (const s of settings ?? []) {
      const cat = s.category || "general";
      if (!map[cat]) map[cat] = [];
      map[cat].push(s);
    }
    // Порядок секций
    const order = ["bonus", "thresholds", "sync", "upload", "general"];
    return order.filter((k) => map[k]).map((k) => ({ category: k, items: map[k] }));
  }, [settings]);

  const dirtyCount = Object.keys(editedValues).length;

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#080c16] text-white pb-20">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#080c16]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings2 className="w-6 h-6 text-blue-400" />
            <div>
              <h1 className="text-lg font-bold text-white">Настройки</h1>
              <p className="text-xs text-white/40">Пороги, бонусы, синхронизация</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {dirtyCount > 0 && (
              <>
                <button
                  onClick={resetAll}
                  className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-white/60 hover:bg-white/10 transition-colors
                             flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Сброс
                </button>
                <button
                  onClick={saveAll}
                  disabled={batchMutation.isPending}
                  className="px-3 py-1.5 text-xs rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30
                             transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {batchMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Сохранить всё
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-white/20" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {String(error)}
          </div>
        )}

        {/* Settings cards */}
        {!isLoading && !error && grouped.map(({ category, items }) => (
          <SettingsCard
            key={category}
            category={category}
            settings={items}
            editedValues={editedValues}
            onEdit={handleEdit}
            onSaveOne={saveOne}
            savingKeys={savingKeys}
          />
        ))}

        {/* Push section */}
        {!isLoading && !error && <PushSection />}
      </div>

      {/* Toast */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-sm z-50 shadow-lg ${
            toast.type === "err"
              ? "bg-red-500/90 text-white"
              : "bg-emerald-500/90 text-white"
          }`}
        >
          {toast.text}
        </motion.div>
      )}
    </div>
  );
}
