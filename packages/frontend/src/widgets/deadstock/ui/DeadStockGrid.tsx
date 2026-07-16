import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Package, Clock, Hash, ShieldAlert, ArrowRight } from "lucide-react";
import { DeadStockDetailModal, type PlannedAction } from "./DeadStockDetailModal";

/* ===================== TYPES ===================== */

export interface DeadStockTileItem {
  itemId: string;
  name: string;
  article: string;
  quantity: number;
  sold: number;
  lastSaleDate: string | null;
  daysWithoutSales: number;
  shopId: string;
  shopName: string;
}

interface DeadStockGridProps {
  data: DeadStockTileItem[];
  shopUuid: string;
  onAction: (action: PlannedAction) => void;
  plannedActions: PlannedAction[];
}

/* ===================== HELPERS ===================== */

function getActionLabel(action: string): string {
  switch (action) {
    case "move": return "Переместить";
    case "writeoff": return "Списать";
    case "promo": return "Промо";
    default: return "Оставить";
  }
}

function getRecommendation(
  item: DeadStockTileItem,
  planned?: PlannedAction
): { text: string; color: string; isPlanned: boolean } {
  if (planned) {
    const label = getActionLabel(planned.action);
    const detail = planned.action === "move" && planned.targetShopName
      ? ` → ${planned.targetShopName} — ${planned.quantity} шт.`
      : planned.action === "move"
      ? ` — ${planned.quantity} шт.`
      : "";
    return {
      text: `${label}${detail}`,
      color: "text-green-600 bg-green-50 dark:bg-green-900/20",
      isPlanned: true,
    };
  }
  if (item.daysWithoutSales >= 999) return { text: "Никогда не продавался", color: "text-red-600 bg-red-50 dark:bg-red-900/20", isPlanned: false };
  if (item.daysWithoutSales >= 365) return { text: "Списать — год без продаж", color: "text-red-500 bg-red-50 dark:bg-red-900/20", isPlanned: false };
  if (item.daysWithoutSales >= 180) return { text: "Списать — полгода без продаж", color: "text-red-500 bg-red-50 dark:bg-red-900/20", isPlanned: false };
  if (item.daysWithoutSales >= 90) return { text: "Распродать со скидкой", color: "text-amber-600 bg-amber-50 dark:bg-amber-900/20", isPlanned: false };
  if (item.daysWithoutSales >= 30) return { text: "Требуется внимание", color: "text-blue-600 bg-blue-50 dark:bg-blue-900/20", isPlanned: false };
  return { text: "Под наблюдением", color: "text-green-600 bg-green-50 dark:bg-green-900/20", isPlanned: false };
}

function getDaysColor(days: number): string {
  if (days >= 365) return "text-red-600";
  if (days >= 90) return "text-amber-600";
  if (days >= 30) return "text-yellow-600";
  return "text-green-600";
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.02 } },
};

const itemAnim = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

/* ===================== COMPONENT ===================== */

export const DeadStockGrid: React.FC<DeadStockGridProps> = ({
  data, shopUuid, onAction, plannedActions,
}) => {
  const [selectedItem, setSelectedItem] = useState<DeadStockTileItem | null>(null);

  const plannedMap = useMemo(
    () => new Map(plannedActions.map(a => [`${a.itemId}|${a.shopId}`, a])),
    [plannedActions]
  );

  const sections = useMemo(() => {
    const critical = data.filter(i => i.daysWithoutSales >= 180);
    const warning = data.filter(i => i.daysWithoutSales >= 90 && i.daysWithoutSales < 180);
    const attention = data.filter(i => i.daysWithoutSales < 90);
    return [
      { label: `Критичные · ${critical.length}`, items: critical, color: "text-red-500", show: critical.length > 0 },
      { label: `Внимание · ${warning.length}`, items: warning, color: "text-amber-500", show: warning.length > 0 },
      { label: `Наблюдение · ${attention.length}`, items: attention, color: "text-blue-500", show: attention.length > 0 },
    ].filter(s => s.show);
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Package className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm">Нет мёртвых остатков за выбранный период</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {sections.map((section, si) => (
          <div key={si}>
            <h3 className={`text-[11px] font-semibold uppercase tracking-wider mb-2 px-1 ${section.color}`}>
              {section.label}
            </h3>
            <motion.div
              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
              variants={container} initial="hidden" animate="show"
            >
              {section.items.map((item) => {
                const planned = plannedMap.get(`${item.itemId}|${item.shopId}`);
                const rec = getRecommendation(item, planned);
                const daysColor = getDaysColor(item.daysWithoutSales);

                return (
                  <motion.button
                    key={item.itemId + item.shopId}
                    variants={itemAnim}
                    onClick={() => setSelectedItem(item)}
                    className={`bg-card border rounded-xl p-3 text-left transition active:scale-[0.98] ${
                      rec.isPlanned
                        ? "border-green-400 bg-green-50/30 dark:bg-green-900/10 hover:border-green-500"
                        : "border-border hover:border-primary/40 hover:shadow-sm"
                    }`}
                  >
                    {/* Строка 1: название + артикул */}
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate flex-1">
                        {item.name}
                      </p>
                      <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                        {item.article}
                      </span>
                    </div>

                    {/* Строка 2: остаток + дней без продаж */}
                    <div className="flex items-center gap-3 mt-1.5 text-[11px]">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Hash className="w-3 h-3" />
                        Остаток: {item.quantity} шт.
                      </span>
                      <span className={`flex items-center gap-1 font-semibold ${daysColor}`}>
                        <Clock className="w-3 h-3" />
                        {item.daysWithoutSales >= 999 ? "∞ дн." : `${item.daysWithoutSales} дн.`}
                      </span>
                    </div>

                    {/* Строка 3: рекомендация */}
                    <div className={`mt-2 text-[11px] font-medium rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 ${rec.color}`}>
                      {rec.isPlanned ? (
                        <>
                          <span className="text-[9px] bg-green-200 dark:bg-green-800 rounded-full px-1">✓</span>
                          {rec.text}
                        </>
                      ) : item.daysWithoutSales >= 999 ? (
                        <>
                          <ShieldAlert className="w-3 h-3 shrink-0" />
                          {rec.text}
                        </>
                      ) : (
                        <>
                          <ArrowRight className="w-3 h-3 shrink-0" />
                          {rec.text}
                        </>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          </div>
        ))}
      </div>

      {selectedItem && (
        <DeadStockDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onAction={onAction}
        />
      )}
    </>
  );
};
