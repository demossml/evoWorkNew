# 🔍 AUDIT REPORT — Backend EvoWorkNew (Первый проход)

> Дата: 2026-07-16 | Аудитор: AI Code Review
> Файлов проанализировано: 38 | Строк кода: ~15 000

---

## 1. КРИТИЧЕСКИЕ ПРОБЛЕМЫ (требуют немедленного исправления)

### 1.1. Дубликаты функций между `utils.ts` и `sync/db.ts`

**9 функций определены ДВАЖДЫ** с одинаковым именем в разных файлах:

| Функция | В `utils.ts` | В `sync/db.ts` | Серьёзность |
|---------|-------------|---------------|-------------|
| `createProductsTableIfNotExists` | ✅ | ✅ | 🔴 КРИТ |
| `createSalaryTable` | ✅ | ✅ | 🔴 КРИТ |
| `getPlan` | ✅ | ✅ | 🔴 КРИТ |
| `getSalaryAndBonus` | ✅ | ✅ | 🔴 КРИТ |
| `getSalesDataByDate` | ✅ | ✅ | 🔴 КРИТ |
| `saveSalaryData` | ✅ | ✅ | 🔴 КРИТ |
| `updateOrInsertData` | ✅ | ✅ | 🔴 КРИТ |
| `updatePlan` | ✅ | ✅ | 🔴 КРИТ |
| `delay` | ✅ | ✅ | 🟡 |

**Риск**: изменение в одном файле не попадает в другой → рассинхрон → баги в продакшене. Уже сейчас эти функции могут иметь разную реализацию!

**Решение**: оставить ТОЛЬКО в `sync/db.ts` (это домен sync-операций), из `utils.ts` удалить.

---

### 1.2. Типобезопасность: 67 использований `as any`

Файлы-лидеры по `as any`:
- `evotor/index.ts` — ~30 шт
- `api.ts` — ~20 шт
- `sync/cron.ts` — ~10 шт
- `evotor/utils.ts` — ~7 шт

**Риск**: runtime-ошибки, которые TypeScript не отлавливает. Каждый `as any` — потенциальный баг.

**Пример из sync/cron.ts**:
```typescript
const items = (await evo.getStoreStock(shopId)) as any[];  // нет типа!
```

**Решение**: создать интерфейс `StockApiItem` для ответа API, использовать везде вместо `as any`.

---

### 1.3. Нарушение правила «D1-only»: `orderForecastV2.ts`

```typescript
// services/orderForecastV2.ts:164
const allProducts = await evotor.getProducts(shopUuid);  // ❌ Прямой вызов API
```

**Почему это плохо**: каждый запрос пользователя на страницу прогноза закупок → живой запрос в Эвотор → rate-limit, медленно, ненадёжно.

**Решение**: использовать `getProductStockFromD1(db, shopId, [])` (уже готов, протестирован).

---

### 1.4. Зависимость `evotor/utils.ts` → `utils.ts`

```typescript
// evotor/utils.ts импортирует из utils.ts (НЕ-D1 файла):
import { getDocumentsByCashOutcomeByPeriod, getDocumentsBySales, getDocumentsBySalesPeriod } from "../utils";
```

`evotor/utils.ts` должен быть ЧИСТЫМ D1-слоем, но зависит от `utils.ts`, который содержит:
- Функции форматирования дат
- Работу с Telegram
- Создание таблиц (дубликаты с sync/db.ts)
- AI-промпты

**Решение**: вынести `getDocumentsBySales` и подобные в `evotor/utils.ts` или в отдельный `d1/queries.ts`.

---

## 2. АРХИТЕКТУРНЫЕ ПРОБЛЕМЫ

### 2.1. Монолитный `api.ts` (4182 строки)

Один файл содержит ВСЕ эндпоинты. Невозможно:
- Найти нужный эндпоинт
- Понять границы ответственности
- Тестировать изолированно

**Решение**: разбить на модули по доменам:
```
api/
├── index.ts          # сборка роутера
├── shops.ts          # /api/evotor/shops
├── sales.ts          # /api/evotor/sales-result
├── deadstock.ts      # /api/dead-stocks/*
├── analytics.ts      # /api/analytics/*
├── orders.ts         # /api/evotor/order
├── salary.ts         # /api/evotor/salary
├── schedules.ts      # /api/schedules/*
└── ai.ts             # /api/ai/*
```

