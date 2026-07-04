import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@shared/api";

export interface StockItem {
  name: string;
  quantity: number;
  shopName: string;
  shopUuid: string;
  velocity?: number;
  daysLeft?: number;
  lastSale?: string;
  daysSinceLastSale?: number;
}

export interface OutOfStockItem {
  name: string;
  soldQty: number;
  velocity: number;
  lostRevenuePerDay: number;
  shopName: string;
  shopUuid: string;
}

export interface TransferRec {
  productName: string;
  productUuid: string;
  fromShop: string;
  fromShopName: string;
  deadQuantity: number;
  toShop: string;
  toShopName: string;
  soldQty14d: number;
  velocity: number;
  toShopQuantity: number;
}

export interface StockHealthData {
  deadStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalProducts: number;
  totalProblems: number;
  stockScore: number;
  totalLostPerDay: number;
  deadStock: StockItem[];
  lowStock: StockItem[];
  outOfStock: OutOfStockItem[];
  byShop: Array<{
    shopUuid: string;
    shopName: string;
    deadStock: StockItem[];
    lowStock: StockItem[];
    outOfStock: OutOfStockItem[];
  }>;
}

// Raw API response types
interface RawStockItem {
  productName: string;
  productUuid: string;
  storeUuid: string;
  storeName: string;
  lastSale: string;
  daysSinceLastSale: number;
  totalRev90d: number;
  totalQty90d: number;
  recentQty7d: number;
  recentRev7d: number;
  daysSold7d: number;
  avgDailyQty: number;
  daysLeft?: number;
  lostRevenuePerDay?: number;
}

interface RawTransfer {
  productName: string;
  productUuid: string;
  fromStoreUuid: string;
  fromStoreName: string;
  toStoreUuid: string;
  toStoreName: string;
  deadQuantity: number;
  activeQty: number;
  activeRev: number;
}

interface RawStockHealthResponse {
  deadCount: number;
  lowCount: number;
  outCount: number;
  deadStock: RawStockItem[];
  lowStock: RawStockItem[];
  outOfStock: RawStockItem[];
  transfers: RawTransfer[];
  days: number;
  shopFilter: string | null;
  generatedAt: string;
}

function mapStockItem(raw: RawStockItem): StockItem {
  return {
    name: raw.productName,
    quantity: raw.totalQty90d,
    shopName: raw.storeName,
    shopUuid: raw.storeUuid,
    velocity: raw.avgDailyQty,
    daysLeft: raw.daysLeft,
    lastSale: raw.lastSale,
    daysSinceLastSale: raw.daysSinceLastSale,
  };
}

function mapOOSItem(raw: RawStockItem): OutOfStockItem {
  return {
    name: raw.productName,
    soldQty: raw.totalQty90d,
    velocity: raw.avgDailyQty,
    lostRevenuePerDay: raw.lostRevenuePerDay || Math.round(raw.totalRev90d / 90),
    shopName: raw.storeName,
    shopUuid: raw.storeUuid,
  };
}

function mapTransfer(raw: RawTransfer): TransferRec {
  return {
    productName: raw.productName,
    productUuid: raw.productUuid,
    fromShop: raw.fromStoreUuid,
    fromShopName: raw.fromStoreName,
    deadQuantity: raw.deadQuantity,
    toShop: raw.toStoreUuid,
    toShopName: raw.toStoreName,
    soldQty14d: raw.activeQty,
    velocity: raw.activeQty / 90,
    toShopQuantity: raw.activeQty,
  };
}

function groupByShop<T extends { shopUuid: string; shopName: string }>(
  items: T[]
): Array<{ shopUuid: string; shopName: string; items: T[] }> {
  const map = new Map<string, { shopUuid: string; shopName: string; items: T[] }>();
  for (const item of items) {
    if (!map.has(item.shopUuid)) {
      map.set(item.shopUuid, { shopUuid: item.shopUuid, shopName: item.shopName, items: [] });
    }
    map.get(item.shopUuid)!.items.push(item);
  }
  return Array.from(map.values());
}

async function fetchStockHealth(days: number): Promise<StockHealthData> {
  const resp = await fetch(`/api/evotor/stock-health?days=${days}`);
  if (!resp.ok) throw new Error(`Stock health failed: ${resp.status}`);
  const raw: RawStockHealthResponse = await resp.json();

  const deadStock = (raw.deadStock || []).map(mapStockItem);
  const lowStock = (raw.lowStock || []).map(mapStockItem);
  const outOfStock = (raw.outOfStock || []).map(mapOOSItem);

  const deadByShop = groupByShop(deadStock);
  const lowByShop = groupByShop(lowStock);
  const oosByShop = groupByShop(outOfStock);

  // Merge all shops
  const allShopUuids = new Set<string>();
  for (const g of [...deadByShop, ...lowByShop, ...oosByShop]) allShopUuids.add(g.shopUuid);

  const byShop = Array.from(allShopUuids).map((uuid) => {
    const dead = deadByShop.find((s) => s.shopUuid === uuid);
    const low = lowByShop.find((s) => s.shopUuid === uuid);
    const oos = oosByShop.find((s) => s.shopUuid === uuid);
    const shopName = dead?.shopName || low?.shopName || oos?.shopName || uuid.slice(0, 8);
    return {
      shopUuid: uuid,
      shopName,
      deadStock: dead?.items || [],
      lowStock: low?.items || [],
      outOfStock: oos?.items || [],
    };
  });

  const totalLostPerDay = outOfStock.reduce((s, i) => s + i.lostRevenuePerDay, 0);

  return {
    deadStockCount: raw.deadCount,
    lowStockCount: raw.lowCount,
    outOfStockCount: raw.outCount,
    totalProducts: raw.deadCount + raw.lowCount + raw.outCount,
    totalProblems: raw.deadCount + raw.lowCount + raw.outCount,
    stockScore: Math.max(0, 100 - raw.deadCount - raw.outCount),
    totalLostPerDay,
    deadStock,
    lowStock,
    outOfStock,
    byShop,
  };
}

async function fetchStockTransfer(days: number): Promise<{ recommendations: TransferRec[] }> {
  const resp = await fetch(`/api/evotor/stock-health?days=${days}`);
  if (!resp.ok) throw new Error(`Stock transfer failed: ${resp.status}`);
  const raw: RawStockHealthResponse = await resp.json();
  return {
    recommendations: (raw.transfers || []).map(mapTransfer),
  };
}

export function useStockHealth(days: number, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.stock.health(days),
    queryFn: () => fetchStockHealth(days),
    staleTime: 60_000,
    refetchInterval: 300_000,
    refetchOnWindowFocus: false,
    retry: 1,
    enabled: opts?.enabled ?? true,
  });
}

export function useStockTransfer(days: number) {
  return useQuery({
    queryKey: queryKeys.stock.transfer(days),
    queryFn: () => fetchStockTransfer(days),
    staleTime: 60_000,
    refetchInterval: 300_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
