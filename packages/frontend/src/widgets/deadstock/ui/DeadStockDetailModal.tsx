import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Package, Clock, Hash, TrendingUp,
  MoveRight, Trash2, Tag, Loader2,
  ShoppingCart, ArrowRight,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { DeadStockTileItem } from "./DeadStockGrid";

/* ===================== TYPES ===================== */

export interface PlannedAction {
  itemId: string;
  name: string;
  article: string;
  shopId: string;
  shopName: string;
  action: "move" | "writeoff" | "promo" | "keep";
  targetShops?: { shopId: string; shopName: string; qty: number }[];
  quantity: number;
  reason?: string;
}

interface AnalysisResult {
  recommendedAction: "move" | "writeoff" | "promo" | "keep";
  targetShopId: string | null;
  targetShopName: string | null;
  quantity: number;
  explanation: string;
  expectedEffect: string;
}

interface ShopOption { uuid: string; name: string; }

interface SalesPoint { date: string; qty: number; sum: number; }

interface ShopSalesInfo {
  shopName: string; uuid: string; qty: number; hasProduct: boolean;
}

interface FastData {
  salesHistory: SalesPoint[];
  allShopsSales: ShopSalesInfo[];
  allShops: ShopOption[];
}

interface DeadStockDetailModalProps {
  item: DeadStockTileItem;
  onClose: () => void;
  onAction: (action: PlannedAction) => void;
}

/* ===================== CONSTANTS ===================== */

const CHART_HEIGHT = 160;

const ACTION_DEFS: {
  key: PlannedAction["action"]; label: string;
  icon: React.ReactNode; color: string; bg: string;
}[] = [
  { key: "move", label: "Переместить", icon: <MoveRight className="w-4 h-4" />, color: "text-blue-600", bg: "bg-blue-600 hover:bg-blue-700" },
  { key: "writeoff", label: "Списать", icon: <Trash2 className="w-4 h-4" />, color: "text-red-600", bg: "bg-red-600 hover:bg-red-700" },
  { key: "promo", label: "Промо", icon: <Tag className="w-4 h-4" />, color: "text-amber-600", bg: "bg-amber-600 hover:bg-amber-700" },
  { key: "keep", label: "Оставить", icon: <Package className="w-4 h-4" />, color: "text-green-600", bg: "bg-green-600 hover:bg-green-700" },
];

const ANALYSIS_LABELS: Record<string, string> = {
  move: "Переместить",
  writeoff: "Списать",
  promo: "Промо",
  keep: "Оставить",
};

/* ===================== HELPERS ===================== */

