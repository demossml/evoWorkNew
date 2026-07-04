export function formatCurrency(amount: number): string {
  if (amount == null || !Number.isFinite(amount)) return "0";
  return new Intl.NumberFormat("ru-RU", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
