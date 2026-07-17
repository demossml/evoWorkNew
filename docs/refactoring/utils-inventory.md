# Utils Inventory — evoWorkNew Backend

> Сгенерировано: 2026-07-17 | Файл: `packages/backend/src/utils.ts`
> Всего экспортов: ~80 | Строк: 2942 (было 3289, −347 Binance)

## Группировка по доменам

### 📅 Дата и время (12 функций) → `lib/datetime.ts`
- formatDateTime, formatDateWithTime, formatDate
- getIsoTimestamp, getTodayRangeEvotor, getPeriodRangeEvotor
- calculateDateRanges, getDateRangesForWeeks, generateDateRanges, getIntervals
- getMonthStartAndEnd, buildSinceUntilFromDocuments

### 📊 Сортировка (4) → `lib/sort.ts`
- sortStockData, sortSalesData, sortSalesSummary, calculateTotalSum

### 🔧 Утилиты (3) → `lib/assert.ts`
- assert, buf2hex, isValidSign

### 📁 Telegram (2) → `lib/telegram.ts`
- getTelegramFile, getTelegramFileUpl

### 🗓️ Расписания (8) → `modules/schedules/`
- transformScheduleData, transformScheduleDataD
- createScheduleTable, deleteScheduleTable, updateSchedule
- getScheduleByPeriodAndShopId, getSchedule, getScheduleByPeriod

### 📄 Документы (6) → `lib/documents.ts`
- expandDocuments, prepareDocumentsForAI
- getDocumentsByPeriod, getDocumentsByCashOutcomeByPeriod
- getDocumentsBySalesPeriod, getDocumentsBySales

### 🛒 D1-продажи (9) → `d1/reports.ts`
- getShopNameFromD1, getOpenShopFromD1
- getSalesSumFromD1, getSalesQuantityFromD1
- getAveragePlan, getUuidsByParentUuidList
- getGroupsByNameUuid, getProductsByGroup, replaceUuidsWithNamesDB

### 🗄️ DDL-таблицы (8) → `db/schema/ddl-legacy.ts`
- createSalaryBonusTable, createAccessoriesTable
- createPlanTable, createScheduleTable, deleteScheduleTable
- createIndexDocumentsTable, createIndexOnType, createCandesTable

### 💾 D1-операции (9) → `sync/db.ts`
- saveSalaryAndBonus, saveOrUpdateUUIDs, getAllUuid
- getSalaryData, saveNewIndexDocuments, getLatestCloseDates, getData

### 🤖 AI-промпты (3) → `modules/ai-insights/prompts.ts`
- generateStoreAnalysisPrompt, generateLLMPromptFromDocuments, analyzeSalesDocuments

### 🏪 Открытия (6) → `modules/openings/`
- createOpenStorsTable, saveOpenStorsTable, updateOpenStore
- isOpenStoreExists, getOpenShopFromD1 (дубликат с d1-продажами)

### 🗑️ Дубликаты (уже в sync/db.ts — НЕ ИСПОЛЬЗУЮТСЯ из utils.ts)
- createProductsTableIfNotExists, createSalaryTable
- getPlan, getSalaryAndBonus, getSalesDataByDate
- saveSalaryData, updateOrInsertData, updatePlan

### ☠️ Удалено (Binance, не относится к домену)
- downloadCandleBinance*, syncBinanceAll, parsedCandles
- createCandesTable, saveCandlesToD1, CandleBinance, JSZip

### 🔧 Оставлено (общие R2-утилиты)
- saveToR2, saveFileToR2

## Целевое размещение

| Текущая функция | Целевой файл |
|----------------|-------------|
| formatDateTime, formatDate... | `lib/datetime.ts` |
| sortStockData, sortSalesData... | `lib/sort.ts` |
| assert, buf2hex, isValidSign | `lib/assert.ts` |
| getTelegramFile, getTelegramFileUpl | `lib/telegram.ts` |
| saveToR2, saveFileToR2 | `lib/storage.ts` |
| generateStoreAnalysisPrompt... | `modules/ai-insights/prompts.ts` |
| createIndexDocumentsTable... | `db/schema/ddl-legacy.ts` |
| Все D1-запросы продаж | `d1/reports.ts` |
| 8 дубликатов | **Удалить** (уже в sync/db.ts) |
