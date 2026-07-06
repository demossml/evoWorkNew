import { useMemo, useState } from "react";
import {
  ChevronDown, ChevronUp, AlertTriangle, PackageX,
  Store, Calendar, Package, ArrowUpDown, Sparkles,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface OrderV2Item {
  productUuid: string;
  productName: string;
  shopName: string;
  abcClass: "A" | "B" | "C";
  xyzClass: "X" | "Y" | "Z";
  currentStock: number;
  avgDailyDemand: number;
  recommendedOrderRounded: number;
  orderCost: number;
  confidence: number;
  reasonCodes: string[];
  demandStdDev: number;
  safetyStock: number;
  reorderPoint: number;
  targetStock: number;
  unitCost: number;
  expectedCoverageDays: number;
}

interface Props {
  items: OrderV2Item[];
  shops: Record<string, string>; // uuid → name
  selectedShopUuids: string[]; // shops selected in form
  startDate: string;
  endDate: string;
  analysisWeeks: number;
  onNewForecast: () => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = {
  LOW_STOCK: "Низкий остаток",
  NO_STOCK: "Нет на складе",
  STABLE: "Стабильный спрос",
  HIGH_VARIABILITY: "Нестабильный спрос",
  HIGH_DEMAND: "Высокий спрос",
  NEW_PRODUCT: "Новый товар",
  OVERSTOCK: "Избыток",
  NO_SALES: "Нет продаж",
  HIGH_VALUE: "Высокая ценность",
  BALANCED: "Сбалансировано",
};

const REASON_STYLES: Record<string, string> = {
  NO_STOCK: "bg-destructive/10 text-destructive ring-1 ring-destructive/20",
  LOW_STOCK: "bg-destructive/10 text-destructive ring-1 ring-destructive/20",
  HIGH_VARIABILITY: "bg-warning/10 text-warning ring-1 ring-warning/20",
  OVERSTOCK: "bg-warning/10 text-warning ring-1 ring-warning/20",
  HIGH_VALUE: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  HIGH_DEMAND: "bg-primary/10 text-primary ring-1 ring-primary/20",
  STABLE: "bg-success/10 text-success ring-1 ring-success/20",
  BALANCED: "bg-primary/10 text-primary ring-1 ring-primary/20",
  NEW_PRODUCT: "bg-muted text-muted-foreground ring-1 ring-border",
  NO_SALES: "bg-muted text-muted-foreground ring-1 ring-border",
};

const SORTS = [
  { key: "orderCost", label: "Сумма" },
  { key: "recommendedOrderRounded", label: "К заказу" },
  { key: "confidence", label: "Доверие" },
  { key: "avgDailyDemand", label: "Спрос/день" },
] as const;

const ABC_LABELS: Record<string, string> = {
  A: "A — основные товары",
  B: "B — средние товары",
  C: "C — второстепенные",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
  return n.toLocaleString("ru-RU") + " ₽";
}

function fmtCompactDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
  });
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ConfidencePill({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone =
    pct >= 75
      ? "bg-success/10 text-success ring-success/20"
      : pct >= 55
        ? "bg-warning/10 text-warning ring-warning/20"
        : "bg-destructive/10 text-destructive ring-destructive/20";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none ring-1 tabular-nums ${tone}`}
    >
      {pct}%
    </span>
  );
}

function AbcBadge({ abc }: { abc: string }) {
  const tone =
    abc === "A"
      ? "bg-primary text-primary-foreground"
      : abc === "B"
        ? "bg-secondary text-secondary-foreground"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${tone}`}
    >
      {abc}
    </span>
  );
}

