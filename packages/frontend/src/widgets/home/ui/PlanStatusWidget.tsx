import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Package,
  Target,
  Clock,
} from "lucide-react";
import { usePlanData, usePlanWeekAgo } from "@/hooks/usePlanData";
import { useGetShopNames } from "@/hooks/useGetShopNames";
import {
  formatMoney,
  formatPercent,
  formatDelta,
  formatRate,
  type PlanShop,
  type PlanDomainModel,
} from "@/features/plan/planService";

// ── Цвета статусов ──
const STATUS_COLORS = {
  green:  { bg: "#ECFDF5", text: "#065F46", accent: "#10B981", dot: "bg-green-500", badge: "bg-green-100 text-green-700", bar: "bg-green-500", border: "border-l-green-500" },
  yellow: { bg: "#FFFBEB", text: "#78350F", accent: "#F59E0B", dot: "bg-yellow-500", badge: "bg-yellow-100 text-yellow-700", bar: "bg-yellow-500", border: "border-l-yellow-500" },
  red:    { bg: "#FEF2F2", text: "#7F1D1D", accent: "#EF4444", dot: "bg-red-500", badge: "bg-red-100 text-red-700", bar: "bg-red-500", border: "border-l-red-500" },
} as const;

// ═══════════════════════════════════════════
// NetworkSummaryBar
// ═══════════════════════════════════════════
function NetworkSummaryBar({ model }: { model: PlanDomainModel }) {
  const { network } = model;
  const netStatus = network.progress >= 1 ? "green" : network.progress >= 0.7 ? "yellow" : "red";
  const colors = STATUS_COLORS[netStatus];

  return (
    <div className="rounded-xl mb-3 overflow-hidden" style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)" }}>
      <div className="px-4 py-3.5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-white text-sm font-semibold">Сеть</div>
            <div className="text-white/70 text-xs mt-0.5">
              {formatMoney(network.totalPlan)} план / {formatMoney(network.totalFact)} факт
            </div>
          </div>
          <div className="text-white text-2xl font-bold tabular-nums">
            {formatPercent(network.progress)}
          </div>
          <div className="text-white/70 text-xs text-right">
            {network.shopsOnTarget} из {network.shopsTotal} выполняют
          </div>
        </div>
      </div>
      <div className="h-1.5 bg-white/20">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(network.progress * 100, 100)}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="h-full rounded-r"
          style={{ background: network.progress >= 1 ? "#10B981" : "#FFFFFF" }}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// ShopCard
