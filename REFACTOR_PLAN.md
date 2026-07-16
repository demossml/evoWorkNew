# 📋 План рефакторинга бэкенда — пошаговый

> Принцип: 1 изменение → тест → ✅ коммит / ❌ откат
> Каждый шаг атомарный. Не работает = `git checkout -- файл`

---

## 🔴 ФАЗА 1: Удаление мёртвого кода (самое безопасное)

Никто не импортирует = нельзя сломать. Идём от меньшего к большему.

### Шаг 1.1 — Удалить `delay` из `utils.ts`

**Почему первый**: функция в 2 строки, точно мёртвая. Разогрев.
```
Проверить: кто импортирует delay из utils.ts? → никто (все из sync/db.ts)
Действие: удалить функцию delay из utils.ts (строка ~1182)
Тест:    npx tsx test-all-endpoints.ts → 74/74 pass
Откат:   git checkout -- packages/backend/src/utils.ts
Коммит:  chore: удалён дубликат delay из utils.ts
```

### Шаг 1.2 — Удалить `createProductsTableIfNotExists` из `utils.ts`

```
Проверить: grep -rn "createProductsTableIfNotExists" → только sync/db.ts
Действие: удалить функцию из utils.ts
Тест:    npx tsx test-all-endpoints.ts → 74/74 pass
Коммит:  chore: удалён дубликат createProductsTableIfNotExists из utils.ts
```

### Шаг 1.3 — Удалить `createSalaryTable` из `utils.ts`

```
Действие: удалить
Тест:    npx tsx test-all-endpoints.ts
Коммит:  chore: удалён дубликат createSalaryTable из utils.ts
```

### Шаг 1.4 — Удалить `getPlan` из `utils.ts`

```
Действие: удалить
Тест:    npx tsx test-all-endpoints.ts
Коммит:  chore: удалён дубликат getPlan из utils.ts
```

### Шаг 1.5 — Удалить `getSalaryAndBonus` из `utils.ts`

```
Действие: удалить
Тест:    npx tsx test-all-endpoints.ts
Коммит:  chore: удалён дубликат getSalaryAndBonus из utils.ts
```

### Шаг 1.6 — Удалить `getSalesDataByDate` из `utils.ts`

```
Действие: удалить
Тест:    npx tsx test-all-endpoints.ts
Коммит:  chore: удалён дубликат getSalesDataByDate из utils.ts
```

### Шаг 1.7 — Удалить `saveSalaryData` из `utils.ts`

```
Действие: удалить
Тест:    npx tsx test-all-endpoints.ts
Коммит:  chore: удалён дубликат saveSalaryData из utils.ts
```

### Шаг 1.8 — Удалить `updateOrInsertData` из `utils.ts`

```
Действие: удалить
Тест:    npx tsx test-all-endpoints.ts
Коммит:  chore: удалён дубликат updateOrInsertData из utils.ts
```

### Шаг 1.9 — Удалить `updatePlan` из `utils.ts`

```
Действие: удалить
Тест:    npx tsx test-all-endpoints.ts
Коммит:  chore: удалён дубликат updatePlan из utils.ts
```

### Шаг 1.10 — Удалить `d1/index.ts` (мёртвый файл)

```
Проверить: никто не импортирует
Действие: rm packages/backend/src/d1/index.ts
          + убрать import из index.ts если есть
Тест:    npx tsx test-all-endpoints.ts → 74/74 pass
         + curl все ключевые эндпоинты
Коммит:  chore: удалён мёртвый файл d1/index.ts (486 строк, никем не используется)
```

**Проверка фазы 1**: ~600 строк мёртвого кода удалено, тесты зелёные. Пуш в оба remote.

---

## 🟡 ФАЗА 2: Консолидация D1-методов (перенос, не изменение)

Цель: все D1-методы в одном месте — `evotor/utils.ts`.

### Шаг 2.1 — Подготовка: создать бэкап

```
cp packages/backend/src/utils.ts packages/backend/src/utils.ts.bak
cp packages/backend/src/evotor/utils.ts packages/backend/src/evotor/utils.ts.bak
```

### Шаг 2.2 — Перенести `getDocumentsBySales` в `evotor/utils.ts`

```
Действие: скопировать функцию из utils.ts → в конец evotor/utils.ts
          заменить импорт в evotor/utils.ts:
            было: import { getDocumentsBySales, ... } from "../utils"
            стало: убрать getDocumentsBySales из импорта (теперь локально)
          проверить: кто ещё импортирует getDocumentsBySales из utils.ts?
            → если никто — удалить из utils.ts
Тест:    npx tsx test-all-endpoints.ts
         + curl -X POST localhost:8787/api/evotor/sales-result (основной потребитель)
Коммит:  refactor: перенос getDocumentsBySales в evotor/utils.ts
```