function getHeuristicAction(item: DeadStockTileItem): {
  action: PlannedAction["action"]; reason: string; effect: string;
} {
  if (item.daysWithoutSales >= 999) return { action: "writeoff", reason: "Никогда не продавался — неликвид.", effect: "Освободит место на полке." };
  if (item.daysWithoutSales >= 365) return { action: "writeoff", reason: "Более года без продаж.", effect: "Снизит затраты на хранение." };
  if (item.daysWithoutSales >= 180) return { action: "promo", reason: "Полгода без движения.", effect: "Потенциал вернуть 30–50% стоимости." };
  if (item.daysWithoutSales >= 90) return { action: "promo", reason: "3 месяца без продаж.", effect: "Вернёт часть вложенных средств." };
  if (item.daysWithoutSales >= 30) return { action: "keep", reason: "Недавно был в продаже.", effect: "Наблюдать ещё 30 дней." };
  return { action: "keep", reason: "Продавался недавно.", effect: "Продолжить мониторинг." };
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

/* ===================== FALLBACK BLOCK ===================== */

const FallbackBlock: React.FC<{
  item: DeadStockTileItem; heuristic: ReturnType<typeof getHeuristicAction>;
}> = ({ item, heuristic }) => (
  <div className="space-y-3">
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Базовая оценка</h3>
      <ul className="space-y-1">
        <li className="text-xs text-foreground/80 flex gap-2"><span className="text-primary shrink-0 mt-0.5">•</span>{item.daysWithoutSales >= 999 ? "Ни разу не продавался" : `Последняя продажа: ${item.lastSaleDate || "нет данных"}`}</li>
        <li className="text-xs text-foreground/80 flex gap-2"><span className="text-primary shrink-0 mt-0.5">•</span>Остаток: {item.quantity} шт. — {item.shopName}</li>
        <li className="text-xs text-foreground/80 flex gap-2"><span className="text-primary shrink-0 mt-0.5">•</span>{item.daysWithoutSales >= 999 ? "Нет в статистике" : `${item.daysWithoutSales} дн. без продаж`}</li>
      </ul>
    </div>
    <div className={`rounded-xl p-3.5 border ${heuristic.action === "writeoff" ? "bg-red-50 dark:bg-red-900/20 border-red-200" : heuristic.action === "promo" ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200" : "bg-green-50 dark:bg-green-900/20 border-green-200"}`}>
      <p className="text-xs">{heuristic.reason}</p>
      <p className="text-[11px] font-medium mt-1.5 text-green-700 dark:text-green-400 flex items-center gap-1"><TrendingUp className="w-3 h-3" />{heuristic.effect}</p>
    </div>
  </div>
);

/* ===================== COMPONENT ===================== */

export const DeadStockDetailModal: React.FC<DeadStockDetailModalProps> = ({
  item, onClose, onAction,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [fastData, setFastData] = useState<FastData | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [actionTaken, setActionTaken] = useState(false);
  const [showShopPicker, setShowShopPicker] = useState(false);
  // Multi-shop move: { shopId -> qty }
  const [moveMap, setMoveMap] = useState<Record<string, number>>({});

  const heuristic = useMemo(() => getHeuristicAction(item), [item]);

  // Мгновенная загрузка (скрипты, без AI)
  const fetchFastData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/analytics/dead-stock/analyze?itemId=${item.itemId}&shopId=${item.shopId}&fast=1`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || `Ошибка ${res.status}`);
      setFastData({
        salesHistory: json.salesHistory ?? [],
        allShopsSales: json.allShopsSales ?? [],
        allShops: json.allShops ?? [],
      });
    } catch (err: any) {
      let msg = err.message || "Не удалось загрузить данные";
      try { const p = JSON.parse(msg); if (p.error) msg = p.error; } catch {}
      setError(msg);
    } finally { setLoading(false); }
  }, [item.itemId, item.shopId]);

  // AI по требованию
  const fetchAiAnalysis = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await fetch(`/api/analytics/dead-stock/analyze?itemId=${item.itemId}&shopId=${item.shopId}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || `Ошибка ${res.status}`);
      setAnalysis(json.analysis ?? null);
    } catch (err: any) {
      let msg = err.message || "AI не ответил";
      try { const p = JSON.parse(msg); if (p.error) msg = p.error; } catch {}
      setError(msg);
    } finally { setAiLoading(false); }
  }, [item.itemId, item.shopId]);

  useEffect(() => { fetchFastData(); }, [fetchFastData]);

  // Скриптовая рекомендация на основе данных по магазинам
  const scriptRecommendation = useMemo(() => {
    if (!fastData) return null;
    const others = fastData.allShopsSales.filter(s => s.uuid !== item.shopId && s.qty > 0);
    if (others.length === 0) return { action: "writeoff" as const, text: "Нет продаж нигде — рекомендуется списание" };
    const best = others.reduce((a, b) => a.qty > b.qty ? a : b);
    return {
      action: "move" as const,
      text: `Продаётся в «${best.shopName}» — ${best.qty} шт. за 90 дн.`,
      shopId: best.uuid,
      shopName: best.shopName,
    };
  }, [fastData, item.shopId]);

  // Предзаполнить moveMap из скриптовой рекомендации
  useEffect(() => {
    if (scriptRecommendation?.action === "move" && scriptRecommendation.shopId) {
      setMoveMap({ [scriptRecommendation.shopId]: item.quantity });
    }
  }, [scriptRecommendation, item.quantity]);

  const handleMultiMove = () => {
    const entries = Object.entries(moveMap).filter(([, qty]) => qty > 0);
    if (entries.length === 0) return;
    const targetShops = entries.map(([shopId, qty]) => ({
      shopId,
      shopName: fastData?.allShops.find(s => s.uuid === shopId)?.name || shopId,
      qty,
    }));
    onAction({
      itemId: item.itemId, name: item.name, article: item.article,
      shopId: item.shopId, shopName: item.shopName,
      action: "move", targetShops, quantity: entries.reduce((s, [, q]) => s + q, 0),
      reason: scriptRecommendation?.text || "",
    });
    setActionTaken(true);
  };

  const handleSimpleAction = (action: PlannedAction["action"]) => {
    onAction({
      itemId: item.itemId, name: item.name, article: item.article,
      shopId: item.shopId, shopName: item.shopName, action,
      quantity: item.quantity,
      reason: analysis?.explanation?.slice(0, 120) || "",
    });
    setActionTaken(true);
  };

  const chartData = useMemo(() => fastData?.salesHistory ?? [], [fastData]);
  const maxSum = useMemo(() => chartData.length ? Math.max(...chartData.map(d => d.sum), 100) : 100, [chartData]);

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.div
          className="bg-card w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92dvh] overflow-y-auto flex flex-col"
          style={{ paddingBottom: "max(var(--app-bottom-clearance, 0px), 16px)" }}
          initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-card z-10 flex items-start justify-between p-4 border-b border-border app-safe-top">
            <div className="min-w-0 flex-1 pr-3">
              <h2 className="text-base font-semibold leading-tight">{item.name}</h2>
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{item.article}</p>
            </div>
            <button onClick={onClose} className="shrink-0 p-1.5 rounded-lg hover:bg-secondary"><X className="w-5 h-5" /></button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2 p-4 pb-0">
            {[{ icon: Hash, val: item.quantity, lbl: "Остаток, шт" },
              { icon: Clock, val: item.daysWithoutSales >= 999 ? "∞" : item.daysWithoutSales, lbl: "Дней без продаж" },
              { icon: ShoppingCart, val: item.sold, lbl: "Продано за период" },
              { icon: TrendingUp, val: item.totalFrozenCost != null ? `${item.totalFrozenCost.toFixed(0)} ₽` : "—", lbl: "Заморожено" },
            ].map((s, i) => (
              <div key={i} className="bg-secondary/50 rounded-xl p-2.5 text-center">
                <s.icon className="w-3.5 h-3.5 mx-auto mb-0.5 text-muted-foreground" />
                <p className="text-base font-bold">{s.val}</p>
                <p className="text-[10px] text-muted-foreground">{s.lbl}</p>
              </div>
            ))}
          </div>

          {/* Chart */}
          {!loading && chartData.length > 0 && (
            <div className="px-4 pt-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Продажи за 90 дней</h3>
              <div style={{ width: "100%", height: CHART_HEIGHT }}>
                <ResponsiveContainer>
                  <AreaChart data={chartData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                    <defs><linearGradient id="colorSum" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                    <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={35} domain={[0, maxSum]} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 11 }}
                      labelFormatter={formatDateLabel}
                      formatter={(v: number, n: string) => [n === "sum" ? `${v.toLocaleString("ru-RU")} ₽` : `${v} шт`, n === "sum" ? "Выручка" : "Кол-во"]} />
                    <Area type="monotone" dataKey="sum" stroke="#6366f1" strokeWidth={1.5} fill="url(#colorSum)" dot={false} activeDot={{ r: 3, fill: "#6366f1" }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="p-4 pt-3 flex-1 space-y-3">
            {loading && <div className="flex flex-col items-center py-10 text-muted-foreground gap-3"><Loader2 className="w-7 h-7 animate-spin" /><p className="text-sm">Загрузка...</p></div>}

            {error && <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 border border-red-200 dark:border-red-800">
              <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
              <button onClick={fetchFastData} className="mt-2 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700">Повторить</button>
            </div>}

            {/* Таблица продаж по магазинам */}
            {fastData && !loading && (
              <div>
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Продажи по магазинам за 90 дн.
                </h3>
                <div className="bg-secondary/30 rounded-xl overflow-hidden">
                  {fastData.allShopsSales
                    .sort((a, b) => b.qty - a.qty)
                    .map(s => {
                      const isCurrent = s.uuid === item.shopId;
                      return (
                        <div key={s.uuid} className={`flex items-center justify-between px-3 py-2 text-xs border-b border-border/50 last:border-0 ${isCurrent ? "bg-primary/5" : ""}`}>
                          <span className="flex items-center gap-1.5">
                            {isCurrent && <span className="text-[9px] bg-primary/20 text-primary px-1 rounded">текущий</span>}
                            {s.shopName}
                          </span>
                          <span className={`font-semibold ${s.qty > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                            {s.hasProduct ? `${s.qty} шт.` : "—"}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Скриптовая рекомендация */}
            {scriptRecommendation && !analysis && (
              <div className={`rounded-xl p-3 border ${scriptRecommendation.action === "move" ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200" : "bg-red-50 dark:bg-red-900/20 border-red-200"}`}>
                <p className="text-xs font-medium">{scriptRecommendation.text}</p>
              </div>
            )}

            {/* AI анализ (если загружен) */}
            {analysis && (
              <div className={`rounded-xl p-3 border ${analysis.recommendedAction === "writeoff" ? "bg-red-50 dark:bg-red-900/20 border-red-200" : analysis.recommendedAction === "move" ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200" : analysis.recommendedAction === "promo" ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200" : "bg-green-50 dark:bg-green-900/20 border-green-200"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white dark:bg-gray-800 shadow-sm">
                    {ACTION_DEFS.find(d => d.key === analysis.recommendedAction)?.icon}
                  </span>
                  <span className="text-xs font-bold">AI: {ANALYSIS_LABELS[analysis.recommendedAction]}</span>
                </div>
                <p className="text-xs leading-relaxed">{analysis.explanation}</p>
                {analysis.expectedEffect && <p className="text-[10px] font-medium mt-1 text-green-700 dark:text-green-400">{analysis.expectedEffect}</p>}
              </div>
            )}
          </div>

          {/* Actions */}
          {!loading && !actionTaken && (
            <div className="sticky bottom-0 bg-card border-t border-border p-3 space-y-2">
              {/* Multi-shop move picker */}
              {showShopPicker && (
                <div className="bg-secondary/30 rounded-xl p-3 space-y-2" onClick={e => e.stopPropagation()}>
                  <p className="text-[11px] font-medium">Распределите остаток ({item.quantity} шт.) по магазинам:</p>
                  {fastData?.allShops.filter(s => s.uuid !== item.shopId).map(s => {
                    const qty = moveMap[s.uuid] || 0;
                    return (
                      <div key={s.uuid} className="flex items-center gap-2">
                        <span className="text-xs flex-1 truncate">{s.name}</span>
                        <input type="number" min={0} max={item.quantity} value={qty}
                          onChange={e => setMoveMap(prev => ({ ...prev, [s.uuid]: Math.max(0, Math.min(item.quantity, +e.target.value || 0)) }))}
                          onClick={e => e.stopPropagation()}
                          className="w-14 px-2 py-1.5 rounded-lg bg-card border border-border text-xs text-center" />
                        <span className="text-[10px] text-muted-foreground w-8">шт.</span>
                      </div>
                    );
                  })}
                  <p className="text-[10px] text-muted-foreground">
                    Распределено: {Object.values(moveMap).reduce((s, q) => s + q, 0)} / {item.quantity} шт.
                  </p>
                  {item.unitCost != null && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                      Перемещаем на {(Object.values(moveMap).reduce((s, q) => s + q, 0) * item.unitCost).toFixed(0)} ₽ по закупочной цене
                    </p>
                  )}
                  <button type="button" onClick={e => { e.stopPropagation(); handleMultiMove(); }}
                    className="w-full py-2.5 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition">
                    Переместить
                  </button>
                </div>
              )}

              {/* Основные кнопки */}
              <div className="space-y-1.5">
                {/* Переместить (основная) */}
                <button type="button" onClick={e => { e.stopPropagation(); setShowShopPicker(prev => !prev); }}
                  className="w-full flex items-center justify-between gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition">
                  <span className="flex items-center gap-2"><MoveRight className="w-4 h-4" />Переместить</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <div className="grid grid-cols-3 gap-1.5">
                  <button type="button" onClick={e => { e.stopPropagation(); handleSimpleAction("writeoff"); }}
                    className="flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-medium bg-card border border-border text-muted-foreground hover:border-red-300 hover:text-red-600 transition">
                    <Trash2 className="w-3 h-3" />Списать
                  </button>
                  <button type="button" onClick={e => { e.stopPropagation(); handleSimpleAction("promo"); }}
                    className="flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-medium bg-card border border-border text-muted-foreground hover:border-amber-300 hover:text-amber-600 transition">
                    <Tag className="w-3 h-3" />Промо
                  </button>
                  <button type="button" onClick={e => { e.stopPropagation(); handleSimpleAction("keep"); }}
                    className="flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-medium bg-card border border-border text-muted-foreground hover:border-green-300 hover:text-green-600 transition">
                    <Package className="w-3 h-3" />Оставить
                  </button>
                </div>

                {/* AI кнопка */}
                {!analysis && !aiLoading && (
                  <button type="button" onClick={e => { e.stopPropagation(); fetchAiAnalysis(); }}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium border border-dashed border-violet-300 text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition">
                    🔮 Спросить AI
                  </button>
                )}
                {aiLoading && (
                  <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />AI думает...
                  </div>
                )}
              </div>
            </div>
          )}

          {actionTaken && (
            <div className="sticky bottom-0 bg-card border-t border-border p-4">
              <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 border border-green-200 dark:border-green-800 text-center">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">✅ Действие запланировано</p>
                <p className="text-[11px] text-muted-foreground mt-1">{item.name}</p>
              </div>
              <button onClick={onClose} className="w-full mt-2 py-2 rounded-xl text-sm border border-border hover:bg-secondary">Закрыть</button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
