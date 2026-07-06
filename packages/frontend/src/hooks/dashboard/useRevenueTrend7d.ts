import { useMemo } from "react";
import { useSalesData } from "./useSalesData";

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Always shows the trailing 7 days, regardless of whatever date range the
 * user has selected on the page (today/yesterday/custom period) — a trend
 * sparkline that changes shape every time you switch the date filter isn't
 * a trend anymore. Reuses useSalesData (same endpoint RevenueWidget already
 * calls), just with a fixed range and reads the `dailySell` field the
 * backend now returns for period queries.
 */
export function useRevenueTrend7d(shopUuid?: string) {
  const until = useMemo(() => toIsoDate(new Date()), []);
  const since = useMemo(
    () => toIsoDate(new Date(Date.now() - 6 * 86_400_000)),
    [],
  );

  const { data, loading, error } = useSalesData({
    since,
    until,
    shopUuid,
    pollIntervalMs: 300_000, // trend doesn't need to be as fresh as the headline number
  });

  const values = useMemo(() => {
    const daily = data?.dailySell || {};
    const days: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = toIsoDate(new Date(Date.now() - i * 86_400_000));
      days.push(daily[day] ?? 0);
    }
    return days;
  }, [data]);

  return { values, loading, error };
}
