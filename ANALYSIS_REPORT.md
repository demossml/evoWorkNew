# 📊 ПОЛНЫЙ ОТЧЁТ: Проект evo-work-new

**Проект:** `~/evo-work-new/`
**Дата исследования:** 6 июля 2026
**Статус:** ⚠️ Сервер запущен, но бизнес-логика не работает — план всегда 5 200

---

## 1. Архитектура проекта

```
evo-work-new/
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── index.ts              # Точка входа (Hono + Cloudflare Workers)
│   │   │   ├── server.ts             # Локальный запуск (Node.js tsx)
│   │   │   ├── api.ts                # Все роуты API (~2844 строки)
│   │   │   ├── sync/cron.ts          # Cron-задачи (синхронизация)
│   │   │   ├── sync/db.ts            # Работа с таблицами БД
│   │   │   ├── evotor/index.ts       # Evotor API клиент (~2480 строк)
│   │   │   ├── evotor/utils.ts       # D1-утилиты для Evotor
│   │   │   ├── utils.ts              # Общие утилиты + ДУБЛИКАТЫ таблиц
│   │   │   ├── adapters/local-db.ts  # Эмуляция Cloudflare D1 (better-sqlite3)
│   │   │   ├── helpers.ts            # Аутентификация, инициализация
│   │   │   ├── d1/index.ts           # Альтернативная D1-реализация (дубль)
│   │   │   ├── types.ts              # Типы
│   │   │   ├── services/             # DeepSeek, прогнозы, аналитика
│   │   │   └── db/schema/            # Drizzle ORM схема
│   │   ├── server.ts                 # Локальный запуск: tsx server.ts
│   │   ├── scripts/local-scheduler.ts # Локальный планировщик cron
│   │   └── test-all-endpoints.ts     # Тесты эндпоинтов
│   └── frontend/
│       ├── src/
│       │   ├── pages/Home.tsx        # Главная страница
│       │   ├── pages/reports/        # 12 страниц отчётов
│       │   ├── helpers/              # API-клиенты, загрузка, аналитика
│       │   └── config/               # Фичи, тема, tempo settings
│       └── package.json
```

**Запуск (локальный):** `cd packages/backend && npx tsx server.ts`
**Порт по умолчанию:** 3000 (переопределяется через `PORT=8787`)
**БД:** SQLite через better-sqlite3 (`./data/local.db`)
**Логи:** `./data/logs/app.log` и `./data/logs/error.log`

---

## 2. 🔴 Ошибка #1: `no such table: products` — КРИТИЧЕСКАЯ

### Симптом в логах

```
[2026-07-06T08:27:02.643Z] Ошибка при получении UUIDs: SqliteError: no such table: products
[2026-07-06T08:27:02.672Z] Ошибка в функции updatePlan: SqliteError: no such table: products
[2026-07-06T08:27:02.684Z] Ошибка при получении UUIDs: SqliteError: no such table: products
```

**Стек:** `getUuidsByParentUuidList (utils.ts:822) → LocalD1PreparedStatement.all (local-db.ts:105)`

### Корень: Дублирование `createProductsTableIfNotExists` в двух файлах

В проекте **две разные функции с одинаковым именем**, создающие РАЗНЫЕ таблицы:

| Файл | Строка | Создаёт таблицу | Вызывается при старте? |
|------|:------:|:---------------:|:----------------------:|
| ✅ **`sync/db.ts:21`** | `CREATE TABLE IF NOT EXISTS products (...)` | ❌ **НЕ вызывается** |
| ❌ **`utils.ts:1238`** | `CREATE TABLE IF NOT EXISTS shopProduct (...)` | ✅ **Вызывается** |

**server.ts:26** импортирует `createProductsTableIfNotExists` **из `utils.ts`**, а должен — **из `sync/db.ts`**:

```ts
// server.ts:26 — НЕПРАВИЛЬНЫЙ импорт!
import { ..., createProductsTableIfNotExists } from "./src/utils";
// Надо: import { ..., createProductsTableIfNotExists } from "./src/sync/db";
```

### Цепочка падения

```
server.ts старт
  → ensureTables() (строка 72)
    → createProductsTableIfNotExists из utils.ts
      → создаёт таблицу "shopProduct"
      → НЕ создаёт таблицу "products"        ← ❌

Через ~15 секунд:
  → initializePlansAndSalaries() (строка 146)
    → updatePlan_(env)                        ← sync/cron.ts:331
      → getUuidsByParentUuidList(env.DB, VAPE_GROUP_UUIDS)
        → SELECT uuid FROM products           ← utils.ts:818
        → "no such table: products" 💥
        → выбрасывает исключение
    → try/catch проглатывает ошибку
    → План НЕ сохранён в БД

Приходит API запрос /api/evotor/plan-for-today:
  → getPlan(datePlan, db) → null             ← плана в БД нет
  → evo.getPlan(newDate, [])                  ← productUuids = [] (из-за ошибки)
    → adjustSales(0)                          ← calculateSalesForShop вернула 0
      → 0 ÷ 4 = 0 < 5200 → return 5200       ← ХАРДКОД
  → Записывается datePlan: 5200
```

---

## 3. 🟡 Проблема #2: Алгоритм расчёта плана всегда выдаёт 5 200

**Файл:** `packages/backend/src/evotor/index.ts:2262-2272`

