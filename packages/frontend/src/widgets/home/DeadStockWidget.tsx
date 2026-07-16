import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  Package, TrendingDown, Clock, Sparkles,
  Truck, Trash2, Tag, ShieldCheck, X, Download,
} from "lucide-react";
import { useDeadStock } from "@/hooks/useDeadStock";

// ── Types ──

interface DeadStockItem {
  itemId: string;
  name: string;
  article: string | null;
  currentStock: number | null;
  daysWithoutSales: number;
  lastSaleDate: string | null;
  shopId: string;
  shopName: string;
  totalRevenueLast90Days: number;
}

interface PlanAction {
  itemId: string;
  shopId: string;
  shopName: string;
  itemName: string;
  action: "move" | "writeoff" | "promo" | "keep";
  targetShopId?: string;
  targetShopName?: string;
  quantity?: number;
  reason?: string;
}

interface AiAnalysis {
  reasons: string[];
  recommendedAction: "move" | "writeoff" | "promo" | "keep";
  targetShopId: string | null;
  targetShopName: string | null;
  quantity: number;
  explanation: string;
  expectedEffect: string;
}

interface AnalyzeResponse {
  item: { name: string; daysWithoutSales: number; marginPct: number; lastSaleDate: string | null; totalRevenueLast90Days: number };
  analysis: AiAnalysis;
  salesHistory: { date: string; qty: number; sum: number }[];
  otherShopsSales: { shopName: string; qty: number }[];
}

// ── Helpers ──

function daysLabel(n: number): string {
  if (n >= 999) return "никогда";
  if (n === 1) return "1 день";
  if (n < 5) return `${n} дня`;
  return `${n} дней`;
}

