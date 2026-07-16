# 📋 План разбиения utils.ts (3289 строк → 12 модулей)

> Принцип: 1 модуль → тест → коммит. Не работает → откат.
> Дубликаты (8 функций) удаляются при разбиении, а не переносятся.

---

## Структура ДО

```
utils.ts — 3289 строк, 90 экспортов, одна свалка
```

## Структура ПОСЛЕ

```
utils/
├── index.ts          # re-export всех подмодулей (для обратной совместимости)
├── assert.ts         # assert, buf2hex, isValidSign
├── date.ts           # formatDate, getIsoTimestamp, generateDateRanges...
├── db-tables.ts      # createIndexDocumentsTable, createPlanTable... (НЕ дубликаты)
├── db-sync.ts        # saveNewIndexDocuments, getLatestCloseDates... (НЕ дубликаты)
├── d1-sales.ts       # getSalesSumFromD1, getProductsByGroup, getUuidsByParentUuidList...
├── documents.ts      # getDocumentsBySales, expandDocuments, prepareDocumentsForAI...
├── telegram.ts       # getTelegramFile, getTelegramFileUpl
├── schedule.ts       # updateSchedule, getSchedule, transformScheduleData...
├── sort.ts           # sortSalesData, sortStockData, sortSalesSummary, calculateTotalSum
├── ai.ts             # generateStoreAnalysisPrompt, generateLLMPromptFromDocuments, analyzeSalesDocuments
├── binance.ts        # downloadCandleBinance, syncBinanceAll, parsedCandles...
└── vape.ts           # groupIdsVape (константа)
```

---

## Пошаговый план

### 🔹 Шаг 0 — Подготовка

```bash
mkdir -p packages/backend/src/utils
cp packages/backend/src/utils.ts packages/backend/src/utils.ts.bak
```

### 🔹 Шаг 1 — `utils/date.ts` (самое безопасное, чисто функции)

**Функции (12 шт):**
- formatDateTime, formatDateWithTime, formatDate
- getIsoTimestamp, getTodayRangeEvotor, getPeriodRangeEvotor
- calculateDateRanges, getDateRangesForWeeks, generateDateRanges, getIntervals
- getMonthStartAndEnd, buildSinceUntilFromDocuments

**Действия:**
1. Создать `utils/date.ts`, скопировать 12 функций
2. Из `utils.ts` удалить эти 12 функций
3. Добавить в начало `utils.ts`: `export * from "./utils/date"`
4. Проверить: `npx tsc --noEmit` (не должно быть ошибок импорта)
5. `npx tsx test-all-endpoints.ts` → 9 FAIL (как было)

**Откат:** `rm utils/date.ts && git checkout -- utils.ts`

**Коммит:** `refactor: вынес date-утилиты в utils/date.ts`

---

### 🔹 Шаг 2 — `utils/sort.ts`

**Функции (4 шт):**
- sortStockData, sortSalesData, sortSalesSummary, calculateTotalSum

**Действия:** аналогично шагу 1

---

### 🔹 Шаг 3 — `utils/assert.ts`

**Функции (3 шт):**
- assert, buf2hex, isValidSign

---

### 🔹 Шаг 4 — `utils/telegram.ts`

**Функции (2 шт):**
- getTelegramFile, getTelegramFileUpl

---

### 🔹 Шаг 5 — `utils/vape.ts`

**Константа (1 шт):**
- groupIdsVape

---

### 🔹 Шаг 6 — `utils/schedule.ts`

**Функции (6 шт):**
- transformScheduleData, transformScheduleDataD
- createScheduleTable, deleteScheduleTable, updateSchedule
- getScheduleByPeriodAndShopId, getSchedule, getScheduleByPeriod

---

### 🔹 Шаг 7 — `utils/documents.ts`

**Функции (6 шт):**
- expandDocuments, prepareDocumentsForAI
- getDocumentsByPeriod, getDocumentsByCashOutcomeByPeriod
- getDocumentsBySalesPeriod, getDocumentsBySales

⚠️ **Эти 3 функции нужно ТАКЖЕ скопировать в `evotor/utils.ts`:**
- getDocumentsBySales
- getDocumentsBySalesPeriod
- getDocumentsByCashOutcomeByPeriod