### Шаг 2.3 — Перенести `getDocumentsBySalesPeriod` в `evotor/utils.ts`

```
Действие: аналогично шагу 2.2
Тест:    npx tsx test-all-endpoints.ts
Коммит:  refactor: перенос getDocumentsBySalesPeriod в evotor/utils.ts
```

### Шаг 2.4 — Перенести `getDocumentsByCashOutcomeByPeriod` в `evotor/utils.ts`

```
Действие: аналогично
          убрать ВСЕ импорты из "../utils" в evotor/utils.ts
            (больше не должны зависеть от utils.ts)
Тест:    npx tsx test-all-endpoints.ts
Коммит:  refactor: перенос getDocumentsByCashOutcomeByPeriod в evotor/utils.ts
```

### Шаг 2.5 — Проверить и удалить перенесённые функции из `utils.ts`

```
Действие: убедиться, что 3 функции больше никто не импортирует из utils.ts
          удалить их из utils.ts
Тест:    npx tsx test-all-endpoints.ts
Коммит:  refactor: удалены D1-функции из utils.ts (теперь в evotor/utils.ts)
```

### Шаг 2.6 — Удалить бэкапы

```
rm packages/backend/src/utils.ts.bak
rm packages/backend/src/evotor/utils.ts.bak
```

**Проверка фазы 2**: `evotor/utils.ts` больше не импортирует из `../utils`. Чистый D1-слой.

---

## 🟢 ФАЗА 3: Типизация (безопасно — только добавляем типы)

Ничего не удаляем, только добавляем интерфейсы и заменяем `as any`.

### Шаг 3.1 — Создать `StockApiItem` в `evotor/types.ts`

```
Действие: добавить интерфейс:
  export interface StockApiItem {
    productUuid: string;
    quantity: number;
    measureName: string;
    purchasePrice: number;
    sellingPrice: number;
  }
Тест:    npx tsc --noEmit (проверить компиляцию)
Коммит:  types: добавлен интерфейс StockApiItem
```

### Шаг 3.2 — Заменить `as any` в `syncStock` (sync/cron.ts)

```
Действие: было: const items = (await evo.getStoreStock(shopId)) as any[];
          стало: const items: StockApiItem[] = await evo.getStoreStock(shopId);
Тест:    npx tsx test-all-endpoints.ts
Коммит:  types: убран as any из syncStock, добавлен StockApiItem
```

### Шаг 3.3 — Обновить `DeadStockItem` в `types.ts`

```
Действие: добавить недостающие поля:
  export interface DeadStockItem {
    itemId: string; name: string; article: string;
    quantity: number; sold: number;
    lastSaleDate: string | null;
    daysWithoutSales: number;
    shopId: string; shopName: string;
  }
Тест:    npx tsc --noEmit
         + проверить dead-stocks/data — API должен работать
Коммит:  types: обновлён DeadStockItem (добавлены itemId, article, daysWithoutSales, shopId, shopName)
```

**Проверка фазы 3**: типы актуальны, `as any` меньше.

---

## 🔵 ФАЗА 4: Рефакторинг (структурный, осторожный)

### Шаг 4.1 — Заменить `evo.getProducts` в `orderForecastV2.ts`

```
Действие: заменить прямой вызов Evotor API на D1-метод
          было: const allProducts = await evotor.getProducts(shopUuid);
          стало: использовать getProductStockFromD1 + getProductNamesByGroup
Тест:    curl заказ-forecast endpoint → должен работать и давать тот же результат
Откат:   git checkout -- packages/backend/src/services/orderForecastV2.ts
Коммит:  refactor: orderForecastV2 использует D1 вместо Evotor API
```

### Шаг 4.2 — Переименовать `evotor/utils.ts` → `d1/reports.ts`

```
Действие: git mv packages/backend/src/evotor/utils.ts packages/backend/src/d1/reports.ts
          обновить ВСЕ импорты во ВСЕХ файлах (api.ts, services, etc.)
          from "./evotor/utils" → from "./d1/reports"
Тест:    npx tsc --noEmit + npx tsx test-all-endpoints.ts
Откат:   git checkout -- . (восстановить все файлы)
Коммит:  refactor: переименован evotor/utils.ts → d1/reports.ts
```