function fmtRub(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}k ₽`;
  return `${Math.round(n)} ₽`;
}

const actionIcons: Record<string, JSX.Element> = {
  move: <Truck className="w-5 h-5" />,
  writeoff: <Trash2 className="w-5 h-5" />,
  promo: <Tag className="w-5 h-5" />,
  keep: <ShieldCheck className="w-5 h-5" />,
};

const actionLabels: Record<string, string> = {
  move: "Переместить",
  writeoff: "Списать",
  promo: "Промо",
  keep: "Оставить",
};

const actionColors: Record<string, string> = {
  move: "border-blue-300 bg-blue-50 text-blue-700",
  writeoff: "border-red-300 bg-red-50 text-red-700",
  promo: "border-amber-300 bg-amber-50 text-amber-700",
  keep: "border-emerald-300 bg-emerald-50 text-emerald-700",
};

// ── Tile ──

function DeadTile({
  item,
  onClick,
}: {
  item: DeadStockItem;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="bg-card rounded-xl border border-border p-3 text-left w-full hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <span className="text-sm font-medium leading-tight line-clamp-2 flex-1">
          {item.name}
        </span>
        {item.daysWithoutSales >= 90 ? (
          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-bold">
            {item.daysWithoutSales}д
          </span>
        ) : (
          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 font-bold">
            {item.daysWithoutSales}д
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Package className="w-3 h-3" />
          {item.currentStock ?? "?"}
        </span>
        <span className="flex items-center gap-1">
          <TrendingDown className="w-3 h-3" />
          {daysLabel(item.daysWithoutSales)}
        </span>
        <span className="flex items-center gap-1 ml-auto">
          <Clock className="w-3 h-3" />
          {item.lastSaleDate?.slice(5) ?? "—"}
        </span>
      </div>
    </motion.button>
  );
}

// ── Modal ──

function AnalysisModal({
  item,
  onClose,
  onAction,
}: {
  item: DeadStockItem;
  onClose: () => void;
  onAction: (action: PlanAction) => void;
}) {
  const { data, isLoading, isError } = useQuery<AnalyzeResponse>({
    queryKey: ["dead-stock-analyze", item.itemId, item.shopId],
    queryFn: async () => {
      const res = await fetch(
        `/api/analytics/dead-stock/analyze?itemId=${item.itemId}&shopId=${item.shopId}`
      );
      if (!res.ok) throw new Error("Ошибка анализа");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl"
      >
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between z-10">
          <div className="flex-1 min-w-0 mr-2">
            <h2 className="text-base font-bold truncate">{item.name}</h2>
            <p className="text-xs text-muted-foreground">
              {item.shopName} · {daysLabel(item.daysWithoutSales)} без продаж
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="ml-3 text-sm text-muted-foreground">AI анализирует...</span>
            </div>
          )}

          {/* Error */}
          {isError && (
            <div className="text-center py-8 text-sm text-red-500">
              Не удалось загрузить анализ. Попробуйте позже.
            </div>
          )}

          {/* Analysis */}
          {data && (
            <>
              {/* Sales chart (simple bars) */}
              {data.salesHistory.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    Продажи за 90 дней
                  </div>
                  <div className="flex items-end gap-0.5 h-20">
                    {data.salesHistory.slice(0, 30).reverse().map((d, i) => {
                      const maxQty = Math.max(...data.salesHistory.map(s => s.qty), 1);
                      const h = Math.max(2, (d.qty / maxQty) * 100);
                      return (
                        <div
                          key={i}
                          className="flex-1 bg-primary/60 rounded-t"
                          style={{ height: `${h}%` }}
                          title={`${d.date}: ${d.qty} шт`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Reasons */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1.5">
                  Почему товар мёртвый
                </div>
                <ul className="space-y-1">
                  {data.analysis.reasons.map((r, i) => (
                    <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                      <span className="text-red-400 mt-0.5">•</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recommendation */}
              <div className={`rounded-xl border p-3 ${actionColors[data.analysis.recommendedAction]}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  {actionIcons[data.analysis.recommendedAction]}
                  <span className="text-sm font-bold">
                    {actionLabels[data.analysis.recommendedAction]}
                  </span>
                  {data.analysis.targetShopName && (
                    <span className="text-xs opacity-70">
                      → {data.analysis.targetShopName} ({data.analysis.quantity} шт)
                    </span>
                  )}
                </div>
                <p className="text-xs leading-relaxed">{data.analysis.explanation}</p>
                <p className="text-xs mt-1.5 font-medium">
                  📈 {data.analysis.expectedEffect}
                </p>
              </div>

              {/* Other shops */}
              {data.otherShopsSales.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1.5">
                    Продаётся в других магазинах
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.otherShopsSales.map((s) => (
                      <span
                        key={s.shopName}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-muted"
                      >
                        {s.shopName}: {s.qty} шт
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Action buttons */}
        {data && (
          <div className="border-t border-border p-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => onAction({
                itemId: item.itemId, shopId: item.shopId, shopName: item.shopName, itemName: item.name,
                action: "move",
                targetShopId: data.analysis.targetShopId ?? undefined,
                targetShopName: data.analysis.targetShopName ?? undefined,
                quantity: data.analysis.quantity,
                reason: data.analysis.explanation,
              })}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium active:bg-blue-700 transition-colors"
            >
              <Truck className="w-4 h-4" />
              Переместить
            </button>
            <button
              onClick={() => onAction({
                itemId: item.itemId, shopId: item.shopId, shopName: item.shopName, itemName: item.name,
                action: "writeoff",
                quantity: item.currentStock ?? undefined,
                reason: data.analysis.explanation,
              })}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium active:bg-red-700 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Списать
            </button>
            <button
              onClick={() => onAction({
                itemId: item.itemId, shopId: item.shopId, shopName: item.shopName, itemName: item.name,
                action: "promo",
                reason: "Распродажа со скидкой",
              })}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-medium active:bg-amber-700 transition-colors"
            >
              <Tag className="w-4 h-4" />
              Промо
            </button>
            <button
              onClick={() => onAction({
                itemId: item.itemId, shopId: item.shopId, shopName: item.shopName, itemName: item.name,
                action: "keep",
                reason: "Оставить без изменений",
              })}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium active:bg-emerald-700 transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              Оставить
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── Widget ──

const PERIOD_PRESETS: { label: string; since: string; until: string }[] = [
  { label: "7 дн.", since: (d => { d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); })(new Date()), until: new Date().toISOString().slice(0, 10) },
  { label: "30 дн.", since: (d => { d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10); })(new Date()), until: new Date().toISOString().slice(0, 10) },
  { label: "90 дн.", since: (d => { d.setDate(d.getDate() - 89); return d.toISOString().slice(0, 10); })(new Date()), until: new Date().toISOString().slice(0, 10) },
];