### 2.2. `utils.ts` (3294 строки) — свалка

Содержит ВСЁ: форматирование дат, D1-запросы, Telegram, AI-промпты, создание таблиц, парсинг документов.

**Решение**: разбить на:
```
utils/
├── date.ts           # formatDate, getIsoTimestamp, generateDateRanges...
├── db-tables.ts      # createIndexDocumentsTable, createPlanTable... (→ устареет после удаления дубликатов)
├── telegram.ts       # sendToTelegram, getTelegramFile...
├── ai-prompts.ts     # generateStoreAnalysisPrompt, prepareDocumentsForAI...
├── documents.ts      # expandDocuments, parseTransactions...
└── sort.ts           # sortSalesData, sortStockData...
```

### 2.3. `evotor/utils.ts` (1198 строк) — смешанная ответственность

Содержит и D1-методы (✅), и методы, зависящие от `utils.ts` (❌). Имя файла вводит в заблуждение — это не Evotor-утилиты, а D1-методы для отчётов.

**Решение**: переименовать в `d1/reports.ts` или `d1/queries.ts`.

### 2.4. `d1/index.ts` (486 строк) — непонятное назначение

Дублирует часть функций из `sync/db.ts` и `utils.ts`. Содержит `createSalaryBonusTable`, `saveSalaryAndBonus` — которые уже есть в `utils.ts` (дубликат №3!).

**Решение**: удалить, функциональность уже покрыта в `sync/db.ts`.

---

## 3. ПРОБЛЕМЫ С ТИПАМИ

### 3.1. Отсутствие интерфейсов для ответов API

```typescript
// sync/cron.ts — syncStock
const items = (await evo.getStoreStock(shopId)) as any[];  // что внутри?
// ↓ должно быть:
interface StockApiItem { productUuid: string; quantity: number; measureName: string; purchasePrice: number; sellingPrice: number; }
const items: StockApiItem[] = await evo.getStoreStock(shopId);
```

### 3.2. `DeadStockItem` в `types.ts` — устарел?

```typescript
export interface DeadStockItem {
    name: string; quantity: number; sold: number; lastSaleDate: string | null;
    mark?: "keep" | "move" | "sellout" | "writeoff" | null;
    moveCount?: number; moveToStore?: string;
}
```

Нет полей `itemId`, `article`, `daysWithoutSales`, `shopId`, `shopName` — которые теперь используются в реальном API.

**Решение**: обновить или создать `DeadStockReportItem`.

---

## 4. ПРОБЛЕМЫ С ПРОИЗВОДИТЕЛЬНОСТЬЮ

### 4.1. N+1 запросы в `evotor/utils.ts`

`getPerShopSales` делает отдельный запрос для КАЖДОГО магазина:
```typescript
for (const shop of shops.results) {
    const docs = await db.prepare(...).bind(shop.uuid, ...).all();  // N запросов
}
```

**Решение**: один запрос с `UNION ALL` или собрать все shop_id и сделать один SELECT с `IN`.

### 4.2. Парсинг JSON на лету

Каждый вызов `getProductStockFromD1`, `getAllTimeLastSale` и др. парсит JSON из `index_documents.transactions`. Для 2480 товаров × 3 магазина = много операций.

**Решение**: предварительно агрегировать данные в отдельную таблицу или использовать `JSON_EACH` в SQL.

### 4.3. `syncStock` — UPDATE каждой записи отдельно

```typescript
for (const item of items) {
    batch.push(productStmt.bind(qty, price, measureName, shopId, uuid));  // N отдельных UPDATE
}
```

**Решение**: собирать данные и делать один UPSERT с INSERT OR REPLACE.

---

## 5. ОШИБКИ И ПОТЕНЦИАЛЬНЫЕ БАГИ

### 5.1. `DeadStock` endpoint — нет защиты от `undefined` groups

```typescript
const { startDate, endDate, shopIds, groups } = await c.req.json<{...}>();
// groups может быть undefined → .length вызовет ошибку
```

**Исправление**: `groups = []` по умолчанию.

### 5.2. Неиспользуемый импорт `d1/index.ts`

