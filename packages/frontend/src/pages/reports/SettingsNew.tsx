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
import { getAuthHeaders } from "@shared/api";
import { subscribeToPush, unsubscribeFromPush } from "../../pwa";
import {
  Settings2, Gift, Gauge, RefreshCcw, Upload, Globe, Bell,
  Save, RotateCcw, Check, AlertTriangle, Loader2,
  Wallet, Clock, Store, ChevronDown, ChevronRight,
  Zap, Package, Search, DollarSign, X, Users, Crosshair,
} from "lucide-react";
import { UsersAccessCard, EvotorTokenCard } from "../../components/UsersAccessCard";
import { AiProviderCard } from "../../components/AiProviderCard";
import { ProductProfileCard, ModeIndicator } from "../../components/ProductProfileCard";

// ─── Helpers ──────────────────────────────────────────────────────────

function formatLabel(key: string): string {
  const map: Record<string, string> = {
    bonus_accessories_rate: "Бонус с аксессуаров, %",
    bonus_plan_amount: "Бонус за план, ₽",
    base_salary: "Оклад, ₽/день",
    salary_mode: "Режим оплаты",
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
    salary: "Зарплата",
    thresholds: "Пороги",
    sync: "Синхронизация",
    upload: "Загрузка",
    general: "Общие",
  };
  return map[cat] ?? cat;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  bonus: <Gift className="w-5 h-5" />,
  salary: <Wallet className="w-5 h-5" />,
  thresholds: <Gauge className="w-5 h-5" />,
  sync: <RefreshCcw className="w-5 h-5" />,
  upload: <Upload className="w-5 h-5" />,
  general: <Globe className="w-5 h-5" />,
  push: <Bell className="w-5 h-5" />,
  schedule: <Clock className="w-5 h-5" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  bonus: "border-l-4 border-l-emerald-500",
  salary: "border-l-4 border-l-teal-500",
  thresholds: "border-l-4 border-l-amber-500",
  sync: "border-l-4 border-l-blue-500",
  upload: "border-l-4 border-l-purple-500",
  general: "border-l-slate-400",
  push: "border-l-4 border-l-rose-500",
  schedule: "border-l-4 border-l-cyan-500",
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
    <div className="flex items-center gap-3 py-2 border-b border-border last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {formatLabel(setting.key)}
        </div>
        {setting.description && (
          <div className="text-xs text-muted-foreground mt-0.5">{setting.description}</div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isJson ? (
          <textarea
            className="bg-muted border border-border rounded-lg px-3 py-1.5 text-sm w-48 h-16 resize-none
                       focus:outline-none focus:border-primary/50 font-mono text-xs"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input
            className="bg-muted border border-border rounded-lg px-3 py-1.5 text-sm w-28
                       focus:outline-none focus:border-primary/50 text-right"
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
            className="p-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30
                       disabled:opacity-50 transition-colors"
            title="Сохранить"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          </button>
        )}
        {!dirty && setting.updated_at && (
          <Check className="w-4 h-4 text-muted-foreground" title="Сохранено" />
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
      className={`bg-card border border-border rounded-xl overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border">
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="text-sm font-semibold">{getCategoryLabel(category)}</h3>
        <span className="text-muted-foreground text-xs ml-auto">{settings.length}</span>
      </div>

      {/* Rows */}
      <div className="px-4 py-1.5">
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

// ─── Salary Mode Toggle ──────────────────────────────────────────────

function SalaryCard({
  settings,
  editedValues,
  onEdit,
  onSaveOne,
  savingKeys,
}: {
  settings: AppSetting[];
  editedValues: Record<string, string>;
  onEdit: (key: string, value: string) => void;
  onSaveOne: (key: string) => void;
  savingKeys: Set<string>;
}) {
  const salarySetting = settings.find(s => s.key === "base_salary");
  const bonusSetting = settings.find(s => s.key === "bonus_plan_amount");
  const modeSetting = settings.find(s => s.key === "salary_mode");

  const salaryValue = editedValues["base_salary"] ?? salarySetting?.value ?? "0";
  const bonusValue = editedValues["bonus_plan_amount"] ?? bonusSetting?.value ?? "450";
  const modeValue = editedValues["salary_mode"] ?? modeSetting?.value ?? "oklad";
  const isBonusMode = modeValue === "oklad_bonus";

  const toggleMode = () => {
    const newMode = isBonusMode ? "oklad" : "oklad_bonus";
    onEdit("salary_mode", newMode);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl border-l-4 border-l-teal-500 overflow-hidden"
    >
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <span className="text-muted-foreground"><Wallet className="w-5 h-5" /></span>
        <h3 className="text-foreground font-semibold text-sm">Зарплата</h3>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Галка: режим оплаты */}
        <div
          onClick={toggleMode}
          className="flex items-center gap-3 py-2 cursor-pointer select-none"
        >
          <div className={`w-10 h-5 rounded-full transition-colors relative ${
            isBonusMode ? "bg-teal-500" : "bg-muted"
          }`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              isBonusMode ? "translate-x-5" : "translate-x-0.5"
            }`} />
          </div>
          <div>
            <div className="text-sm text-foreground">
              {isBonusMode ? "Оклад + бонус с аксессуаров" : "Только оклад"}
            </div>
            <div className="text-xs text-muted-foreground">
              {isBonusMode
                ? "Меньший оклад + 5% с продаж аксессуаров"
                : "Фиксированная ставка без бонусов"}
            </div>
          </div>
        </div>

        {/* Оклад */}
        {salarySetting && (
          <SettingRow
            setting={salarySetting}
            value={salaryValue}
            onChange={(v) => onEdit("base_salary", v)}
            onSave={() => onSaveOne("base_salary")}
            saving={savingKeys.has("base_salary")}
          />
        )}

        {/* Бонус за план (из bonus-категории) */}
        {bonusSetting && (
          <SettingRow
            setting={bonusSetting}
            value={bonusValue}
            onChange={(v) => onEdit("bonus_plan_amount", v)}
            onSave={() => onSaveOne("bonus_plan_amount")}
            saving={savingKeys.has("bonus_plan_amount")}
          />
        )}
      </div>
    </motion.div>
  );
}

// ─── Group Picker Card (вейпы / аксессуары) ──────────────────────────

interface GroupOption {
  uuid: string;
  name: string;
}

function GroupPickerCard({
  title,
  icon,
  borderColor,
  description,
  loadSelected,
  saveSelected,
}: {
  title: string;
  icon: React.ReactNode;
  borderColor: string;
  description: string;
  loadSelected: () => Promise<string[]>;
  saveSelected: (uuids: string[]) => Promise<void>;
}) {
  const [allGroups, setAllGroups] = useState<GroupOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Загрузка
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/evotor/settings-config", {
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        setAllGroups(data.groupOptions ?? []);

        const sel = await loadSelected();
        setSelected(sel);
        setSaved(sel);
      } catch (err) {
        console.error("GroupPicker load error:", err);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allGroups;
    return allGroups.filter((g) => g.name.toLowerCase().includes(q));
  }, [allGroups, search]);

  const dirty = useMemo(() => {
    if (selected.length !== saved.length) return true;
    const set = new Set(saved);
    return selected.some((u) => !set.has(u));
  }, [selected, saved]);

  const selectedNames = useMemo(() => {
    const byUuid = new Map(allGroups.map((g) => [g.uuid, g.name]));
    return selected.map((u) => byUuid.get(u)).filter(Boolean) as string[];
  }, [allGroups, selected]);

  const toggle = (uuid: string) => {
    setSelected((prev) =>
      prev.includes(uuid) ? prev.filter((u) => u !== uuid) : [...prev, uuid],
    );
  };

  const selectAll = () => setSelected(filtered.map((g) => g.uuid));
  const deselectAll = () =>
    setSelected((prev) => prev.filter((u) => !filtered.some((g) => g.uuid === u)));

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await saveSelected(selected);
      setSaved([...selected]);
      setMessage(`Сохранено: ${selected.length} групп`);
    } catch (err) {
      setMessage(`Ошибка: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSelected([...saved]);
    setMessage(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-card border border-border rounded-xl ${borderColor} overflow-hidden`}
    >
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-border cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="text-foreground font-semibold text-sm">{title}</h3>
        <span className="text-muted-foreground text-xs">{selected.length} выбрано</span>
        <span className="ml-auto text-muted-foreground">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      </div>

      {expanded && (
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground mb-3">{description}</p>

          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Поиск */}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск группы..."
                className="w-full bg-muted border border-border rounded-lg px-3 py-1.5 text-sm text-white
                           placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 mb-3"
              />

              {/* Кнопки выбрать/снять — липкие внутри карточки */}
              <div className="sticky top-0 z-10 bg-card pt-1 pb-2 flex gap-2">
                <button
                  onClick={selectAll}
                  className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted"
                >
                  Выбрать найденные
                </button>
                <button
                  onClick={deselectAll}
                  className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted"
                >
                  Снять найденные
                </button>
              </div>

              {/* Список групп: высокий, с запасом снизу, чтобы последний пункт
                  не уезжал под панель кнопок / bottom navigation */}
              <div className="max-h-[min(50vh,20rem)] overflow-y-auto overscroll-contain space-y-0.5 mb-3 pb-3 scroll-pb-4">
                {filtered.map((group) => (
                  <label
                    key={group.uuid}
                    className="flex items-center gap-2 min-h-11 py-2 px-1 cursor-pointer hover:bg-muted rounded"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(group.uuid)}
                      onChange={() => toggle(group.uuid)}
                      className="w-3.5 h-3.5 accent-primary"
                    />
                    <span className="text-xs text-foreground truncate">{group.name}</span>
                  </label>
                ))}
                {filtered.length === 0 && (
                  <div className="text-xs text-muted-foreground py-2 text-center">
                    Группы не найдены
                  </div>
                )}
              </div>

              {/* Выбранные */}
              {selectedNames.length > 0 && (
                <div className="mb-3 text-[10px] text-muted-foreground leading-relaxed">
                  Выбрано: {selectedNames.join(", ")}
                </div>
              )}

              {/* Кнопки сохранить/сбросить */}
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  className="px-3 py-1.5 text-xs rounded-lg bg-primary/20 text-primary
                             hover:bg-primary/30 disabled:opacity-30 transition-colors"
                >
                  {saving ? "Сохранение..." : "Сохранить"}
                </button>
                <button
                  onClick={handleReset}
                  disabled={!dirty}
                  className="px-3 py-1.5 text-xs rounded-lg bg-muted text-muted-foreground
                             hover:bg-muted disabled:opacity-30 transition-colors"
                >
                  Сбросить
                </button>
              </div>

              {message && (
                <div className={`mt-2 text-xs ${message.startsWith("Ошибка") ? "text-red-400" : "text-emerald-400"}`}>
                  {message}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ─── Promo Products Card ───────────────────────────────────────────────

interface ShopProduct {
  uuid: string;
  name: string;
  article: string;
  price: number;
}

interface PromoState {
  [productUuid: string]: {
    isActive: boolean;
    bonusAmount: string; // строка для input
  };
}

function PromoProductsCard() {
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [selectedGroupUuid, setSelectedGroupUuid] = useState<string>("");
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [promoState, setPromoState] = useState<PromoState>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Загружаем группы
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/evotor/settings-config", {
          headers: getAuthHeaders(),
        });
        const data = await res.json();
        setGroups(data.groupOptions ?? []);
      } catch { /* ignore */ }
    };
    void load();
  }, []);

  // Загружаем товары при смене группы
  useEffect(() => {
    if (!selectedGroupUuid) { setProducts([]); return; }
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/shop-products?group_uuid=${encodeURIComponent(selectedGroupUuid)}`, {
          headers: getAuthHeaders(),
        });
        const data = await res.json();
        setProducts(data.products ?? []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    void load();
  }, [selectedGroupUuid]);

  // Загружаем текущие акции при смене товаров
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/promo/products", { headers: getAuthHeaders() });
        const data = await res.json();
        const activeMap: PromoState = {};
        for (const p of (data.products ?? [])) {
          if (p.is_active) {
            activeMap[p.product_uuid] = {
              isActive: true,
              bonusAmount: String(p.bonus_amount ?? 0),
            };
          }
        }
        setPromoState((prev) => ({ ...activeMap, ...prev }));
      } catch { /* ignore */ }
    };
    void load();
  }, [products]);

  const togglePromo = async (product: ShopProduct) => {
    const current = promoState[product.uuid];
    const willBeActive = !current?.isActive;
    const bonusAmount = current?.bonusAmount || "0";

    // Оптимистичное обновление
    setPromoState((prev) => ({
      ...prev,
      [product.uuid]: {
        isActive: willBeActive,
        bonusAmount,
      },
    }));

    setSaving((prev) => new Set(prev).add(product.uuid));
    try {
      const group = groups.find((g) => g.uuid === selectedGroupUuid);
      const res = await fetch("/api/promo/toggle", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          product_uuid: product.uuid,
          product_name: product.name,
          group_uuid: selectedGroupUuid,
          group_name: group?.name ?? "",
          bonus_amount: Number(bonusAmount),
          is_active: willBeActive,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setMessage(willBeActive ? `«${product.name}» — акция включена` : `«${product.name}» — акция выключена`);
    } catch (err) {
      // Откат
      setPromoState((prev) => ({
        ...prev,
        [product.uuid]: { isActive: !willBeActive, bonusAmount },
      }));
      setMessage(`Ошибка: ${err}`);
    } finally {
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(product.uuid);
        return next;
      });
    }
  };

  const updateBonus = (productUuid: string, value: string) => {
    setPromoState((prev) => ({
      ...prev,
      [productUuid]: {
        isActive: prev[productUuid]?.isActive ?? false,
        bonusAmount: value,
      },
    }));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl border-l-4 border-l-amber-500 overflow-hidden"
    >
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-border cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-muted-foreground"><DollarSign className="w-5 h-5" /></span>
        <h3 className="text-foreground font-semibold text-sm">Акционные товары</h3>
        <span className="text-muted-foreground text-xs">
          {Object.values(promoState).filter((s) => s.isActive).length} активно
        </span>
        <span className="ml-auto text-muted-foreground">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      </div>

      {expanded && (
        <div className="px-4 py-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Выберите группу, отметьте товары и укажите бонус за продажу. Акция действует пока галка включена.
            При выключении фиксируется время окончания.
          </p>

          {/* Выбор группы */}
          <select
            value={selectedGroupUuid}
            onChange={(e) => setSelectedGroupUuid(e.target.value)}
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-white
                       focus:outline-none focus:border-amber-500/50"
          >
            <option value="">— Выберите группу —</option>
            {groups.map((g) => (
              <option key={g.uuid} value={g.uuid} className="bg-gray-800 text-white">
                {g.name}
              </option>
            ))}
          </select>

          {/* Список товаров */}
          {loading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && selectedGroupUuid && products.length === 0 && (
            <div className="text-xs text-muted-foreground py-2 text-center">В группе нет товаров</div>
          )}

          {!loading && products.length > 0 && (
            <div className="max-h-[min(50vh,20rem)] overflow-y-auto overscroll-contain space-y-1 pb-3 scroll-pb-4">
              {products.map((product) => {
                const state = promoState[product.uuid];
                const isActive = state?.isActive ?? false;
                const isSaving = saving.has(product.uuid);

                return (
                  <div
                    key={product.uuid}
                    className={`flex items-center gap-2 min-h-11 py-1.5 px-2 rounded transition-colors ${
                      isActive ? "bg-amber-500/10" : "hover:bg-muted"
                    }`}
                  >
                    {/* Галка */}
                    <button
                      onClick={() => togglePromo(product)}
                      disabled={isSaving}
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        isActive
                          ? "bg-amber-500 border-amber-500 text-black"
                          : "border-border hover:border-white/40"
                      }`}
                    >
                      {isActive && <Check className="w-3 h-3" />}
                      {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                    </button>

                    {/* Название */}
                    <span className={`text-xs truncate flex-1 ${isActive ? "text-amber-300" : "text-foreground"}`}>
                      {product.name}
                    </span>

                    {/* Поле суммы */}
                    <input
                      type="number"
                      min="0"
                      value={state?.bonusAmount ?? "0"}
                      onChange={(e) => updateBonus(product.uuid, e.target.value)}
                      className={`w-16 text-right bg-muted border rounded px-1.5 py-0.5 text-xs
                                 focus:outline-none ${
                                   isActive
                                     ? "border-amber-500/50 text-amber-300"
                                     : "border-border text-muted-foreground"
                                 }`}
                      placeholder="0"
                    />
                    <span className="text-[10px] text-muted-foreground w-8">₽/шт</span>
                  </div>
                );
              })}
            </div>
          )}

          {message && (
            <div className={`text-xs ${message.startsWith("Ошибка") ? "text-red-400" : "text-emerald-400"}`}>
              {message}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ─── Sellers Card ───────────────────────────────────────────────────────

interface SellerInfo {
  uuid: string;
  name: string;
  salary_mode: string;
  base_salary: number;
}

function SellersCard() {
  const [sellers, setSellers] = useState<SellerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/sellers/settings", { headers: getAuthHeaders() });
        const data = await res.json();
        setSellers(data.sellers ?? []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    void load();
  }, []);

  const updateSeller = async (seller: SellerInfo, patch: Partial<SellerInfo>) => {
    setSaving((prev) => new Set(prev).add(seller.uuid));
    const updated = { ...seller, ...patch };
    setSellers((prev) => prev.map((s) => (s.uuid === seller.uuid ? updated : s)));
    try {
      const res = await fetch(`/api/sellers/${seller.uuid}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          employee_name: seller.name,
          salary_mode: updated.salary_mode,
          base_salary: updated.base_salary,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setMessage(`${seller.name} — сохранено`);
    } catch (err) {
      setSellers((prev) => prev.map((s) => (s.uuid === seller.uuid ? seller : s)));
      setMessage(`Ошибка: ${err}`);
    } finally {
      setSaving((prev) => { const n = new Set(prev); n.delete(seller.uuid); return n; });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl border-l-4 border-l-blue-500 overflow-hidden"
    >
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-border cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-muted-foreground"><Users className="w-5 h-5" /></span>
        <h3 className="text-foreground font-semibold text-sm">Продавцы</h3>
        <span className="text-muted-foreground text-xs">{sellers.length} чел.</span>
        <span className="ml-auto text-muted-foreground">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      </div>

      {expanded && (
        <div className="px-4 py-3 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && sellers.length === 0 && (
            <div className="text-xs text-muted-foreground py-2">Нет данных о продавцах</div>
          )}

          {!loading && sellers.map((seller) => {
            const isBonus = seller.salary_mode === "bonus";
            const isSaving = saving.has(seller.uuid);

            return (
              <div key={seller.uuid} className="pb-3 border-b border-border last:border-b-0">
                <div className="text-sm text-foreground font-medium mb-2">{seller.name}</div>

                {/* Галка full/bonus */}
                <div className="flex items-center gap-4 mb-2">
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                    <input
                      type="radio"
                      name={`mode-${seller.uuid}`}
                      checked={!isBonus}
                      onChange={() => updateSeller(seller, { salary_mode: "full" })}
                      disabled={isSaving}
                      className="accent-blue-500"
                    />
                    <span className={!isBonus ? "text-foreground" : "text-muted-foreground"}>
                      Большой оклад
                    </span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                    <input
                      type="radio"
                      name={`mode-${seller.uuid}`}
                      checked={isBonus}
                      onChange={() => updateSeller(seller, { salary_mode: "bonus" })}
                      disabled={isSaving}
                      className="accent-amber-500"
                    />
                    <span className={isBonus ? "text-amber-300" : "text-muted-foreground"}>
                      Маленький + аксессуары
                    </span>
                  </label>
                  {isSaving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                </div>

                {/* Поле оклада */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Оклад:</span>
                  <input
                    type="number"
                    min="0"
                    value={seller.base_salary}
                    onChange={(e) => {
                      setSellers((prev) =>
                        prev.map((s) =>
                          s.uuid === seller.uuid
                            ? { ...s, base_salary: Number(e.target.value) || 0 }
                            : s,
                        ),
                      );
                    }}
                    onBlur={() => updateSeller(seller, { base_salary: seller.base_salary })}
                    className="w-24 bg-muted border border-border rounded px-2 py-0.5 text-xs text-foreground text-right
                               focus:outline-none focus:border-blue-500/50"
                  />
                  <span className="text-xs text-muted-foreground">₽/день</span>
                </div>
              </div>
            );
          })}

          {message && (
            <div className={`text-xs ${message.startsWith("Ошибка") ? "text-red-400" : "text-emerald-400"}`}>
              {message}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ─── Schedule Card ─────────────────────────────────────────────────────

function ScheduleCard() {
  const [schedules, setSchedules] = useState<Record<string, Record<number, { open: string; close: string; working: boolean }>>>({});
  const [shopNames, setShopNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const weekdays = [0, 1, 2, 3, 4, 5, 6];
  const dayLabels: Record<number, string> = { 0: "Вс", 1: "Пн", 2: "Вт", 3: "Ср", 4: "Чт", 5: "Пт", 6: "Сб" };
  const defDay = { open: "09:00", close: "21:00", working: true };

  useEffect(() => {
    (async () => {
      try {
        const sr = await fetch("/api/shops", { headers: getAuthHeaders() });
        const sd = await sr.json();
        const shops: { uuid: string; name: string }[] = sd.shopsNameAndUuid ?? [];
        const names: Record<string, string> = {};
        const empty: typeof schedules = {};
        for (const s of shops) { names[s.uuid] = s.name; empty[s.uuid] = {}; for (const d of weekdays) empty[s.uuid][d] = { ...defDay }; }
        setShopNames(names);
        const rr = await fetch("/api/evotor/settings/shop-schedules", { headers: getAuthHeaders() });
        const rd = await rr.json();
        for (const r of (rd.rows ?? [])) {
          if (!empty[r.shop_id]) { empty[r.shop_id] = {}; for (const d of weekdays) empty[r.shop_id][d] = { ...defDay }; }
          empty[r.shop_id][r.weekday] = { open: r.open_time || "09:00", close: r.close_time || "21:00", working: r.is_working_day };
        }
        setSchedules(empty);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const upd = (shop: string, day: number, p: Partial<typeof defDay>) =>
    setSchedules(prev => ({ ...prev, [shop]: { ...prev[shop], [day]: { ...(prev[shop]?.[day] ?? defDay), ...p } } }));

  const copyDay = (shop: string, day: number) => {
    const src = schedules[shop]?.[day] ?? defDay;
    setSchedules(prev => { const n: typeof schedules = {}; for (const k of Object.keys(prev)) n[k] = { ...prev[k], [day]: { ...src } }; return n; });
  };

  const fillWeek = (shop: string, day: number) => {
    const src = schedules[shop]?.[day] ?? defDay;
    setSchedules(prev => ({
      ...prev,
      [shop]: Object.fromEntries(weekdays.map(d => [d, { ...src }])) as any,
    }));
  };

  const copyShop = (shop: string) => {
    const tpl = schedules[shop]; if (!tpl) return;
    setSchedules(prev => { const n: typeof schedules = {}; for (const k of Object.keys(prev)) n[k] = { ...tpl }; return n; });
  };

  const save = async () => {
    setSaving(true); setMessage(null);
    try {
      const rows: any[] = [];
      for (const [sid, days] of Object.entries(schedules))
        for (const [d, v] of Object.entries(days))
          rows.push({ shop_id: sid, weekday: Number(d), open_time: v.open, close_time: v.close, is_working_day: v.working });
      const res = await fetch("/api/evotor/settings/shop-schedules", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify({ rows }) } as any);
      if (!res.ok) throw new Error(String(res.status));
      setMessage("Расписание сохранено");
    } catch (e) { setMessage(`Ошибка: ${e}`); }
    finally { setSaving(false); }
  };

  const ids = Object.keys(schedules);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-xl border-l-4 border-l-cyan-500 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <span className="text-muted-foreground"><Clock className="w-5 h-5" /></span>
        <h3 className="text-foreground font-semibold text-sm">Расписание магазинов</h3>
        <span className="text-muted-foreground text-xs">{ids.length} маг.</span>
        <span className="ml-auto text-muted-foreground">{expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
      </div>
      {expanded && (
        <div className="px-4 py-3">
          {loading ? <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> : (
            <div className="space-y-4">
              {ids.map(uid => {
                const name = shopNames[uid] || uid.slice(0, 8);
                return (
                  <div key={uid} className="pb-3 border-b border-border last:border-b-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Store className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">{name}</span>
                      <button onClick={() => copyShop(uid)} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:bg-primary/30 hover:text-primary ml-auto" title="Применить расписание этого магазина ко всем">→ всем магазинам</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {weekdays.map(day => {
                        const d = schedules[uid]?.[day] ?? defDay;
                        return (
                          <div key={day} className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] ${d.working ? "bg-muted" : "bg-muted opacity-50"}`}>
                            <button onClick={() => upd(uid, day, { working: !d.working })} className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${d.working ? "bg-primary/80 border-primary text-black" : "border-border"}`}>{d.working && <Check className="w-2.5 h-2.5" />}</button>
                            <span className="w-5 font-medium text-foreground">{dayLabels[day]}</span>
                            {d.working ? (
                              <><input type="time" value={d.open} onChange={e => upd(uid, day, { open: e.target.value })} className="w-14 bg-transparent border-none text-foreground text-[10px] focus:outline-none [&::-webkit-calendar-picker-indicator]:hidden" />
                              <span className="text-muted-foreground">–</span>
                              <input type="time" value={d.close} onChange={e => upd(uid, day, { close: e.target.value })} className="w-14 bg-transparent border-none text-foreground text-[10px] focus:outline-none [&::-webkit-calendar-picker-indicator]:hidden" /></>
                            ) : <span className="text-muted-foreground italic">выходной</span>}
                            <button onClick={() => copyDay(uid, day)} className="text-muted-foreground hover:text-muted-foreground ml-0.5" title="Копировать день на все магазины"><ChevronRight className="w-3 h-3 rotate-180" /></button>
                            <button onClick={() => fillWeek(uid, day)} className="text-muted-foreground hover:text-primary ml-0.5" title="Заполнить всю неделю этим днём">→нед</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <button onClick={save} disabled={saving} className="w-full px-3 py-2 text-xs rounded-lg bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-50">{saving ? "Сохранение..." : "Сохранить расписание"}</button>
              {message && <div className={`text-xs ${message.startsWith("Ошибка") ? "text-red-400" : "text-emerald-400"}`}>{message}</div>}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ─── Push Section ─────────────────────────────────────────────────────

function PushSection() {
  const [subscribed, setSubscribed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Проверяем текущий статус подписки (с таймаутом)
  useEffect(() => {
    const check = async () => {
      try {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
          setSubscribed(false);
          setChecking(false);
          return;
        }
        // Таймаут 3 сек — если SW не отвечает, считаем что push недоступен
        const registration = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
        ]);
        const sub = await Promise.race([
          registration.pushManager.getSubscription(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
        ]);
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
      <div className="bg-white/[0.03] rounded-xl border border-border p-4 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl border-l-4 border-l-rose-500
                  overflow-hidden"
    >
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <span className="text-muted-foreground"><Bell className="w-5 h-5" /></span>
        <h3 className="text-foreground font-semibold text-sm">Push-уведомления</h3>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
          subscribed
            ? "bg-emerald-500/20 text-emerald-400"
            : "bg-muted text-muted-foreground"
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

        <div className="text-xs text-muted-foreground leading-relaxed">
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
      // salary-категория скрыта — настройки продавцов в отдельной плитке
      if (s.key === "vape_group_uuids" || s.category === "salary") continue;
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
    <div className="min-h-screen bg-background text-foreground pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />
            <div>
              <h1 className="text-base font-bold">Настройки</h1>
              <p className="text-[10px] text-muted-foreground">Пороги, бонусы, синхронизация</p>
              <ModeIndicator />
            </div>          </div>

          <div className="flex items-center gap-2">
            {dirtyCount > 0 && (
              <>
                <button
                  onClick={resetAll}
                  className="px-2.5 py-1 text-[10px] rounded-lg bg-muted text-muted-foreground hover:bg-muted transition-colors
                             flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Сброс
                </button>
                <button
                  onClick={saveAll}
                  disabled={batchMutation.isPending}
                  className="px-2.5 py-1 text-[10px] rounded-lg bg-primary/20 text-primary hover:bg-primary/30
                             transition-colors flex items-center gap-1 disabled:opacity-50"
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
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
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

        {/* Группы планов */}
        {!isLoading && !error && (
          <GroupPickerCard
            title="Группы планов"
            icon={<Zap className="w-5 h-5" />}
            borderColor="border-l-4 border-l-indigo-500"
            description="Товары этих групп участвуют в расчёте плана продаж. Выберите нужные товарные группы."
            loadSelected={async () => {
              const res = await fetch("/api/settings", { headers: getAuthHeaders() });
              const all: AppSetting[] = await res.json();
              const setting = all.find(s => s.key === "vape_group_uuids");
              if (!setting) return [];
              try { return JSON.parse(setting.value) as string[]; } catch { return []; }
            }}
            saveSelected={async (uuids) => {
              const res = await fetch("/api/settings/vape_group_uuids", {
                method: "PUT",
                headers: getAuthHeaders(),
                body: JSON.stringify({ value: JSON.stringify(uuids) }),
              });
              if (!res.ok) throw new Error(String(res.status));
            }}
          />
        )}

        {/* Аксессуар-группы */}
        {!isLoading && !error && (
          <GroupPickerCard
            title="Аксессуар-группы"
            icon={<Package className="w-5 h-5" />}
            borderColor="border-l-4 border-l-violet-500"
            description="Товары этих групп считаются аксессуарами. Участвуют в расчёте бонуса с аксессуаров."
            loadSelected={async () => {
              const res = await fetch("/api/evotor/settings-config", {
                headers: getAuthHeaders(),
              });
              const data = await res.json();
              return (data.selectedGroupUuids ?? []) as string[];
            }}
            saveSelected={async (uuids) => {
              const res = await fetch("/api/evotor/settings/accessory-groups", {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify({ groups: uuids }),
              } as any);
              if (!res.ok) throw new Error(String(res.status));
            }}
          />
        )}

        {/* Продавцы */}
        {!isLoading && !error && <SellersCard />}

        {/* Пользователи и доступ (только SUPERADMIN — компоненты сами проверяют роль) */}
        {!isLoading && !error && <UsersAccessCard />}
        {!isLoading && !error && <EvotorTokenCard />}

        {/* ИИ-провайдер (только SUPERADMIN) */}
        {!isLoading && !error && <AiProviderCard />}

        {/* Режим приложения (только SUPERADMIN) */}
        {!isLoading && !error && <ProductProfileCard />}

        {/* Фокус-категория (универсальный KPI) */}
        {!isLoading && !error && (
          <GroupPickerCard
            title="Фокус-категория"
            icon={<Crosshair className="w-5 h-5" />}
            borderColor="border-l-4 border-l-slate-400"
            description="Группы товаров для отдельного контроля (любой бизнес). В универсальном режиме показываются на главной."
            loadSelected={async () => {
              const res = await fetch("/api/tenant/focus-category", { headers: getAuthHeaders() });
              if (!res.ok) return [];
              const data = await res.json();
              return (data.group_uuids ?? []) as string[];
            }}
            saveSelected={async (uuids) => {
              const res = await fetch("/api/tenant/focus-category", {
                method: "PUT",
                headers: getAuthHeaders(),
                body: JSON.stringify({ group_uuids: uuids }),
              });
              if (!res.ok) throw new Error(String(res.status));
            }}
          />
        )}

        {/* Акционные товары */}
        {!isLoading && !error && <PromoProductsCard />}

        {/* Schedule */}
        {!isLoading && !error && <ScheduleCard />}

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
              ? "bg-destructive/90 text-white"
              : "bg-emerald-500/90 text-white"
          }`}
        >
          {toast.text}
        </motion.div>
      )}
    </div>
  );
}
