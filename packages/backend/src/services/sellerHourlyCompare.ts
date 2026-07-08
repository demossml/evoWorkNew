/**
 * sellerHourlyCompare.ts
 *
 * Hourly/minute-level seller comparison for same-weekday analysis.
 * Used by GET /api/sellers/hourly-compare.
 *
 * Takes a target date, N weeks back, seller IDs, and time granularity.
 * Groups SELL documents by time slot and seller, returns per-slot averages
 * computed ONLY over the dates each seller actually worked.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { parseHour, dayOfWeek } from "./sharedStats";

// ===================== Types =====================

export interface HourlyCompareSlot {
  /** Display label like "10:00" or "10:15" */
  time: string;
  /** Per-seller data: keyed by seller UUID */
  sellers: Record<string, HourlySellerSlot>;
}

export interface HourlySellerSlot {
  /** Average revenue in this slot across the dates the seller worked */
  revenue: number;
  /** Average checks in this slot across the dates the seller worked */
  checks: number;
  /** Whether this seller had ANY activity in this slot (checks > 0) */
  active: boolean;
}

export interface HourlyCompareSeller {
  uuid: string;
  name: string;
  daysWorked: number;
  totalDates: number;
}

export interface HourlyCompareResult {
  weekday: number;
  weekdayLabel: string;
  dates: string[];
  sellers: HourlyCompareSeller[];
  slots: HourlyCompareSlot[];
}

// ===================== Helpers =====================

function formatSlotTime(minutesSinceMidnight: number): string {
  const h = Math.floor(minutesSinceMidnight / 60);
  const m = minutesSinceMidnight % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function slotMinutes(isoStr: string, granularityMinutes: number): number {
  const h = parseHour(isoStr);
  const m = parseInt(isoStr.slice(14, 16), 10) || 0;
  const totalMin = h * 60 + m;
  return Math.floor(totalMin / granularityMinutes) * granularityMinutes;
}

function getSameWeekdayDates(targetDate: string, weeksBack: number): string[] {
  const ref = new Date(targetDate + "T12:00:00+03:00");
  const dates: string[] = [];
  let cursor = new Date(ref);
  for (let i = 0; i < weeksBack; i++) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    dates.unshift(`${y}-${m}-${d}`);
    cursor = new Date(cursor.getTime() - 7 * 86400000);
  }
  return dates;
}

// ===================== Main export =====================

const WD_LABELS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

