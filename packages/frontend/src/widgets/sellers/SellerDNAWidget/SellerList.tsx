import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  User,
  Trophy,
  Medal,
  Award,
} from "lucide-react";
import { DateFilter, type DateFilterValue } from "@/widgets/home/DateFilter";
import type { SellerDNAProfile, DNALabel } from "./types";

// ===================== Types =====================

type SortField = "name" | "overallScore" | "rubPerHour" | "avgCheck" | "accShare";
type SortDir = "asc" | "desc";

interface SellerListProps {
  sellers: SellerDNAProfile[];
  onSellerSelect?: (seller: SellerDNAProfile) => void;
  dateFilter: DateFilterValue;
  onDateFilterChange: (v: DateFilterValue) => void;
  showAllSellers?: boolean;
  onToggleShowAll?: () => void;
}

const SORT_FIELDS: { key: SortField; label: string }[] = [
  { key: "name", label: "Имя" },
  { key: "overallScore", label: "Score" },
  { key: "rubPerHour", label: "Выручка/ч" },
  { key: "avgCheck", label: "Средний чек" },
  { key: "accShare", label: "% Аксессуары" },
];

// ===================== Helpers =====================

function formatMoney(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return `${n}`;
}

function initials(name: string) {
  const parts = name.split(" ");
  return parts.length >= 2
    ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function scoreColor(score: number): { ring: string; bg: string; text: string; label: string } {
  if (score >= 80) {
    return { ring: "stroke-success", bg: "bg-success/10", text: "text-success", label: "Высокий" };
  }
  if (score >= 60) {
    return { ring: "stroke-warning", bg: "bg-warning/10", text: "text-warning", label: "Средний" };
  }
  return { ring: "stroke-destructive", bg: "bg-destructive/10", text: "text-destructive", label: "Низкий" };
}

function cardBorder(score: number): string {
  if (score >= 80) return "border-l-success";
  if (score >= 60) return "border-l-warning";
  return "border-l-destructive";
}

const DNA_COLORS: Record<DNALabel, string> = {
  Охотник: "bg-success/10 text-success border-success/20",
  Стабильный: "bg-primary/10 text-primary border-primary/20",
  Одиночка: "bg-warning/10 text-warning border-warning/20",
  Восходящий: "bg-primary/10 text-primary border-primary/20",
  Проблемный: "bg-destructive/10 text-destructive border-destructive/20",
};

// ===================== Circular score =====================

function CircularScore({ score }: { score: number }) {
  const colors = scoreColor(score);
  const r = 18;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - score / 100);

  // Animate from 0 (full circle) to actual score on mount
  const [animOffset, setAnimOffset] = useState(circumference);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setAnimOffset(offset));
    return () => cancelAnimationFrame(raf);
  }, [offset]);

  return (
    <div className="relative w-11 h-11 shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 44 44">
        <circle
          cx="22" cy="22" r={r}
          fill="none"
          strokeWidth="3"
          className="stroke-muted"
        />
        <circle
          cx="22" cy="22" r={r}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          className={colors.ring}
          strokeDasharray={circumference}
          strokeDashoffset={animOffset}
          style={{ transition: "stroke-dashoffset 0.7s ease-out" }}
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums ${colors.text}`}
      >
        {score}
      </span>
    </div>
  );
}

// ===================== Rank badge =====================

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span title="1 место" className="shrink-0 text-base leading-none">
        🥇
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span title="2 место" className="shrink-0 text-base leading-none">
        🥈
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span title="3 место" className="shrink-0 text-base leading-none">
        🥉
      </span>
    );
  }
  return (
    <span className="shrink-0 w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground tabular-nums">
      {rank}
    </span>
  );
}

// ===================== Seller card =====================

function SellerCard({
  seller,
  onSelect,
}: {
  seller: SellerDNAProfile;
  onSelect?: (seller: SellerDNAProfile) => void;
}) {
  const sColor = scoreColor(seller.overallScore);
  const border = cardBorder(seller.overallScore);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-card border border-border border-l-[3px] ${border} rounded-xl p-3 cursor-pointer active:scale-[0.98] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md`}
      onClick={() => onSelect?.(seller)}
    >
      {/* Top row: avatar, name, dna label, score */}
      <div className="flex items-center gap-2.5">
        {/* Rank badge */}
        <RankBadge rank={seller.rank} />

        {/* Avatar / initials */}
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${sColor.bg} ${sColor.text}`}
        >
          {initials(seller.name)}
        </div>

        {/* Name + DNA label */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-foreground truncate">
              {seller.name}
            </span>
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium shrink-0 ${DNA_COLORS[seller.dnaLabel]}`}
            >
              {seller.dnaLabel}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {sColor.label} результат
          </span>
        </div>

        {/* Circular score */}
        <CircularScore score={seller.overallScore} />
      </div>

      {/* Metrics row */}
      <div className="mt-2.5 grid grid-cols-4 gap-1 text-center">
        <MetricCell
          label="₽/час"
          value={seller.rubPerHour != null ? `${formatMoney(seller.rubPerHour)}` : "—"}
        />
        <MetricCell
          label="Средний чек"
          value={`${seller.avgCheck}₽`}
        />
        <MetricCell
          label="% Аксесс."
          value={`${seller.accShare}%`}
        />
        <MetricCell
          label="% Мёртв."
          value={`${seller.deadTimePct}%`}
          warn={seller.deadTimePct > 20}
        />
      </div>
    </motion.div>
  );
}

