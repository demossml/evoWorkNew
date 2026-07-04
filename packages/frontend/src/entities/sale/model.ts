export type SaleEntity = {
  id: string;
  shopUuid: string;
  revenue: number;
  checks: number;
  createdAt: string;
};

export type RawSale = Partial<{
  id: string | number;
  shopUuid: string;
  revenue: number | string;
  checks: number | string;
  createdAt: string;
}>;

export function normalizeSale(raw: RawSale): SaleEntity {
  return {
    id: String(raw.id ?? ""),
    shopUuid: typeof raw.shopUuid === "string" ? raw.shopUuid : "",
    revenue: Number(raw.revenue ?? 0),
    checks: Number(raw.checks ?? 0),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
  };
}

export function normalizeSales(rows: RawSale[]): SaleEntity[] {
  return rows.map(normalizeSale);
}