export async function computeHourlyCompare(
  db: D1Database,
  params: {
    targetDate: string;
    weeksBack?: number;
    shopId?: string;
    sellerIds: string[];
    granularityMinutes?: number;
  },
): Promise<HourlyCompareResult> {
  const { targetDate, shopId, sellerIds, granularityMinutes = 60, weeksBack = 5 } = params;

  const refDate = new Date(targetDate + "T12:00:00+03:00");
  const weekday = refDate.getDay();
  const weekdayLabel = WD_LABELS[weekday];

  // Generate matching dates (same weekday, weeksBack weeks)
  const dates = getSameWeekdayDates(targetDate, weeksBack);
  const dateSet = new Set(dates);
  const since = dates[0];
  const until = dates[dates.length - 1];

  console.log(
    `[hourly-compare] target=${targetDate}, weekday=${weekdayLabel}, dates=${dates.length}, granularity=${granularityMinutes}m`,
  );

  // Fetch employee names
  const nameMap = new Map<string, string>();
  try {
    const nameRes = await db.prepare("SELECT uuid, name FROM employees").all<{ uuid: string; name: string }>();
    for (const r of (nameRes.results ?? [])) {
      nameMap.set(r.uuid, r.name);
    }
  } catch {}

  // Query SELL docs for the full range
  let sql = `SELECT close_date, open_user_uuid, transactions
             FROM index_documents
             WHERE type = 'SELL'
               AND close_date >= ? AND close_date <= ?
               AND open_user_uuid IN (${sellerIds.map(() => "?").join(",")})`;
  const binds: any[] = [since + "T00:00:00", until + "T23:59:59", ...sellerIds];
  if (shopId && shopId !== "all") {
    sql += ` AND shop_id = ?`;
    binds.push(shopId);
  }

  const res = await db.prepare(sql).bind(...binds).all<{
    close_date: string;
    open_user_uuid: string;
    transactions: string;
  }>();
  const rows = res.results ?? [];

  // Per-seller tracking: which dates did this seller work?
  const sellerDates = new Map<string, Set<string>>();
  // Per-seller per-slot per-date: revenue, checks
  // sellerId -> date -> slotMin -> {revenue, checks}
  const data = new Map<string, Map<string, Map<number, { revenue: number; checks: number }>>>();

  for (const sellerId of sellerIds) {
    sellerDates.set(sellerId, new Set());
    data.set(sellerId, new Map());
  }

  for (const row of rows) {
    const date = row.close_date.slice(0, 10);
    if (!dateSet.has(date)) continue;
    const sellerId = row.open_user_uuid;
    if (!sellerIds.includes(sellerId)) continue;

    const slotMin = slotMinutes(row.close_date, granularityMinutes);

    sellerDates.get(sellerId)!.add(date);

    const sellerMap = data.get(sellerId)!;
    if (!sellerMap.has(date)) sellerMap.set(date, new Map());
    const slotMap = sellerMap.get(date)!;

    const prev = slotMap.get(slotMin);
    let revenue = 0;
    try {
      const tx = JSON.parse(row.transactions || "[]");
      for (const t of (Array.isArray(tx) ? tx : [tx])) {
        revenue += (t.price ?? 0) * (t.quantity ?? 1) + (t.discountForDocument ?? 0);
      }
    } catch {}

    if (prev) {
      prev.revenue += revenue;
      prev.checks += 1;
    } else {
      slotMap.set(slotMin, { revenue, checks: 1 });
    }
  }

  // Determine slot range (from min to max across all data)
  let minSlot = Infinity;
  let maxSlot = -Infinity;
  for (const sellerId of sellerIds) {
    const sellerMap = data.get(sellerId)!;
    for (const slotMap of sellerMap.values()) {
      for (const slotMin of slotMap.keys()) {
        if (slotMin < minSlot) minSlot = slotMin;
        if (slotMin > maxSlot) maxSlot = slotMin;
      }
    }
  }

  if (minSlot === Infinity) {
    // No data at all
    return {
      weekday,
      weekdayLabel,
      dates,
      sellers: sellerIds.map((uuid) => ({
        uuid,
        name: nameMap.get(uuid) || uuid.slice(0, 8),
        daysWorked: 0,
        totalDates: dates.length,
      })),
      slots: [],
    };
  }

  // Build sellers summary
  const sellers: HourlyCompareSeller[] = sellerIds.map((uuid) => ({
    uuid,
    name: nameMap.get(uuid) || uuid.slice(0, 8),
    daysWorked: sellerDates.get(uuid)?.size ?? 0,
    totalDates: dates.length,
  }));

  // Build slots
  const slots: HourlyCompareSlot[] = [];
  for (let slotMin = minSlot; slotMin <= maxSlot; slotMin += granularityMinutes) {
    const slot: HourlyCompareSlot = {
      time: formatSlotTime(slotMin),
      sellers: {},
    };

    for (const sellerId of sellerIds) {
      const sellerMap = data.get(sellerId)!;
      let totalRev = 0;
      let totalChecks = 0;
      let datesWithActivity = 0;

      for (const date of sellerDates.get(sellerId)!) {
        const slotMap = sellerMap.get(date);
        const entry = slotMap?.get(slotMin);
        if (entry) {
          totalRev += entry.revenue;
          totalChecks += entry.checks;
          datesWithActivity++;
        }
      }

      const active = datesWithActivity > 0;
      slot.sellers[sellerId] = {
        revenue: active ? Math.round(totalRev / datesWithActivity) : 0,
        checks: active ? Math.round((totalChecks / datesWithActivity) * 10) / 10 : 0,
        active,
      };
    }

    slots.push(slot);
  }

  return { weekday, weekdayLabel, dates, sellers, slots };
}