Файл `d1/index.ts` импортируется (вероятно) где-то в коде, но дублирует `sync/db.ts`. Нужно проверить все импорты перед удалением.

---

## 6. СТРУКТУРА: ЧТО НЕ ТАК

```
src/
├── api.ts                 ❌ 4182 строки — монолит
├── utils.ts               ❌ 3294 строки — свалка
├── types.ts               ✅ нормально (133 строки)
├── helpers.ts             ✅ нормально (134 строки)
├── index.ts               ✅ нормально
├── evotor/
│   ├── index.ts           ❌ зависит от utils.ts
│   ├── utils.ts           ❌ должен называться d1/queries.ts
│   ├── types.ts           ✅ нормально
│   └── schema.ts          ✅ нормально
├── sync/
│   ├── cron.ts            ✅ нормально
│   └── db.ts              ⚠️ 9 дубликатов с utils.ts
├── services/              ✅ каждый файл — один отчёт (хорошо)
├── d1/
│   └── index.ts           ❌ дублирует sync/db.ts, можно удалить
├── db/
│   ├── migrations.ts      ✅ нормально
│   ├── schema/            ✅ нормально
│   └── repositories/      ✅ нормально
├── ai/
│   ├── index.ts           ⚠️ 613 строк, смесь промптов и вызовов
│   └── helpers.ts         ✅ нормально
└── adapters/
    ├── local-db.ts        ✅ нормально (для dev)
    └── local-storage.ts   ✅ нормально
```

---

## 7. ИТОГОВАЯ ОЦЕНКА

| Категория | Оценка | Комментарий |
|-----------|--------|-------------|
| Архитектура | ⭐⭐ | Монолит, дубликаты, нет разделения слоёв |
| Типобезопасность | ⭐⭐ | 67 `as any`, нет типов для API-ответов |
| Производительность | ⭐⭐⭐ | N+1 запросы, парсинг JSON на лету |
| Тестируемость | ⭐ | Нет unit-тестов, только интеграционный |
| Документация | ⭐⭐⭐ | CODEBUDDY.md и backend-methods.md хороши |
| Безопасность | ⭐⭐⭐⭐ | Параметризованные запросы, нет инъекций |

**Общая оценка: 2.5 / 5** — код работает, но архитектура требует рефакторинга.

---

## 8. ПЛАН ИСПРАВЛЕНИЙ (по приоритету)

### 🔴 Фаза 1: Критическое (немедленно, 1 день)
1. Удалить 9 дубликатов из `utils.ts` → оставить в `sync/db.ts`, обновить импорты
2. Удалить `d1/index.ts` → проверить кто его импортирует
3. Исправить `groups ?? []` в dead-stocks/data

### 🟡 Фаза 2: Типизация (1-2 дня)
4. Создать интерфейсы для ответов Evotor API (StockApiItem, etc.)
5. Заменить 67 `as any` на правильные типы
6. Обновить `DeadStockItem` → добавить недостающие поля

### 🟢 Фаза 3: Рефакторинг (3-5 дней)
7. Разбить `api.ts` на модули (`api/*.ts`)
8. Разбить `utils.ts` на доменные файлы (`utils/*.ts`)
9. Переименовать `evotor/utils.ts` → `d1/reports.ts`
10. Заменить `evo.getProducts` в `orderForecastV2.ts` на `getProductStockFromD1`

### 🔵 Фаза 4: Оптимизация (2-3 дня)
11. Устранить N+1 запросы в `getPerShopSales` (один UNION ALL)
12. Добавить агрегирующие таблицы для часто запрашиваемых данных
13. Оптимизировать `syncStock` — batch UPSERT вместо отдельных UPDATE

---

## 9. СХЕМА ЗАВИСИМОСТЕЙ (как должно быть)

```
evotor/index.ts (Evotor API)  ──→  sync/cron.ts  ──→  sync/db.ts  ──→  D1
                                      │
                                      ▼
                              shopProduct.quantity (данные)
                                      │
                                      ▼
api/ ←── d1/reports.ts ←── D1 (SELECT only)
  │              │
  └── services/  ┘
```

Никаких перекрёстных зависимостей. Чистые слои.

---

*Конец первого прохода. Запускаю второй проход для перепроверки...*
