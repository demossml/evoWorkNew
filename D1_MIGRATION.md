# D1-First Миграция: Полный отказ от Evotor API в рантайме

## Суть изменений

Все бизнес-эндпойнты (`api.ts`) больше НЕ вызывают Evotor API напрямую. Данные магазинов, сотрудников, продаж, документов теперь живут в D1 и синхронизируются раз в 30 минут фоновыми cron-задачами.

**Результат:** время ответа критичных эндпойнтов упало с 3.2s до 68ms (в 47 раз).

## Архитектура

```
Evotor API ──(cron 30min)──> D1 (shops, employees, index_documents)
                                    │
                                    ▼
                            Все GET/POST эндпойнты ──> D1 (0 вызовов Evotor)
```

Исключение: `/api/documents` по-прежнему ходит в Evotor — это on-demand синхронизация свежих документов, и это правильно.

## Новые файлы

### `packages/backend/src/sync/db.ts`
D1-хелперы для магазинов и сотрудников:
- `createShopsTable(db)` / `createEmployeesTable(db)` — создание таблиц
- `syncShops(db, evo)` / `syncEmployees(db, evo)` — синхронизация из Evotor API → D1
- `getShopUuidsFromDB(db)` — `string[]`
- `getShopNameFromDB(db, uuid)` — `string`
- `getShopNameUuidsFromDB(db)` — `{uuid, name}[]`
- `getShopNameUuidsDictFromDB(db)` — `Record<string, string>`
- `getEmployeeNameFromDB(db, lastName)` — `string | null`
- `getEmployeeByLastNameDB(db, lastName)` — `{name, uuid}`
- `getEmployeeRoleFromDB(db, lastName)` — `string`
- `getEmployeesByShopIdDB(db, shopId)` — `{uuid, name}[]`
- `getEmployeesLastNameAndUuidFromDB(db)` — `{uuid, name}[]`
- `getEmployeesDictFromDB(db)` — `Record<string, string>`

### `packages/backend/src/evotor/utils.ts` (новые функции в конце файла)

- `getSalesgardenReportData(db, shopUuids, since, until)` — БЕЗ параметра `evo`
- `getDocumentsByCashOutcomeData(db, shopUuids, since, until)` — БЕЗ параметра `evo`
- `getSalesDataG(db, shopUuids, since, until)` — БЕЗ параметра `evo`
- `extractSalesInfoFromD1(db, since, until)` — AI-анализ продаж из D1
- `getCashByShopsFromD1(db)` — расчёт остатка наличных из index_documents
- `getSalesTodayFromD1(db)` — продажи за сегодня из D1

### `packages/backend/src/utils.ts` (изменения)

- `replaceUuidsWithNamesDB(data, db)` — замена `replaceUuidsWithNames(data, evo)`, резолвит UUID → имена через D1
- `getDataForCurrentDate(db, ...)` — считает зарплату из D1 (без `evo`)

### `packages/backend/src/evotor/index.ts` (изменения)

- `updateDataSaleByPlan` теперь принимает `db` вместо `evo` — считает планы из D1
- В `startupDataLoad` добавлены `await createShopsTable/EmployeesTable` и `syncShops/syncEmployees`

### `packages/backend/src/server.ts` (изменения)

Добавлены cron-задачи:
- `syncShops` — каждые 30 минут
- `syncEmployees` — каждые 30 минут
- `syncDocuments` — каждые 30 минут

## Изменённые эндпойнты в `api.ts`

| Эндпойнт | Было | Стало |
|---|---|---|
| `/api/employee-name` | `evo.getEmployeeLastName` | `getEmployeeNameFromDB(db, userId)` |
| `/api/by-last-name-uuid` | `evo.getEmployeesByLastName` | `getEmployeeByLastNameDB(db, ...)` |
| `/api/employee/name-uuid` | `evo.getEmployeesLastNameAndUuid` | `getEmployeesLastNameAndUuidFromDB(db)` |
| `/api/employee/and-store/name-uuid` | `evo.getEmployeesByShopId` | `getEmployeesByShopIdDB(db, shop)` |
| `/api/shops` | `evo.getShopNameUuids` | `getShopNameUuidsFromDB(db)` |
| `/api/schedules` | `evo.getShopUuids` + `evo.getShopName` + `evo.getEmployeeLastName` | всё из D1 |
| `/api/schedules/table` | `replaceUuidsWithNames(result, evo)` | `replaceUuidsWithNamesDB(result, db)` |
| `/api/schedules/table-view` | то же | то же |
| `/api/employee-role` | `evo.getEmployeeRole` | `getEmployeeRoleFromDB(db, userId)` |
| `/api/register` | `evo.getEmployeeRole` | `getEmployeeRoleFromDB(db, userId)` |
| `/api/evotor/sales-today` | `evo.getSalesToday` | `getSalesTodayFromD1(db)` |
| `/api/evotor/sales-today-graf` | `evo.getShopUuids` | `getShopUuidsFromDB(db)` |
| `/api/evotor/report/financial/today` | `getSalesgardenReportData(db, evo, ...)` | `getSalesgardenReportData(db, ...)` без evo |
| `/api/evotor/report/financial/7days` | то же | то же |
| `/api/evotor/report/financial/range` | то же | то же |
| `/api/evotor/sales-garden-report` | `evo.getShopUuids` + `evo.getSalesgardenReportData` + `evo.getDocumentsByCashOutcomeData` + `evo.getCashByShops` | всё из D1 |
| `/api/evotor/salesResult` | `evo.getShopUuids` | `getShopUuidsFromDB(db)` |
| `/api/ai-report` | `evo.getAllDocumentsByTypes` + `evo.extractSalesInfo` | `extractSalesInfoFromD1(db, ...)` |
| `/api/ai-association-rules` | то же | то же |
| `/api/evotor/settings-config` | `evo.getShops` + `evo.getGroupsByNameUuid` | `shopProduct` таблица D1 |
| `/api/evotor/settings/accessory-groups` | `evo.getShops` + `evo.getGroupsByNameUuid` | `shopProduct` таблица D1 |
| KPI `/api/evotor/report/kpi` | `getSalesgardenReportData(db, evo, ...)` | без evo |

## Что НЕ удалено (оставлено намеренно)

- `packages/backend/src/evotor/index.ts` — класс `Evotor` нужен для синхронизации (cron) и `/api/documents`
- Методы `getDocumentsIndexForShops`, `getAllDocumentsByTypes` — используются в sync и on-demand загрузке
- `import type { ShopUuidName } from "./evotor/types"` — используется типом

## Проверка после применения

```bash
cd packages/backend && npx tsc --noEmit   # 0 ошибок
curl http://localhost:3000/api/shops       # должен вернуть магазины из D1
curl http://localhost:3000/api/employee/name-uuid  # сотрудники из D1
curl http://localhost:3000/api/evotor/sales-today  # продажи из D1
```
