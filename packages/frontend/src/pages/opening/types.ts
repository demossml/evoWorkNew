// types.ts

export type StoreOpeningStep = "shop" | "initial" | "photos" | "cash_check";
export interface CashDiscrepancyData {
  amount: number | string;
  type: "+" | "-";
}
