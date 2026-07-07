/**
 * useSellerComparison — фильтрация и мемоизация данных для сравнения продавцов.
 */
import { useMemo } from "react";
import type { SellerDNAProfile } from "@/widgets/sellers/SellerDNAWidget/types";

export interface ComparisonMetric {
  label: string;
  cells: {
    seller: string;
    value: string;
    raw: number;
    isBest: boolean;
  }[];
}

function getNestedValue(obj: any, path: string): number {
  const parts = path.split(".");
  let val: any = obj;
  for (const p of parts) {
    val = val?.[p];
  }
  return typeof val === "number" ? val : 0;
}

function formatMoney(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return `${n}`;
}

const METRIC_DEFS: {
  path: string;
  label: string;
  format: (v: number) => string;
  lowerBetter?: boolean;
}[] = [
  { path: "rubPerHour", label: "\u20BD/\u0447\u0430\u0441", format: (v) => `${formatMoney(v)}\u20BD` },
  { path: "avgCheck", label: "\u0421\u0440\u0435\u0434\u043D\u0438\u0439 \u0447\u0435\u043A", format: (v) => `${v}\u20BD` },
  { path: "accShare", label: "% \u0410\u043A\u0441\u0435\u0441\u0441\u0443\u0430\u0440\u043E\u0432", format: (v) => `${v}%` },
  { path: "deadTimePct", label: "% \u041C\u0451\u0440\u0442\u0432\u043E\u0433\u043E \u0432\u0440\u0435\u043C\u0435\u043D\u0438", format: (v) => `${v}%`, lowerBetter: true },
  { path: "peakHourK", label: "K \u043F\u0438\u043A\u043E\u0432\u044B\u0445 \u0447\u0430\u0441\u043E\u0432", format: (v) => v.toFixed(1) },
  { path: "peakHourEfficiency", label: "\u042D\u0444\u0444. \u043F\u0438\u043A\u043E\u0432", format: (v) => `${Math.round(v * 100)}%` },
  { path: "overallScore", label: "DNA Score", format: (v) => `${v}/100` },
  { path: "serviceQuality.total", label: "\u041A\u0430\u0447\u0435\u0441\u0442\u0432\u043E \u043E\u0431\u0441\u043B\u0443\u0436.", format: (v) => `${v}/100` },
  { path: "stability.revenueCV", label: "CV \u0432\u044B\u0440\u0443\u0447\u043A\u0438", format: (v) => `${v}%`, lowerBetter: true },
  { path: "stability.checkCV", label: "CV \u0447\u0435\u043A\u0430", format: (v) => `${v}%`, lowerBetter: true },
  { path: "stability.attendanceRate", label: "\u041F\u043E\u0441\u0435\u0449\u0430\u0435\u043C\u043E\u0441\u0442\u044C", format: (v) => `${v}%` },
  { path: "stability.lateOpenRate", label: "\u041E\u043F\u043E\u0437\u0434\u0430\u043D\u0438\u044F", format: (v) => `${v}%`, lowerBetter: true },
  { path: "totalRevenue", label: "\u0412\u044B\u0440\u0443\u0447\u043A\u0430 \u0437\u0430 \u043F\u0435\u0440\u0438\u043E\u0434", format: (v) => `${formatMoney(v)}\u20BD` },
  { path: "daysWorked", label: "\u041E\u0442\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u043E \u0441\u043C\u0435\u043D", format: (v) => `${v}` },
];

export function useSellerComparison(
  selectedIds: string[],
  sellers: SellerDNAProfile[],
) {
  const selected = useMemo(
    () => sellers.filter((s) => selectedIds.includes(s.uuid)),
    [sellers, selectedIds],
  );

  const metrics = useMemo((): ComparisonMetric[] => {
    return METRIC_DEFS.map((def) => {
      const cells = selected.map((seller) => {
        const raw = getNestedValue(seller, def.path);
        return {
          seller: seller.name,
          value: def.format(raw),
          raw,
          isBest: false,
        };
      });

      const rawVals = cells.map((c) => c.raw);
      const bestVal = def.lowerBetter
        ? Math.min(...rawVals)
        : Math.max(...rawVals);

      for (const c of cells) {
        if (c.raw === bestVal) c.isBest = true;
      }

      return { label: def.label, cells };
    });
  }, [selected]);

  return { selected, metrics };
}
