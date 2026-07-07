# 🔥 ПЛАН ИСПРАВЛЕНИЯ evo-work-new (7 июля 2026)

Главная проблема:
Сервер запускается, но бизнес-логика (расчёт плана) всегда возвращает 5200, потому что отсутствует таблица `products` и алгоритм сломан.

---

## Приоритет 1: Критические исправления (сделать первым делом)

### 1.1 Исправить импорт таблицы `products` (самая важная ошибка)

**Файл:** `packages/backend/src/server.ts`

Найти:
```ts
import { ..., createProductsTableIfNotExists } from "./src/utils";
```

**Заменить на:**
```ts
import { ..., createProductsTableIfNotExists } from "./src/sync/db";
```

**Почему:** `sync/db.ts` создаёт правильную таблицу `products`, а `utils.ts` — `shopProduct`.

### 1.2 Запустить создание таблиц при старте

Убедиться, что после исправления импорта в `server.ts` вызывается:
```ts
await ensureTables(); // должно создавать products
```

Перезапустить сервер и проверить:
```bash
sqlite3 data/local.db "SELECT name FROM sqlite_master WHERE type='table' AND name='products';"
```

---

## Приоритет 2: Исправить алгоритм расчёта плана (5200)

**Файл:** `packages/backend/src/evotor/index.ts`

Найти функцию `adjustSales` (строки ~2262-2272) и заменить на:

```ts
private adjustSales(sumSalesLast4Weeks: number): number {
    if (sumSalesLast4Weeks <= 0) {
        return 5200; // минимальный план
    }

    // Среднее за ДЕНЬ (4 недели = 28 дней)
    let dailyAverage = Math.floor(sumSalesLast4Weeks / 28);

    // Небольшая корректировка
    if (dailyAverage > 15000) {
        dailyAverage = Math.floor(dailyAverage * 1.05); // +5% при хороших продажах
    } else if (dailyAverage < 5200) {
        dailyAverage = 5200;
    }

    return dailyAverage;
}
```

### Дополнительно в `getPlan`:

- Убедиться, что `calculateSalesForShop` возвращает сумму за 4 недели, а не за день.

---

## Приоритет 3: Дополнительные важные правки

### 3.1 Dynamic import в cron.ts

**Файл:** `packages/backend/src/sync/cron.ts` (строки 263 и 473)

Заменить:
```ts
await import("./db.js")
```
На:
```ts
await import("./db");
```

### 3.2 Улучшить обработку ошибок в `getUuidsByParentUuidList`

**Файл:** `packages/backend/src/utils.ts` (~818)

Добавить перед SELECT:
```ts
// fallback: создать таблицу если её нет
await db.prepare(`CREATE TABLE IF NOT EXISTS products (...)`).run();
```

---

## Порядок действий

1. Исправить импорт в `server.ts` (1.1)
2. Перезапустить сервер
3. Проверить создание таблицы `products`
4. Исправить `adjustSales`
5. Проверить эндпоинт `/api/evotor/plan-for-today` — план должен стать реалистичным

После исправлений запустите:
```bash
cd packages/backend
npx tsx test-all-endpoints.ts
```

---

## Результат, который должен получиться:

- Таблица `products` существует
- План рассчитывается по реальным продажам (не всегда 5200)
- Синхронизация товаров работает

---

Если после первого шага (импорт) будут ошибки — сразу пришли логи.
Удачи!
