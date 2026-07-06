import type { LucideIcon } from "lucide-react";
export type { LucideIcon };

export function LoadingTile({ title, Icon, tone = "blue" }: {
  title: string;
  Icon: LucideIcon;
  tone?: "blue" | "orange" | "purple" | "pink" | "cyan" | "indigo";
}) {
  const toneMap: Record<string, string> = {
    blue: "bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300",
    orange: "bg-orange-100 dark:bg-orange-900/60 text-orange-600 dark:text-orange-300",
    purple: "bg-purple-100 dark:bg-purple-900/60 text-purple-600 dark:text-purple-300",
    pink: "bg-pink-100 dark:bg-pink-900/60 text-pink-600 dark:text-pink-300",
    cyan: "bg-cyan-100 dark:bg-cyan-900/60 text-cyan-600 dark:text-cyan-300",
    indigo: "bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300",
  };
  return (
    <div className="animate-pulse rounded-xl bg-card p-4 shadow min-h-[120px] flex flex-col items-center justify-center gap-2">
      <Icon className={`w-6 h-6 ${toneMap[tone]?.split(" ").slice(2).join(" ") || "text-gray-400"}`} />
      <span className="text-xs text-gray-400">{title}</span>
    </div>
  );
}

export function EmptyTile({ title, Icon, tone = "gray" }: {
  title: string;
  Icon: LucideIcon;
  tone?: string;
}) {
  return (
    <div className="rounded-xl bg-card p-4 shadow min-h-[120px] flex flex-col items-center justify-center gap-2 opacity-60">
      <Icon className="w-6 h-6 text-muted-foreground" />
      <span className="text-xs text-gray-400">{title}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════
// Rich skeletons matching real widget shapes
// ═══════════════════════════════════════════════

/** Card skeleton — mimics a single-value widget card (Revenue, Finance, BestShop, TopProduct) */
export function SkeletonCard({ tone = "blue" }: { tone?: string }) {
  const borderMap: Record<string, string> = {
    blue:   "border-l-blue-500 dark:border-l-blue-400",
    orange: "border-l-orange-500 dark:border-l-orange-400",
    purple: "border-l-purple-500 dark:border-l-purple-400",
    pink:   "border-l-pink-500 dark:border-l-pink-400",
    cyan:   "border-l-cyan-500 dark:border-l-cyan-400",
    indigo: "border-l-indigo-500 dark:border-l-indigo-400",
  };
  const borderClass = borderMap[tone] || borderMap["blue"];
  return (
    <div className={`rounded-xl bg-card p-4 shadow animate-pulse border-l-4 ${borderClass}`}>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-lg bg-muted" />
        <div className="flex-1">
          <div className="h-3 w-20 bg-muted rounded mb-1" />
          <div className="h-7 w-28 bg-muted rounded" />
        </div>
      </div>
      <div className="h-1.5 bg-muted rounded-full" />
    </div>
  );
}

/** List skeleton — mimics a list/table widget (Accessories, Tempo) */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-xl bg-card p-4 shadow animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded bg-muted" />
        <div className="h-4 w-24 bg-muted rounded" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2 border-t border-border">
          <div className="w-6 h-6 rounded-full bg-muted" />
          <div className="flex-1 h-3 bg-muted rounded" />
          <div className="h-3 w-14 bg-muted rounded" />
        </div>
      ))}
    </div>
  );
}

/** Shop cards skeleton — mimics plan/shop cards (3 columns) */
export function SkeletonShopCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-card rounded-xl shadow-sm border border-border p-4 animate-pulse">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-muted" />
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="ml-auto h-5 w-12 bg-muted rounded" />
          </div>
          <div className="h-1.5 bg-muted rounded-full mb-3" />
          <div className="flex justify-between">
            <div className="h-3 w-16 bg-muted rounded" />
            <div className="h-3 w-16 bg-muted rounded" />
            <div className="h-3 w-14 bg-muted rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