// ═══════════════════════════════════════════
function ShopCard({
  shop,
  index,
  isExpanded,
  onToggle,
  todayDate,
}: {
  shop: PlanShop;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  todayDate: string;
}) {
  const colors = STATUS_COLORS[shop.status];
  const progressPct = Math.min(shop.progress * 100, 100);
  const overPlan = shop.progress > 1;

  // Week comparison (lazy — загружается всегда для простоты, React Query кеширует)
  const { data: weekModel } = usePlanWeekAgo(todayDate);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden mb-2 transition-shadow duration-200 ${
        isExpanded ? "shadow-md border-gray-300 dark:border-gray-600" : "hover:shadow-md"
      } border-l-4 ${colors.border}`}
    >
      {/* ── Свёрнутое состояние ── */}
      <div onClick={onToggle} className="cursor-pointer p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${colors.dot}`} style={{ boxShadow: `0 0 6px ${colors.accent}` }} />
            <span className="font-semibold text-gray-900 dark:text-white" style={{ fontSize: 16 }}>{shop.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="tabular-nums font-bold text-gray-900 dark:text-white" style={{ fontSize: 22 }}>
              {formatPercent(shop.progress)}
            </span>
            <span className="text-xs font-medium rounded-md px-2 py-0.5" style={{ background: colors.bg, color: colors.text }}>
              {shop.statusLabel}
            </span>
          </div>
        </div>

        {/* Прогресс-бар */}
        <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-2.5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.6, ease: "easeOut", delay: index * 0.05 }}
            className={`h-full rounded-full ${overPlan ? "bg-green-500 animate-pulse" : colors.bar}`}
            style={overPlan ? { boxShadow: "0 0 8px rgba(16,185,129,0.5)" } : undefined}
          />
        </div>

        <div className="flex items-center justify-between text-xs">
          <div>
            <span className="text-gray-500 dark:text-gray-400">План: </span>
            <span className="font-medium tabular-nums text-gray-900 dark:text-white" style={{ fontSize: 14 }}>
              {formatMoney(shop.plan)} ₽
            </span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Факт: </span>
            <span className={`font-medium tabular-nums ${shop.status === "green" ? "text-green-600" : shop.status === "yellow" ? "text-yellow-600" : "text-red-600"}`} style={{ fontSize: 14 }}>
              {formatMoney(shop.fact)} ₽
            </span>
          </div>
          <div className={`flex items-center gap-0.5 font-medium ${shop.delta >= 0 ? "text-green-600" : "text-red-500"}`} style={{ fontSize: 13 }}>
            {shop.delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {formatDelta(shop.delta)}
          </div>
        </div>
      </div>

      {/* ── Раскрытое состояние ── */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden border-t border-gray-100 dark:border-gray-700"
          >
            <div className="px-4 py-3 space-y-4 bg-gray-50/50 dark:bg-gray-800/50">
              {/* ── ForecastBlock ── */}
              <ForecastBlock shop={shop} />

              {/* ── ProductList ── */}
              <ProductList products={shop.products} />

              {/* ── WeekComparison ── */}
              <WeekComparison
                shop={shop}
                weekData={weekModel ?? null}
              />

              {/* ── ExportBlock ── */}
              <ExportBlock shop={shop} date={todayDate} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Подвал карточки */}
      <div className="px-4 py-1.5 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 flex items-center justify-end gap-1 cursor-pointer" onClick={onToggle}>
        {isExpanded ? <>Свернуть <ChevronUp className="w-3 h-3" /></> : <>Детали <ChevronDown className="w-3 h-3" /></>}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════
// ForecastBlock
// ═══════════════════════════════════════════
function ForecastBlock({ shop }: { shop: PlanShop }) {
  const isOnTrack = shop.forecast >= shop.plan;
  const currentRate = shop.fact / Math.max(new Date().getHours() - 9, 0.5);

  return (
    <div className="rounded-lg bg-white dark:bg-gray-800 p-3 border border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-1.5 mb-2">
        <Target className="w-3.5 h-3.5 text-blue-500" />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Прогноз</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-gray-500">К концу дня: </span>
          <span className="font-semibold tabular-nums" style={{ fontSize: 14 }}>{formatMoney(shop.forecast)} ₽</span>
        </div>
        <div className="text-right">
          {isOnTrack ? (
            <span className="text-green-600 font-medium">✅ успеваем</span>
          ) : (
            <span className="text-red-500 font-medium">⚠️ не успеваем</span>
          )}
        </div>
        <div>
          <span className="text-gray-500">Нужный темп: </span>
          <span className="font-semibold text-orange-600">{formatRate(shop.requiredHourlyRate)}</span>
        </div>
        <div className="text-right">
          <span className="text-gray-500">Текущий: </span>
          <span className="font-semibold text-blue-600">{formatRate(currentRate)}</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// ProductList
// ═══════════════════════════════════════════
function ProductList({ products }: { products: PlanShop["products"] }) {
  const maxQty = products.length > 0 ? Math.max(...products.map(p => p.qty), 1) : 1;
  const display = products.slice(0, 5);

  return (
    <div className="rounded-lg bg-white dark:bg-gray-800 p-3 border border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-1.5 mb-2">
        <Package className="w-3.5 h-3.5 text-purple-500" />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Продажи вейпов сегодня</span>
      </div>
      {display.length === 0 ? (
        <div className="text-xs text-gray-400 py-1">Нет продаж</div>
      ) : (
        <div className={`space-y-1.5 ${products.length > 5 ? "max-h-32 overflow-auto pr-1" : ""}`}>
          {display.map((p) => (
            <div key={p.name} className="flex items-center gap-2 text-xs">
              <span className="flex-1 truncate text-gray-700 dark:text-gray-300 font-medium">{p.name}</span>
              <span className="tabular-nums text-gray-500 w-10 text-right">{p.qty} шт</span>
              {p.sum > 0 && <span className="tabular-nums text-gray-400 w-14 text-right">{formatMoney(p.sum)} ₽</span>}
              <div className="w-12 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-purple-400 rounded-full" style={{ width: `${(p.qty / maxQty) * 100}%` }} />
              </div>
            </div>
          ))}
          {products.length > 5 && (
            <div className="text-xs text-gray-400 pt-0.5">+ ещё {products.length - 5} позиций</div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// WeekComparison
// ═══════════════════════════════════════════
function WeekComparison({
  shop,
  weekData,
}: {
  shop: PlanShop;
  weekData: PlanDomainModel | null;
}) {
  if (!weekData) {
    return (
      <div className="rounded-lg bg-white dark:bg-gray-800 p-3 border border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-1.5 mb-2">
          <Clock className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Vs. прошлая неделя</span>
        </div>
        <div className="text-xs text-gray-400">Нет данных за прошлую неделю</div>
      </div>
    );
  }

  const prevShop = weekData.shops.find(s => s.name === shop.name);
  if (!prevShop) {
    return (
      <div className="rounded-lg bg-white dark:bg-gray-800 p-3 border border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-1.5 mb-2">
          <Clock className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Vs. прошлая неделя</span>
        </div>
        <div className="text-xs text-gray-400">Магазин не работал на прошлой неделе</div>
      </div>
    );
  }

  const deltaPct = prevShop.fact > 0 ? ((shop.fact - prevShop.fact) / prevShop.fact) * 100 : 0;
  const isUp = deltaPct >= 0;

  return (
    <div className="rounded-lg bg-white dark:bg-gray-800 p-3 border border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-1.5 mb-2">
        <Clock className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Vs. прошлая неделя</span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-500">{shop.name}:</span>
        <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{formatMoney(shop.fact)} ₽</span>
        <span className="text-gray-400">→ было:</span>
        <span className="tabular-nums text-gray-600 dark:text-gray-400">{formatMoney(prevShop.fact)} ₽</span>
        <span className={`font-medium tabular-nums flex items-center gap-0.5 ${isUp ? "text-green-600" : "text-red-500"}`}>
          {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {isUp ? "+" : ""}{deltaPct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// ExportBlock — share button
// ═══════════════════════════════════════════
function ExportBlock({ shop, date }: { shop: PlanShop; date: string }) {
  const [state, setState] = useState<"idle" | "generating" | "uploading" | "error">("idle");

  const handleShare = useCallback(async () => {
    try {
      setState("generating");

      // Создаём чистый блок с белым фоном для скриншота
      const reportDiv = document.createElement("div");
      reportDiv.style.cssText = `
        position: fixed; left: -9999px; top: 0;
        width: 640px; background: #ffffff; color: #111827;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        padding: 24px; line-height: 1.5;
      `;
      reportDiv.innerHTML = `
        <div style="font-size: 20px; font-weight: 700; margin-bottom: 4px;">${shop.name}</div>
        <div style="font-size: 13px; color: #6B7280; margin-bottom: 16px;">${date}</div>
        <div style="background: #F3F4F6; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 12px; color: #6B7280;">План</div>
              <div style="font-size: 24px; font-weight: 700;">${formatMoney(shop.plan)} ₽</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 12px; color: #6B7280;">Факт</div>
              <div style="font-size: 24px; font-weight: 700; color: ${shop.status === "green" ? "#059669" : shop.status === "yellow" ? "#D97706" : "#DC2626"};">${formatMoney(shop.fact)} ₽</div>
            </div>
          </div>
          <div style="margin-top: 12px; background: #E5E7EB; border-radius: 8px; height: 8px; overflow: hidden;">
            <div style="height: 100%; width: ${Math.min(shop.progress * 100, 100)}%; background: ${shop.progress >= 1 ? "#10B981" : shop.progress >= 0.7 ? "#F59E0B" : "#EF4444"}; border-radius: 8px;"></div>
          </div>
          <div style="margin-top: 8px; font-size: 14px; font-weight: 600;">${formatPercent(shop.progress)} — ${shop.statusLabel}</div>
        </div>
        ${shop.products.length > 0 ? `
        <div style="margin-bottom: 16px;">
          <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">📦 Продано сегодня</div>
          ${shop.products.slice(0, 8).map(p => `
            <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #F3F4F6; font-size: 13px;">
              <span>${p.name}</span>
              <span style="font-weight: 600;">${p.qty} шт${p.sum > 0 ? ` · ${formatMoney(p.sum)} ₽` : ""}</span>
            </div>
          `).join("")}
          ${shop.products.length > 8 ? `<div style="font-size: 12px; color: #9CA3AF; margin-top: 4px;">+ ещё ${shop.products.length - 8} позиций</div>` : ""}
        </div>
        ` : ""}
        <div style="font-size: 11px; color: #9CA3AF; text-align: center; margin-top: 16px;">gimolost2.ru · ${new Date().toLocaleDateString("ru-RU")}</div>
      `;
      document.body.appendChild(reportDiv);

      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(reportDiv, {
        backgroundColor: "#ffffff",
        scale: 2,
      });

      document.body.removeChild(reportDiv);

      setState("uploading");
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.92)
      );

      const formData = new FormData();
      formData.append("file", blob, "report.jpg");

      const res = await fetch("/api/evotor/share-report", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      window.open(`${window.location.origin}${data.url}`, "_blank");
      setState("idle");
    } catch {
      setState("error");
    }
  }, [shop, date]);

  return (
    <div className="flex flex-col items-center gap-2">
      {state === "error" ? (
        <div className="text-xs text-red-500 mb-1">Ошибка, попробуй ещё раз</div>
      ) : null}
      <button
        type="button"
        onClick={handleShare}
        disabled={state === "generating" || state === "uploading"}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3.5 text-sm font-semibold hover:from-blue-700 hover:to-blue-800 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-md shadow-blue-900/20"
      >
        {state === "generating" ? <>⏳ Генерирую...</> : state === "uploading" ? <>📤 Загружаю...</> : <>📤 Поделиться отчётом</>}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════
// PlanStatusWidget
// ═══════════════════════════════════════════
interface PlanStatusWidgetProps {
  date: string;
}

export function PlanStatusWidget({ date }: PlanStatusWidgetProps) {
  const { data: shopNames = [], isLoading: shopsLoading } = useGetShopNames();
  const { data: model, isLoading, isError, error, refetch } = usePlanData(date);
  const [expandedShop, setExpandedShop] = useState<string | null>(null);

  const toggleExpand = useCallback((shopName: string) => {
    setExpandedShop((prev) => (prev === shopName ? null : shopName));
  }, []);

  // ── Skeleton (первичная загрузка) ──
  if (shopsLoading || (isLoading && !model)) {
    return (
      <div className="w-full mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 animate-pulse">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700" />
                <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="ml-auto h-5 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
              <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mb-3" />
              <div className="flex justify-between">
                <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-3 w-14 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error ──
  if (isError) {
    return (
      <div className="w-full mb-8">
        <div className="bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-800 p-6 text-center">
          <p className="text-sm text-red-700 dark:text-red-300 mb-3">Не удалось загрузить данные плана</p>
          <p className="text-xs text-red-500 dark:text-red-400 mb-3">{error?.message || "Проверьте подключение"}</p>
          <button onClick={() => refetch()} className="px-4 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition">
            Повторить
          </button>
        </div>
      </div>
    );
  }

  // ── Empty ──
  if (!model || model.shops.length === 0) return null;

  return (
    <div className="w-full mb-8">
      {/* NetworkSummaryBar — всегда */}
      <NetworkSummaryBar model={model} />

      {/* Сетка карточек */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {model.shops.map((shop, index) => (
          <ShopCard
            key={shop.shopId}
            shop={shop}
            index={index}
            isExpanded={expandedShop === shop.shopId}
            onToggle={() => toggleExpand(shop.shopId)}
            todayDate={date}
          />
        ))}
      </div>
    </div>
  );
}