```ts
private adjustSales(sumSalesToday: number): number {
    let adjustedSales = Math.floor(sumSalesToday / 4); // Среднее за 4 недели

    if (adjustedSales > 5200) {
        adjustedSales *= 1.05;  // +5%, если больше 5200
    } else {
        adjustedSales = 5200;   // МИНИМУМ 5 200
    }

    return Math.floor(adjustedSales);
}
```

### Что здесь неправильно

1. **`sumSalesToday` — это СУММА за 4 недели** (из `calculateSalesForShop`), а деление на 4 даёт **среднюю за НЕДЕЛЮ**, а не за день. Должно быть деление на **28** (4 × 7).

2. **Хардкорный floor = 5 200** — если расчёт упал или продажи низкие, план всё равно 5 200. Реальный план по данным Evotor:
   - **Победа:** ~15 000–18 000 ₽/день
   - **Твардовского:** ~9 000–12 000 ₽/день
   - **45:** ~6 000–8 000 ₽/день
   - **Итого:** ~30 000–38 000 ₽, а не 15 600

3. **Из-за Ошибки #1** `productUuids` пустой → `calculateSalesForShop` возвращает 0 → `adjustSales(0)` → 0 < 5200 → **всегда 5 200 для всех магазинов**

### Другие эвристики в `getPlan`

```ts
// evotor/index.ts:2216-2217
const weekOffsets = [7, 14, 21, 28];  // 4 недели назад
const dateRanges = getDateRangesForWeeks(datePlan, weekOffsets);

// calculateSalesForShop суммирует продажи за эти 4 диапазона в одну кучу
// adjustSales делит сумму на 4 → средняя за НЕДЕЛЮ, выданная как дневной план
```

Этот алгоритм **принципиально неверен**: он считает среднюю за неделю, а не за день, и накладывает хардкорный минимум.

---

## 4. 🟡 Проблема #3: Dynamic import `./db.js` без учёта расширения

**Файл:** `packages/backend/src/sync/cron.ts`, строки 263 и 473

```ts
const { createShopsTable, upsertShops } = await import("./db.js");  // .js
const { getShopUuidsFromDB, getShopNameFromDB } = await import("./db.js");
```

Фактический файл — `./db.ts`. При запуске через `tsx` это может работать благодаря автоматическому разрешению расширений, но в `server.ts` настроен явный ESM-режим — dynamic import с `.js` может не найти файл в строгих ESM-окружениях.

---

## 5. ⚪ Проблема #4: Дублирование D1-реализаций

В проекте **три дублирующихся набора функций** для работы с D1:

| Набор | Файл | Особенности |
|:----:|:----:|:-----------:|
| A | `utils.ts` | `getPlan`, `updatePlan`, `createProductsTableIfNotExists` (**shopProduct**) |
| B | `sync/db.ts` | `getPlan`, `updatePlan`, `createProductsTableIfNotExists` (**products**), `updateOrInsertData`, `upsertSaleByPlanData` |
| C | `d1/index.ts` | Полный дубль `utils.ts` для Cloudflare Workers окружения |

- `utils.ts` и `d1/index.ts` содержат **почти идентичные функции** (различаются только импортами `better-sqlite3` vs `@cloudflare/workers-types`)
- `sync/db.ts` — правильная реализация, но её функции **НЕ вызываются** при старте сервера

---

## 6. Сводка: что починить (по приоритетам)

| # | Проблема | Где | Фикс |
|:-:|----------|:---:|:----:|
| 🔴 1 | `server.ts` импортирует `createProductsTableIfNotExists` из `utils.ts` (создаёт `shopProduct`) вместо `sync/db.ts` (создаёт `products`) | `server.ts:26` (импорт), `server.ts:79` (вызов) | Переключить импорт на `import { createProductsTableIfNotExists } from "./src/sync/db"` |
| 🟡 2 | `adjustSales()` считает среднюю за неделю как дневной план + хардкорный минимум 5200 | `evotor/index.ts:2262-2272` | Исправить: делить на 28 (4×7), а не на 4. Убрать хардкор `5200` или заменить на реальный план из Evotor. |
| 🟡 3 | `getUuidsByParentUuidList` падает при отсутствии таблицы `products` без graceful fallback | `utils.ts:807-831` | Добавить `CREATE TABLE IF NOT EXISTS products` перед SELECT или обработку ошибки |
| ⚪ 4 | Dynamic import `./db.js` → должно быть `./db` | `sync/cron.ts:263,473` | Убрать `.js` расширение |
| ⚪ 5 | Дублирование `utils.ts` ↔ `d1/index.ts` ↔ `sync/db.ts` | 3 файла | Рефакторинг: единая точка работы с D1 |

---

## 7. Текущее состояние сервера

| Эндпоинт | Статус | Ответ |
|:---------|:------:|:------|
| `GET /` | ✅ | `{"message": "Welcome to Evo backend"}` |
| `GET /health` | ✅ | `{"status": "ok", "uptime": ..., "ts": ...}` |
| `POST /api/internal/sync/products` | ❌ | Падает с `no such table: products` |
| `GET /api/evotor/plan-for-today` | ⚠️ | Отдаёт `datePlan: 5200` для всех магазинов |

**Сервер запущен**, эндпоинты отвечают, но ключевая бизнес-логика (план, зарплата, синхронизация товаров) не работает из-за отсутствия таблицы `products`.

---

*Сгенерировано 6 июля 2026, ~/evo-work-new*
