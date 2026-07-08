/**
 * HourlyCompareTable — time-slot × seller comparison grid.
 * Each row = a time slot, each column = a seller.
 * Cells show average revenue and green/red activity indicator.
 * Includes granularity switcher: 1m | 5m | 15m | 30m | 1h.
 */
import { useState } from "react";
import type { HourlyCompareResult, HourlySellerSlot } from "./types";

const GRANULARITY_OPTIONS = [
  { value: 60, label: "1ч" },
  { value: 30, label: "30м" },
  { value: 15, label: "15м" },
  { value: 5, label: "5м" },
  { value: 1, label: "1м" },
] as const;

function formatRevenue(r: number): string {
  if (r === 0) return "—";
  if (r >= 1000) return `${Math.round(r / 1000)}k`;
  return String(r);
}

interface Props {
  data: HourlyCompareResult;
  granularityMinutes: number;
  onGranularityChange: (min: number) => void;
  loading?: boolean;
}

export function HourlyCompareTable({
  data,
  granularityMinutes,
  onGranularityChange,
  loading,
}: Props) {
  const [showAllSlots, setShowAllSlots] = useState(false);

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Загрузка почасового сравнения...
      </div>
    );
  }

  if (!data || data.slots.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Нет данных для сравнения за выбранные дни.
        <br />
        <span className="text-xs mt-1 block">
          Попробуйте выбрать других продавцов или изменить период.
        </span>
      </div>
    );
  }

  const sellers = data.sellers;
  const allSlots = data.slots;

  // Dead time summary per seller
  const deadSummary: { uuid: string; name: string; totalDead: number; maxStreak: number }[] = [];
  for (const s of sellers) {
    let totalDead = 0;
    let maxStreak = 0;
    let currentStreak = 0;
    for (const slot of allSlots) {
      const sellerSlot = slot.sellers[s.uuid];
      if (!sellerSlot || !sellerSlot.active) {
        currentStreak++;
      } else {
        if (currentStreak > maxStreak) maxStreak = currentStreak;
        totalDead += currentStreak;
        currentStreak = 0;
      }
    }
    if (currentStreak > maxStreak) maxStreak = currentStreak;
    totalDead += currentStreak;
    deadSummary.push({
      uuid: s.uuid,
      name: s.name,
      totalDead: totalDead * granularityMinutes,
      maxStreak: maxStreak * granularityMinutes,
    });
  }

  // Limit visible slots on fine granularity unless expanded
  const MAX_VISIBLE = 120;
  const visibleSlots = showAllSlots || allSlots.length <= MAX_VISIBLE
    ? allSlots
    : allSlots.slice(0, MAX_VISIBLE);

  return (
    <div className="space-y-3">
      {/* Granularity switcher */}
      <div className="flex gap-1 bg-muted/60 rounded-md p-0.5 w-fit">
        {GRANULARITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onGranularityChange(opt.value)}
            className={`px-2.5 py-1 text-[10px] font-medium rounded transition ${
              granularityMinutes === opt.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Dead time summary */}
      <div className="flex flex-wrap gap-2">
        {deadSummary.map((d) => (
          <div
            key={d.uuid}
            className="bg-muted/40 rounded-lg px-3 py-1.5 text-[10px] leading-tight"
          >
            <span className="font-medium text-foreground">{d.name}</span>
            <br />
            <span className="text-destructive">
              мёртвое время: {d.totalDead} мин
            </span>
            <br />
            <span className="text-muted-foreground">
              макс. отсутствие: {d.maxStreak} мин
            </span>
          </div>
        ))}
      </div>

      {/* Info: dates and days worked */}
      <div className="text-[10px] text-muted-foreground bg-muted/30 rounded-lg px-3 py-1.5">
        Сравнение по {data.weekdayLabel.toLowerCase()} за {data.dates.length} периодов ({data.dates.join(", ")})
        {sellers.map((s) => (
          <span key={s.uuid} className="ml-3">
            {s.name}: {s.daysWorked}/{s.totalDates} смен
          </span>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="bg-muted/60">
              <th className="sticky left-0 bg-muted/60 text-left px-2 py-1.5 font-medium text-muted-foreground w-12">
                Время
              </th>
              {sellers.map((s) => (
                <th
                  key={s.uuid}
                  className="px-2 py-1.5 font-medium text-foreground min-w-[72px]"
                >
                  {s.name.split(" ")[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {visibleSlots.map((slot) => (
              <tr
                key={slot.time}
                className="hover:bg-muted/30 transition-colors"
              >
                <td className="sticky left-0 bg-card px-2 py-1 text-muted-foreground font-mono">
                  {slot.time}
                </td>
                {sellers.map((s) => {
                  const ss: HourlySellerSlot | undefined = slot.sellers[s.uuid];
                  const active = ss?.active;
                  const rev = ss?.revenue ?? 0;
                  return (
                    <td
                      key={s.uuid}
                      className={`px-2 py-1 text-center font-mono ${
                        active
                          ? "bg-emerald-50/30 dark:bg-emerald-950/20"
                          : "bg-red-50/20 dark:bg-red-950/10"
                      }`}
                    >
                      <span
                        className={
                          active
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-red-400 dark:text-red-500"
                        }
                      >
                        {formatRevenue(rev)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Show more / less */}
      {allSlots.length > MAX_VISIBLE && (
        <button
          onClick={() => setShowAllSlots(!showAllSlots)}
          className="text-xs text-primary hover:underline w-full text-center py-1"
        >
          {showAllSlots
            ? "Скрыть"
            : `Показать все (${allSlots.length - MAX_VISIBLE} ещё)`}
        </button>
      )}

      {/* Legend */}
      <div className="flex gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-emerald-200 dark:bg-emerald-800" />
          Активен (были продажи)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-red-200 dark:bg-red-800" />
          Мёртвое время
        </span>
      </div>
    </div>
  );
}