export function DeadStockWidget() {
  const [selected, setSelected] = useState<DeadStockItem | null>(null);
  const [limit, setLimit] = useState(6);
  const [daysThreshold, setDaysThreshold] = useState(45);
  const [shopId, setShopId] = useState<string | null>(null);
  const [preset, setPreset] = useState("90 дн.");
  const [plannedActions, setPlannedActions] = useState<PlanAction[]>([]);
  const downloadRef = useRef<HTMLAnchorElement>(null);

  const presetData = PERIOD_PRESETS.find(p => p.label === preset) || PERIOD_PRESETS[2];

  const { data, isLoading, isError } = useDeadStock({
    daysWithoutSales: daysThreshold,
    shopId: shopId,
    since: presetData.since,
    until: presetData.until,
  });

  // Fetch shops for dropdown
  const { data: shopsData } = useQuery<{ shopOptions: Record<string, string> }>({
    queryKey: ["shops-list"],
    queryFn: async () => {
      const res = await fetch("/api/evotor/shops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: "" }) });
      if (!res.ok) return { shopOptions: {} };
      return res.json();
    },
    staleTime: 600_000,
  });

  const items = data?.items?.slice(0, limit) ?? [];

  const handleDownload = async () => {
    if (plannedActions.length === 0) return;
    const res = await fetch("/api/analytics/dead-stock/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actions: plannedActions }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dead-stock-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addAction = useCallback((action: PlanAction) => {
    setPlannedActions(prev => {
      const exists = prev.find(a => a.itemId === action.itemId && a.shopId === action.shopId);
      if (exists) return prev.map(a => a.itemId === action.itemId && a.shopId === action.shopId ? action : a);
      return [...prev, action];
    });
  }, []);

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-4 animate-pulse">
        <div className="h-4 w-32 bg-muted rounded mb-3" />
        <div className="grid grid-cols-2 gap-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-500" />
            <span className="text-sm font-bold">Мёртвые остатки</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600 font-medium">
              {data?.total ?? 0}
            </span>
          </div>
          <button
            onClick={handleDownload}
            disabled={plannedActions.length === 0}
            className="flex items-center gap-1 text-[10px] font-medium text-violet-600 bg-violet-50 px-2 py-1 rounded-lg active:bg-violet-100 disabled:opacity-30 transition-colors"
          >
            <Download className="w-3 h-3" />
            {plannedActions.length > 0 ? `Скачать (${plannedActions.length})` : "Документ"}
          </button>
        </div>

        {/* Filters */}
        <div className="px-3 py-2 flex flex-wrap gap-1.5 border-b border-border/50">
          {/* Period presets */}
          <div className="flex gap-1">
            {PERIOD_PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => setPreset(p.label)}
                className={`px-2 py-0.5 text-[10px] rounded-full ${preset === p.label ? "bg-violet-600 text-white" : "bg-muted text-muted-foreground"}`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Days threshold */}
          <select
            value={daysThreshold}
            onChange={e => setDaysThreshold(Number(e.target.value))}
            className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-muted border-0"
          >
            <option value={30}>≥30 дней</option>
            <option value={45}>≥45 дней</option>
            <option value={60}>≥60 дней</option>
            <option value={90}>≥90 дней</option>
          </select>

          {/* Shop */}
          <select
            value={shopId ?? ""}
            onChange={e => setShopId(e.target.value || null)}
            className="text-[10px] px-1.5 py-0.5 rounded bg-muted border-0 max-w-[100px]"
          >
            <option value="">Все</option>
            {Object.entries(shopsData?.shopOptions ?? {}).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>

        {/* Tiles */}
        {items.length > 0 ? (
          <div className="p-2 grid grid-cols-2 gap-2">
            {items.map((item) => (
              <DeadTile
                key={item.itemId + item.shopId}
                item={item}
                onClick={() => setSelected(item)}
              />
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {isError ? "Ошибка загрузки" : "Нет мёртвых остатков за выбранный период"}
          </div>
        )}

        {/* Show more */}
        {data && data.total > limit && (
          <button
            onClick={() => setLimit((p) => p + 6)}
            className="w-full py-2 text-xs text-violet-600 hover:bg-violet-50 transition-colors font-medium"
          >
            Показать ещё ({data.total - limit})
          </button>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {selected && (
          <AnalysisModal
            item={selected}
            onClose={() => setSelected(null)}
            onAction={addAction}
          />
        )}
      </AnimatePresence>
    </>
  );
}
