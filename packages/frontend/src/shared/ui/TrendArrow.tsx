import type { JSX } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

/**
 * Единая точка правды для отображения тренда.
 * Раньше дублировалось в:
 *  - pages/SellerPerformance.tsx
 *  - pages/reports/StorePerformance.tsx
 *  - pages/reports/ProductPerformance.tsx
 *  - widgets/sellers/SellerDNAWidget/SellerComparisonView.tsx
 *  - widgets/sellers/SellerDNAWidget/SellerDetailView.tsx
 *
 * Цвета — только через токены (CODEBUDDY §6.9): text-success / text-destructive / text-muted-foreground.
 */

export type TrendArrowDirection = "↑" | "↓" | "→";

export interface TrendArrowResult {
  icon: JSX.Element;
  /** CSS-токен, а не хардкод-цвет */
  color: string;
}

/**
 * Используется там, где тренд закодирован как "↑" | "↓" | "→"
 * (SellerPerformance, StorePerformance, ProductPerformance).
 */
export function trendArrow(dir: TrendArrowDirection, size: "sm" | "md" = "md"): TrendArrowResult {
  const iconClass = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  if (dir === "↑") {
    return { icon: <TrendingUp className={iconClass} />, color: "text-success" };
  }
  if (dir === "↓") {
    return { icon: <TrendingDown className={iconClass} />, color: "text-destructive" };
  }
  return { icon: <span className="text-lg">→</span>, color: "text-muted-foreground" };
}

export type TrendBadgeDirection = "up" | "down" | "stable";

/**
 * Используется там, где тренд закодирован как "up" | "down" | "stable" со slope
 * (SellerComparisonView, SellerDetailView).
 */
export function trendBadge(
  trend: TrendBadgeDirection,
  slope: number,
  size: "sm" | "md" = "md",
): JSX.Element {
  const iconClass = size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3";
  const textClass = size === "sm" ? "text-[10px]" : "text-xs";
  const base = `inline-flex items-center gap-0.5 ${textClass} font-medium`;

  if (trend === "up") {
    return (
      <span className={`${base} text-success`}>
        <TrendingUp className={iconClass} />+{slope.toFixed(0)}/д
      </span>
    );
  }
  if (trend === "down") {
    return (
      <span className={`${base} text-destructive`}>
        <TrendingDown className={iconClass} />
        {slope.toFixed(0)}/д
      </span>
    );
  }
  return (
    <span className={`${base} text-muted-foreground`}>
      <Minus className={iconClass} />0/д
    </span>
  );
}