function MetricCell({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] text-muted-foreground leading-tight">{label}</span>
      <span
        className={`text-xs font-semibold tabular-nums leading-tight ${
          warn ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// ===================== Sort header =====================

function SortHeader({
  field,
  currentField,
  dir,
  onSort,
}: {
  field: SortField;
  currentField: SortField;
  dir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const isActive = field === currentField;
  return (
    <button
      onClick={() => onSort(field)}
      className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition whitespace-nowrap ${
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      }`}
    >
      {SORT_FIELDS.find((f) => f.key === field)?.label ?? field}
      {isActive ? (
        dir === "asc" ? (
          <ArrowUp className="w-3 h-3" />
        ) : (
          <ArrowDown className="w-3 h-3" />
        )
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-30" />
      )}
    </button>
  );
}

// ===================== Main component =====================

export function SellerList({
  sellers,
  onSellerSelect,
  dateFilter,
  onDateFilterChange,
  showAllSellers,
  onToggleShowAll,
}: SellerListProps) {
  const [sortField, setSortField] = useState<SortField>("overallScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...sellers].sort((a, b) => {
      if (sortField === "name") {
        return dir * a.name.localeCompare(b.name, "ru");
      }
      const aVal = a[sortField] as number;
      const bVal = b[sortField] as number;
      const aN = aVal ?? -Infinity;
      const bN = bVal ?? -Infinity;
      if (aN === bN) return 0;
      return dir * (aN > bN ? 1 : -1);
    });
  }, [sellers, sortField, sortDir]);

  return (
    <div className="space-y-3">
      {/* Date filter */}
      <DateFilter value={dateFilter} onChange={onDateFilterChange} />

      {/* Toggle: today only vs all sellers for period */}
      {onToggleShowAll && (
        <div className="flex gap-1 bg-muted/60 rounded-md p-0.5 w-fit">
          <button
            onClick={() => showAllSellers && onToggleShowAll()}
            className={`px-2.5 py-1 text-[10px] font-medium rounded transition ${
              !showAllSellers
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Сегодня
          </button>
          <button
            onClick={() => !showAllSellers && onToggleShowAll()}
            className={`px-2.5 py-1 text-[10px] font-medium rounded transition ${
              showAllSellers
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Все за период
          </button>
        </div>
      )}

      {/* Sort header — horizontally scrollable on narrow screens */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {SORT_FIELDS.map((f) => (
          <SortHeader
            key={f.key}
            field={f.key}
            currentField={sortField}
            dir={sortDir}
            onSort={handleSort}
          />
        ))}
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {sorted.map((seller) => (
          <SellerCard
            key={seller.uuid}
            seller={seller}
            onSelect={onSellerSelect}
          />
        ))}
      </div>
    </div>
  );
}

export default SellerList;