function Metric({
  label,
  value,
  accent,
  danger,
  money,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  danger?: boolean;
  money?: boolean;
}) {
  return (
    <div className="text-left leading-none">
      <div className="text-[9px] font-medium text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 truncate font-bold tabular-nums ${
          money ? "text-[11px]" : "text-[13px]"
        } ${
          danger
            ? "text-destructive"
            : accent
              ? "text-primary"
              : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function ProductCard({ item }: { item: OrderV2Item }) {
  const [open, setOpen] = useState(false);
  const noStock = item.currentStock === 0;
  const isA = item.abcClass === "A";

  return (
    <div
      className={`rounded-2xl border bg-card transition-shadow ${
        isA
          ? "border-primary/30 shadow-[0_1px_0_0_hsl(var(--primary)/0.15)]"
          : "border-border"
      } ${noStock ? "ring-1 ring-destructive/30" : ""}`}
    >
      <div className="flex items-start gap-2 px-2.5 py-2">
        <AbcBadge abc={item.abcClass} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] font-semibold leading-tight text-foreground line-clamp-1">
              {item.productName}
            </p>
            <ConfidencePill value={item.confidence} />
          </div>

          {noStock && (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium leading-none text-destructive">
              <PackageX className="h-3 w-3" />
              Нет на складе
            </div>
          )}

          <div className="mt-1 flex items-center gap-2.5">
            <Metric
              label="Остаток"
              value={item.currentStock}
              danger={noStock}
            />
            <Metric
              label="К заказу"
              value={item.recommendedOrderRounded}
              accent={item.recommendedOrderRounded > 0}
            />
            <Metric label="Сумма" value={fmtMoney(item.orderCost)} money />

            {item.reasonCodes?.length > 0 && (
              <div className="ml-auto flex flex-1 flex-wrap justify-end gap-1">
                {item.reasonCodes.slice(0, 2).map((code) => (
                  <span
                    key={code}
                    className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ${
                      REASON_STYLES[code] ||
                      "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                    }`}
                  >
                    {REASON_LABELS[code] || code}
                  </span>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => setOpen((v) => !v)}
            className="mt-1 flex items-center gap-0.5 text-[11px] font-medium leading-none text-muted-foreground active:text-foreground"
          >
            {open ? "Скрыть" : "Подробнее"}
            {open ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>

          <div
            className="grid overflow-hidden transition-[grid-template-rows] duration-150 ease-out"
            style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
          >
            <div className="min-h-0">
              <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-slate-50 p-2 text-[11px]">
                <DetailRow
                  label="Спрос/день"
                  value={item.avgDailyDemand.toFixed(2)}
                />
                <DetailRow label="Класс XYZ" value={item.xyzClass} />
                <DetailRow
                  label="σ спроса"
                  value={item.demandStdDev.toFixed(2)}
                />
                <DetailRow label="Страх. запас" value={item.safetyStock} />
                <DetailRow label="Точка заказа" value={item.reorderPoint} />
                <DetailRow label="Целевой остаток" value={item.targetStock} />
                <DetailRow label="Цена ед." value={fmtMoney(item.unitCost)} />
                <DetailRow
                  label="Дней покрытия"
                  value={
                    item.expectedCoverageDays >= 999
                      ? "∞"
                      : item.expectedCoverageDays.toFixed(1)
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShopChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-card text-muted-foreground ring-1 ring-border"
      }`}
    >
      {children}
    </button>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function OrderForecastCards({
  items,
  shops,
  selectedShopUuids,
  startDate,
  endDate,
  analysisWeeks,
  onNewForecast,
}: Props) {
  const shopIds = selectedShopUuids;
  const [selectedShop, setSelectedShop] = useState<string>("all");
  const [sortKey, setSortKey] = useState<string>("orderCost");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showZero, setShowZero] = useState(false);
  const [collapsedAbc, setCollapsedAbc] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    let list =
      selectedShop === "all"
        ? items
        : items.filter((i) => shops[selectedShop] === i.shopName);
    list = [...list].sort((a: any, b: any) => {
      const diff = (a[sortKey] - b[sortKey]) * (sortDir === "desc" ? -1 : 1);
      return diff;
    });
    return list;
  }, [items, selectedShop, sortKey, sortDir, shops]);

  const active = filtered.filter((i) => i.recommendedOrderRounded > 0);
  const zero = filtered.filter((i) => i.recommendedOrderRounded === 0);

  const totalSum = active.reduce((s, i) => s + i.orderCost, 0);
  const totalCount = active.length;

  const grouped = useMemo(() => {
    const groups: Record<string, OrderV2Item[]> = { A: [], B: [], C: [] };
    active.forEach((i) => groups[i.abcClass].push(i));
    return groups;
  }, [active]);

  const toggleAbc = (k: string) =>
    setCollapsedAbc((s) => ({ ...s, [k]: !s[k] }));

  return (
    <div className="mx-auto max-w-[420px]">
      {/* Sticky summary bar */}
      <div className="sticky top-0 z-20 border-b border-border bg-card/95 px-3 py-2.5 backdrop-blur -mx-4 sm:-mx-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {fmtCompactDate(startDate)} – {fmtCompactDate(endDate)} ·{" "}
              {analysisWeeks} нед. анализа
            </div>
            <div className="mt-0.5 text-lg font-extrabold tabular-nums text-foreground">
              {fmtMoney(totalSum)}
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <Package className="h-3 w-3" />
              позиций
            </div>
            <div className="mt-0.5 text-lg font-extrabold tabular-nums text-foreground">
              {totalCount}
            </div>
          </div>
        </div>
        <button
          onClick={onNewForecast}
          className="mt-2 w-full rounded-xl bg-primary py-2 text-[13px] font-semibold text-primary-foreground active:bg-primary/90"
        >
          Сформировать новый прогноз
        </button>
      </div>

      {/* Shop filter — only when multiple shops selected */}
      {shopIds.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto px-3 py-2 -mx-4 sm:-mx-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ShopChip
            active={selectedShop === "all"}
            onClick={() => setSelectedShop("all")}
          >
            Все магазины
          </ShopChip>
          {shopIds.map((id) => (
            <ShopChip
              key={id}
              active={selectedShop === id}
              onClick={() => setSelectedShop(id)}
            >
              <Store className="mr-1 h-3 w-3" />
              {shops[id]}
            </ShopChip>
          ))}
        </div>
      )}

      {/* Sort chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto px-3 pb-2 -mx-4 sm:-mx-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        {SORTS.map((s) => (
          <button
            key={s.key}
            onClick={() => {
              if (sortKey === s.key)
                setSortDir((d) => (d === "desc" ? "asc" : "desc"));
              else {
                setSortKey(s.key);
                setSortDir("desc");
              }
            }}
            className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${
              sortKey === s.key
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground ring-1 ring-border"
            }`}
          >
            {s.label}{" "}
            {sortKey === s.key && (sortDir === "desc" ? "↓" : "↑")}
          </button>
        ))}
      </div>

      {/* Grouped cards */}
      <div className="space-y-4 px-3 pb-4 -mx-4 sm:-mx-6">
        {["A", "B", "C"].map((abc) =>
          grouped[abc].length ? (
            <div key={abc}>
              <button
                onClick={() => toggleAbc(abc)}
                className="mb-2 flex w-full items-center justify-between text-[12px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                <span className="flex items-center gap-1.5">
                  {abc === "A" && (
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  )}
                  {ABC_LABELS[abc]}
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {grouped[abc].length}
                  </span>
                </span>
                {collapsedAbc[abc] ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </button>
              {!collapsedAbc[abc] && (
                <div className="space-y-1.5">
                  {grouped[abc].map((item) => (
                    <ProductCard key={item.productUuid} item={item} />
                  ))}
                </div>
              )}
            </div>
          ) : null,
        )}

        {zero.length > 0 && (
          <div>
            <button
              onClick={() => setShowZero((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl bg-muted px-3 py-2 text-[12px] font-medium text-muted-foreground"
            >
              <span>Не требуют заказа ({zero.length})</span>
              {showZero ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {showZero && (
              <div className="mt-2 space-y-1.5">
                {zero.map((item) => (
                  <ProductCard key={item.productUuid} item={item} />
                ))}
              </div>
            )}
          </div>
        )}

        {active.length === 0 && zero.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <AlertTriangle className="h-6 w-6" />
            <p className="text-sm">Нет данных для этого магазина</p>
          </div>
        )}
      </div>
    </div>
  );
}
