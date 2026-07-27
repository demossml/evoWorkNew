// services/reportHtml.ts — генератор статических HTML-страниц для отчётов
// Инлайн-CSS, без внешних зависимостей, работает без JavaScript

export interface DeadStockReportData {
  generatedAt: string;
  expiresAt: string;
  periodLabel: string;
  threshold: number;
  items: Array<{
    name: string;
    article: string;
    shopName: string;
    quantity: number;
    daysWithoutSales: number;
    lastSaleDate: string | null;
    unitCost: number | null;
    totalFrozenCost: number | null;
    groupName: string | null;
    price: number;
    measureName: string;
  }>;
  total: number;
  totalFrozenCost: number;
  categories: Array<{
    groupName: string;
    totalFrozenCost: number;
    itemCount: number;
  }>;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtRub(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}

export function generateDeadStockHtml(data: DeadStockReportData): string {
  const { generatedAt, expiresAt, periodLabel, threshold, items, total, totalFrozenCost, categories } = data;

  const categoryRows = categories
    .map(c => `<tr><td>${esc(c.groupName)}</td><td class="num">${c.itemCount}</td><td class="num">${fmtRub(c.totalFrozenCost)} ₽</td></tr>`)
    .join("");

  const itemRows = items
    .map(i => {
      const lastSale = i.lastSaleDate ?? "никогда";
      const cost = i.unitCost != null ? fmtRub(i.unitCost) + " ₽" : "—";
      const frozen = i.totalFrozenCost != null ? fmtRub(i.totalFrozenCost) + " ₽" : "—";
      const daysClass = i.daysWithoutSales >= 90 ? "critical" : i.daysWithoutSales >= 45 ? "warn" : "";
      return `<tr>
        <td>${esc(i.name)}</td>
        <td>${esc(i.article || "—")}</td>
        <td>${esc(i.shopName)}</td>
        <td class="num">${i.quantity}</td>
        <td class="num ${daysClass}">${i.daysWithoutSales}</td>
        <td>${lastSale}</td>
        <td class="num">${cost}</td>
        <td class="num">${frozen}</td>
        <td>${esc(i.groupName || "—")}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Мёртвые остатки — ${generatedAt}</title>
  <style>
    :root {
      --bg: #ffffff;
      --fg: #111111;
      --card: #f9fafb;
      --border: #e5e7eb;
      --muted: #6b7280;
      --success: #059669;
      --warning: #d97706;
      --destructive: #dc2626;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #111827;
        --fg: #f9fafb;
        --card: #1f2937;
        --border: #374151;
        --muted: #9ca3af;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--fg);
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
      line-height: 1.5;
    }
    header {
      border-bottom: 2px solid var(--border);
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
    .meta { font-size: 14px; color: var(--muted); margin-top: 4px; }
    .kpi {
      display: flex; gap: 24px; flex-wrap: wrap;
      margin-bottom: 24px;
    }
    .kpi-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px 20px;
      min-width: 160px;
    }
    .kpi-label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .kpi-value { font-size: 24px; font-weight: 700; margin-top: 4px; }
    .kpi-value.danger { color: var(--destructive); }
    h2 { font-size: 18px; font-weight: 600; margin: 24px 0 12px; }
    table {
      width: 100%; border-collapse: collapse;
      font-size: 13px;
    }
    th {
      text-align: left;
      padding: 8px 10px;
      background: var(--card);
      border-bottom: 2px solid var(--border);
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      position: sticky; top: 0; z-index: 1;
    }
    td {
      padding: 6px 10px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .critical { color: var(--destructive); font-weight: 700; }
    .warn { color: var(--warning); font-weight: 600; }
    tr:hover td { background: var(--card); }
    footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      font-size: 12px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <header>
    <h1>Мёртвые остатки</h1>
    <p class="meta">Период: ${esc(periodLabel)} · Без продаж ≥ ${threshold} дн.</p>
    <p class="meta">Сгенерировано: ${generatedAt} · Ссылка действительна до: ${expiresAt}</p>
  </header>

  <div class="kpi">
    <div class="kpi-card">
      <div class="kpi-label">Товаров</div>
      <div class="kpi-value">${total}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Заморожено</div>
      <div class="kpi-value danger">${fmtRub(totalFrozenCost)} ₽</div>
    </div>
  </div>

  <h2>По категориям</h2>
  <table>
    <thead><tr><th>Категория</th><th class="num">Товаров</th><th class="num">Заморожено</th></tr></thead>
    <tbody>${categoryRows || '<tr><td colspan="3">Нет данных</td></tr>'}</tbody>
  </table>

  <h2>Товары (${total})</h2>
  <table>
    <thead><tr>
      <th>Товар</th><th>Артикул</th><th>Магазин</th><th class="num">Остаток</th>
      <th class="num">Дней без продаж</th><th>Последняя продажа</th>
      <th class="num">Себестоимость</th><th class="num">Заморожено</th><th>Категория</th>
    </tr></thead>
    <tbody>${itemRows || '<tr><td colspan="9">Нет товаров</td></tr>'}</tbody>
  </table>

  <footer>
    <p>Evo App · Отчёт сгенерирован автоматически · Ссылка действительна до ${expiresAt}</p>
  </footer>
</body>
</html>`;
}