### Шаг 4.3 — Разбить `utils.ts` (после фаз 1-2 файл станет ~2500 строк)

```
План разбивки:
  utils/date.ts      — formatDate, getIsoTimestamp, generateDateRanges, getTodayRangeEvotor...
  utils/telegram.ts  — sendToTelegram, getTelegramFile, getTelegramFileUpl...
  utils/documents.ts — parseTransactions, expandDocuments, prepareDocumentsForAI...
  utils/sort.ts      — sortSalesData, sortStockData, sortSalesSummary...
  utils/ai.ts        — generateStoreAnalysisPrompt, generateLLMPromptFromDocuments, analyzeSalesDocuments...

Шаги:
  4.3.1 — создать utils/date.ts, перенести, тест, коммит
  4.3.2 — создать utils/telegram.ts, перенести, тест, коммит
  4.3.3 — создать utils/documents.ts, перенести, тест, коммит
  4.3.4 — создать utils/sort.ts, перенести, тест, коммит
  4.3.5 — создать utils/ai.ts, перенести, тест, коммит
  4.3.6 — обновить ВСЕ импорты во ВСЕХ файлах
  4.3.7 — итоговый utils.ts содержит только re-export из подмодулей
```

### Шаг 4.4 — Разбить `api.ts` (4182 → ~300 строк в index)

```
План разбивки:
  api/shops.ts      — /api/evotor/shops, /api/evotor/groups-by-shop
  api/sales.ts      — /api/evotor/sales-result, /api/evotor/sales-today-graf
  api/deadstock.ts  — /api/dead-stocks/data, /api/analytics/dead-stock/*
  api/orders.ts     — /api/evotor/order, /api/order-forecast-v2
  api/salary.ts     — /api/evotor/salary, /api/salary/*
  api/analytics.ts  — /api/analytics/*
  api/ai.ts         — /api/ai/*
  api/schedules.ts  — /api/schedules/*
  api/reports.ts    — /api/profit-report, /api/evotor/stock-report, /api/evotor/sales-garden-report
  api/index.ts      — сборка: const api = new Hono().route("/api", shops).route("/api", sales)...

Шаги:
  4.4.1 — создать api/ директорию
  4.4.2 — api/shops.ts (самый маленький, ~50 строк), тест, коммит
  4.4.3 — api/sales.ts, тест, коммит
  4.4.4 — api/deadstock.ts, тест, коммит
  ... и так далее по одному модулю
  4.4.N — api/index.ts — сборка, замена в index.ts импорта
         было: import { api } from "./api"
         стало: import { api } from "./api/index"
  Тест: npx tsx test-all-endpoints.ts — все 74 теста зелёные
```

---

## ⚪ ФАЗА 5: Оптимизация (после рефакторинга)

### Шаг 5.1 — N+1 → 1 запрос в `getPerShopSales`

```
Действие: переписать цикл for (const shop of shops) на один UNION ALL запрос
Тест:    сравнить результаты до/после — должны совпадать
Коммит:  perf: getPerShopSales — один запрос вместо N
```

### Шаг 5.2 — batch UPSERT в `syncStock`

```
Действие: заменить N отдельных UPDATE на один INSERT OR REPLACE
Тест:    ручной запуск syncStock, проверка данных в D1
Коммит:  perf: syncStock — batch UPSERT вместо UPDATE
```

---

## 📊 ОБЩИЙ ПЛАН-ГРАФИК

| Фаза | Шагов | Время | Риск | Что делаем |
|------|-------|-------|------|------------|
| 🔴 1 | 10 | 1-2 ч | Нулевой | Удаление мёртвого кода |
| 🟡 2 | 6 | 2-3 ч | Низкий | Перенос D1-функций |
| 🟢 3 | 3 | 1-2 ч | Низкий | Типизация |
| 🔵 4 | ~20 | 5-7 ч | Средний | Рефакторинг структуры |
| ⚪ 5 | 2 | 2-3 ч | Средний | Оптимизация запросов |

---

## 🛡️ ПРАВИЛА БЕЗОПАСНОСТИ

1. **Перед каждым шагом**: `test-all-endpoints.ts` → записать результат
2. **После каждого шага**: `test-all-endpoints.ts` → должно совпадать с «до»
3. **Если упало**: `git checkout -- файл` → думаем → пробуем иначе
4. **Коммит после каждого успешного шага** (атомарность)
5. **Пуш после каждой фазы** (не копим)
6. **Никаких `--force`**, только `git push`