После копирования в `evotor/utils.ts` — обновить импорт там же:
```typescript
// было:  import { getDocumentsBySales, ... } from "../utils"
// стало: (локально, без импорта)
```

---

### 🔹 Шаг 8 — `utils/d1-sales.ts`

**Функции (9 шт):**
- getShopNameFromD1, getOpenShopFromD1
- getSalesSumFromD1, getSalesQuantityFromD1
- getAveragePlan, getUuidsByParentUuidList
- getGroupsByNameUuid, getProductsByGroup
- replaceUuidsWithNamesDB

---

### 🔹 Шаг 9 — `utils/db-tables.ts` (без дубликатов!)

**Функции (8 шт) — только НЕ-дубликаты:**
- createSalaryBonusTable
- createAccessoriesTable
- createPlanTable
- createScheduleTable
- deleteScheduleTable
- createIndexDocumentsTable
- createIndexOnType
- createCandesTable

❌ **НЕ переносить (удалить):**
- createProductsTableIfNotExists → дубликат, есть в sync/db.ts
- createSalaryTable → дубликат, есть в sync/db.ts

---

### 🔹 Шаг 10 — `utils/db-sync.ts` (без дубликатов!)

**Функции (9 шт) — только НЕ-дубликаты:**
- saveSalaryAndBonus, saveOrUpdateUUIDs, getAllUuid
- getSalaryData, saveNewIndexDocuments, getLatestCloseDates
- getData, getOpenShopFromD1 (уже в d1-sales? проверить)

❌ **НЕ переносить (удалить из utils.ts при разбиении):**
- getSalaryAndBonus → дубликат sync/db.ts
- updatePlan → дубликат sync/db.ts
- getPlan → дубликат sync/db.ts
- getSalesDataByDate → дубликат sync/db.ts
- updateOrInsertData → дубликат sync/db.ts
- saveSalaryData → дубликат sync/db.ts

> Все 6 дубликатов просто **удаляются** из utils.ts. Они уже есть в sync/db.ts, и все импорты уже указывают на sync/db.ts.

---

### 🔹 Шаг 11 — `utils/ai.ts`

**Функции (3 шт):**
- generateStoreAnalysisPrompt
- generateLLMPromptFromDocuments
- analyzeSalesDocuments

---

### 🔹 Шаг 12 — `utils/binance.ts`

**Функции + типы (8 шт):**
- CandleBinance (type), CandleBinanseCsv (type)
- downloadCandleBinance, downloadCandleBinance2, downloadCandleBinance3
- saveToR2, syncBinanceAll, parsedCandles
- createCandesTable

---

### 🔹 Шаг 13 — Финал: `utils/index.ts`

Заменить содержимое `utils.ts` на re-exports:

```typescript
// utils.ts → теперь просто ре-экспортирует подмодули
export * from "./utils/assert";
export * from "./utils/date";
export * from "./utils/sort";
export * from "./utils/telegram";
export * from "./utils/vape";
export * from "./utils/schedule";
export * from "./utils/documents";
export * from "./utils/d1-sales";
export * from "./utils/db-tables";
export * from "./utils/db-sync";
export * from "./utils/ai";
export * from "./utils/binance";
```

**Проверка:** `npx tsc --noEmit` + `npx tsx test-all-endpoints.ts`

Все существующие импорты `from "../utils"` продолжат работать, потому что `utils.ts` ре-экспортирует всё из подмодулей.

---

## Что даёт разбиение

| Было | Стало |
|------|-------|
| 1 файл, 3289 строк | 13 файлов, ~200-400 строк каждый |
| 8 дубликатов | 0 (удалены в шагах 9-10) |
| Непонятно где что | Каждый модуль = один домен |
| Нельзя безопасно править | Можно править один модуль без страха |

---

## Оценка времени

- Шаги 0-5: 30 мин (простые модули)
- Шаги 6-8: 45 мин (средние)
- Шаги 9-10: 30 мин (удаление дубликатов)
- Шаги 11-13: 30 мин (AI, binance, финал)

**Всего: ~2.5 часов**
