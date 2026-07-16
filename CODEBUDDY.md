# CODEBUDDY.md — Правила разработки EvoWorkNew

> Последнее обновление: 2026-07-16
> Для всех разработчиков: бэкенд, фронтенд, девопс.
> Нарушение правил = баги в продакшене. Не отступай без явной причины.

---

## 0. ОБЩАЯ АРХИТЕКТУРА

```
Эвотор (API) ──sync (cron)──▶ D1 (SQLite) ──SELECT──▶ Backend (Hono) ──JSON──▶ Frontend (React+Vite)
```

**Главный принцип**: Эвотор API используется **ТОЛЬКО** для синхронизации данных в D1. Все отчёты, страницы, аналитика — **ТОЛЬКО** читают D1. Ни один пользовательский запрос не должен ходить в Эвотор напрямую.

### Почему:
- Rate-limit Эвотор API (ограниченное число запросов)
- Скорость: D1 отвечает за миллисекунды, Эвотор — за секунды
- Надёжность: если Эвотор недоступен, отчёты всё равно работают на последних синхронизированных данных
- Архитектурная чистота: sync — отдельный слой, отчёты — отдельный

### Исключение (временное):
`orderForecastV2.ts` (прогноз закупки) пока ходит в Эвотор напрямую за остатками. Это будет исправлено после тестирования `getProductStockFromD1` на DeadStock.

---

## 1. СТРУКТУРА ПРОЕКТА

```
testapp2/
├── packages/
│   ├── backend/          # Cloudflare Workers (Hono) + D1
│   │   └── src/
│   │       ├── api.ts            # ВСЕ API-эндпоинты
│   │       ├── index.ts          # Точка входа + cron-расписание
│   │       ├── helpers.ts        # Middleware (auth, init, ensureTables)
│   │       ├── types.ts          # Общие типы
│   │       ├── evotor/
│   │       │   ├── index.ts      # Evotor API-клиент (❌ только для sync)
│   │       │   ├── utils.ts      # D1-методы для отчётов (✅ везде)
│   │       │   ├── types.ts      # Типы Evotor API
│   │       │   └── schema.ts     # Zod-схемы
│   │       ├── sync/
│   │       │   ├── cron.ts       # Все cron-задачи (syncDocuments, syncStock...)
│   │       │   └── db.ts         # D1-операции для sync (upsert, таблицы)
│   │       ├── services/         # Бизнес-логика отчётов
│   │       ├── db/               # Drizzle ORM + миграции
│   │       │   └── migrations.ts # Идемпотентные миграции (ALTER TABLE)
│   │       └── utils/            # Вспомогательные функции
│   └── frontend/         # React 18 + Vite + TypeScript
│       └── src/
│           ├── pages/            # Страницы (роуты)
│           ├── widgets/          # Переиспользуемые виджеты
│           ├── features/         # Фичи (бизнес-логика)
│           ├── entities/         # Сущности
│           ├── shared/           # Общие API-клиенты, хелперы
│           ├── components/       # UI-компоненты (shadcn/ui)
│           ├── hooks/            # Кастомные хуки
│           └── helpers/          # Утилиты (telegram, api)
├── biome.json           # Линтер
├── turbo.json           # Монорепа-билд
└── pnpm-workspace.yaml
```

---

## 2. БЭКЕНД: ГЛАВНЫЕ ПРАВИЛА

### 2.1. Источники данных — жёсткое правило

| Уровень | Что можно | Что нельзя |
|---------|-----------|------------|
| **API-эндпоинт** (`api.ts`) | Только D1 (`c.get("db")`) | `c.var.evotor.*` |
| **Сервис** (`services/`) | Только D1 | `evo.getProducts()` и т.д. |
| **Sync-задача** (`sync/cron.ts`) | Evotor API → D1 | — |
| **Evotor/utils.ts** | Только D1 | Evotor API |

### 2.2. Матчинг товаров — по ИМЕНИ, не по UUID

```typescript
// ❌ НЕПРАВИЛЬНО — UUID разный в разных магазинах для одного товара
WHERE commodityUuid = ?

// ✅ ПРАВИЛЬНО — имя товара одинаковое во всех магазинах
WHERE commodityName = ?
```

**Причина**: Эвотор назначает разные UUID одному и тому же товару в разных магазинах. Имя (`commodityName`) — единственный надёжный идентификатор.

### 2.3. Создание нового отчёта — пошаговый алгоритм

1. **Определи данные**: какие таблицы D1 нужны
2. **Найди существующие D1-методы** в `evotor/utils.ts` или `sync/db.ts` — используй их
3. **Если метода нет** → создай новый в `evotor/utils.ts`:
   - Только `SELECT`
   - Экспортируй как `export async function`
   - Документируй JSDoc: `@param`, `@returns`, где используется
4. **Добавь эндпоинт** в `api.ts`:
   - Используй Hono: `app.get(...)` / `app.post(...)`
   - Валидируй входные параметры
   - Оберни всё тело в `try/catch` → 500 с осмысленным логом
5. **Задокументируй** метод в `/memories/repo/backend-methods.md`
6. **Добавь тест-кейс** в `test-all-endpoints.ts`

### 2.4. Эндпоинты — шаблон

```typescript
.post("/api/example/data", async (c) => {
    try {
        const db = c.get("db");                          // D1Database
        const { param1, param2 } = await c.req.json();   // Входные данные

        if (!param1) {
            return c.json({ error: "param1 обязателен" }, 400);
        }

        const result = await someD1Method(db, param1);   // D1-метод
        return c.json(result);
    } catch (err) {
        console.error("example/data error:", err);
        return c.json({ error: String(err) }, 500);
    }
})
```

### 2.5. D1-запросы

- Всегда используй параметризованные запросы: `db.prepare("...").bind(val1, val2)`
- Никакой конкатенации строк в SQL (SQL-инъекции)
- Для `IN (...)` — генерируй плейсхолдеры: `productNames.map(() => "?").join(",")`
- Транзакции из `index_documents.transactions` — всегда JSON-строка, парси через `JSON.parse()` в `try/catch`
- Даты в `index_documents.close_date` — в формате `YYYY-MM-DDTHH:mm:ss.000+0300`

### 2.6. Обработка ошибок

- Каждый эндпоинт — `try/catch` → 500
- Каждый D1-метод: если данные не найдены → возвращай пустой массив/Map/0, не ошибку
- Логируй через `console.error` с префиксом `[methodName]`
- Не возвращай сырой `err.message` клиенту в продакшене

---

## 3. БАЗА ДАННЫХ (D1)

### 3.1. Таблицы

| Таблица | Назначение | Ключевые колонки |
|---------|-----------|-----------------|
| `shops` | Магазины | uuid, name |
| `employees` | Сотрудники | uuid, name, lastName, role, shop_id |
| `shopProduct` | Товары в магазинах | uuid, name, shopId, parentUuid, product_group, **quantity**, article, price, measureName |
| `index_documents` | Документы (чеки, возвраты...) | number, shop_id, close_date, type, transactions (JSON) |
| `plan` | План продаж | date, shopUuid, sum |
| `stock` | Детальные остатки | shop_id, product_uuid, quantity |
| `dead_stock_cache` | Кэш мёртвых остатков | itemId, shopId, name, daysWithoutSales |
| `shop_schedules` | Расписание | shopId, weekday, openTime, closeTime |
| `seller_absence_events` | Отсутствия | sellerUuid, shopId, date |
| `seller_daily_metrics` | Метрики продавцов | date, sellerUuid, shopId, revenue |
| `saleByPlan` | План-факт | date, shopUuid, factSum |

### 3.2. Типы документов в index_documents

| Тип | Влияние на остаток | Описание |
|-----|-------------------|----------|
| `SELL` | ➖ минус | Продажа |
| `PAYBACK` | ➕ плюс | Возврат |
| `ACCEPT` | ➕ плюс | Приёмка/поступление |
| `WRITE_OFF` | ➖ минус | Списание |
| `RETURN` | ➖ минус | Возврат поставщику |
| `INVENTORY` | 🔄 перезапись | Инвентаризация |
| `OPEN_TARE` | ➖ минус | Вскрытие тары |

### 3.3. Структура транзакций (JSON в index_documents.transactions)

```json
[
  { "type": "REGISTER_POSITION", "commodityUuid": "...", "commodityName": "Товар", "quantity": 2, "sum": 500 },
  { "type": "PAYMENT", "paymentType": "CARD", "sum": 500 }
]
```

Ключевые поля для парсинга:
- `tx.type === "REGISTER_POSITION"` — позиция в чеке (интересует для отчётов)
- `tx.type === "PAYMENT"` — оплата (интересует для финансовых отчётов)
- `tx.commodityName` — имя товара (использовать для матчинга!)
- `tx.commodityUuid` — UUID товара (НЕ использовать для матчинга между магазинами)
- `tx.quantity` — количество
- `tx.sum` — сумма

### 3.4. Миграции

**Файл**: `packages/backend/src/db/migrations.ts`

**Правила**:
- Миграции должны быть **идемпотентными** (можно запускать многократно)
- `addColumnIfMissing` — добавляет колонку, игнорирует «duplicate column»
- `CREATE TABLE IF NOT EXISTS` — не ломается, если таблица есть
- `CREATE INDEX IF NOT EXISTS` — аналогично
- Вызываются в `helpers.ts` → `ensureTables()` (при холодном старте API)
- И в `index.ts` → `scheduled()` (перед cron-задачами)

**Добавление новой колонки**:
```typescript
await addColumnIfMissing(db, "table_name", "column_name", "INTEGER DEFAULT 0");
```

---

## 4. СИНХРОНИЗАЦИЯ (CRON)

### 4.1. Расписание

| Крон | Задачи |
|------|--------|
| `*/3 * * * *` | `syncDocuments` (SELL-документы) + `syncStock` (остатки) |
| `*/25 * * * *` | `updateProducts` + `updateProductsShope` |
| `0 3 * * *` | План-факт, алерты |
| `0 4 * * *` | Метрики продавцов |
| `0 5 * * *` | Лаг плана, топ продавцов |

### 4.2. Как работает syncStock

1. Вызывает `GET /api/v2/inventories/stores/{storeId}/stock` (Эвотор v2)
2. Для каждого товара: `UPDATE shopProduct SET quantity = ?, price = ?, measureName = ?`
3. Также пишет в отдельную таблицу `stock` для истории

### 4.3. Как работает syncDocuments

1. Проверяет пробелы в `index_documents` за последние 90 дней
2. Докачивает недостающие дни
3. Синхронизирует свежие документы за последние 3 минуты

---

## 5. КЛЮЧЕВЫЕ D1-МЕТОДЫ (использовать в отчётах)

Все методы лежат в `packages/backend/src/evotor/utils.ts`. Полный список — в `/memories/repo/backend-methods.md`.

### Самые используемые:

```typescript
// Группы → имена товаров
getProductNamesByGroup(db, shopId, groupIds) → string[]

// Продажи по именам товаров
getSalesByProductFromD1(db, shopId, since, until, names) → Record<name, {quantitySale, sum}>

// Остатки из D1 (заполняются syncStock)
getProductStockFromD1(db, shopId, names) → Map<name, quantity>

// Магазины
getShopUuidsFromDB(db) → string[]
getShopNameUuidsFromDB(db) → {uuid, name}[]

// Сотрудники
getEmployeesLastNameAndUuidFromDB(db) → {uuid, name}[]
```

---

## 6. ФРОНТЕНД: ПРАВИЛА

### 6.1. Стек
- React 18, Vite, TypeScript
- TailwindCSS, Framer Motion, Recharts
- shadcn/ui (компоненты)
- React Router v6
- Telegram Mini App SDK

### 6.2. Структура страницы

Страницы лежат в `pages/`. Каждая страница:
- Экспортирует `default function PageName()`
- Сама управляет своим состоянием (useState)
- Использует виджеты из `widgets/` для переиспользуемых блоков
- **Не содержит** бизнес-логику — только UI + вызовы API

### 6.3. Структура виджета

```
widgets/
├── deadstock/
│   ├── index.ts              # Экспорт виджетов
│   └── ui/
│       ├── DeadStockGrid.tsx          # Плитки товаров
│       └── DeadStockDetailModal.tsx   # Модальное окно с аналитикой
├── filters/
│   ├── index.ts
│   └── ShopFilter.tsx        # Общий компонент выбора магазинов
└── reports/
    └── ...
```

### 6.4. Вызовы API

```typescript
import { client } from "@shared/api";

// POST с JSON-телом
const response = await client.api["dead-stocks"].data.$post({
  json: { startDate, endDate, shopIds, groups }
});

// GET с query-параметрами
const response = await fetch(`/api/analytics/dead-stock/analyze?itemId=${id}&shopId=${sid}&fast=1`);
```

### 6.5. Общие компоненты

- **ShopFilter** (`widgets/filters/ShopFilter.tsx`) — мульти-выбор магазинов (чипсы)
  ```typescript
  <ShopFilter shops={shopOptions} selectedIds={selectedShops} onChange={setSelectedShops} />
  ```
- **GroupSelector** (`widgets/reports/`) — выбор групп товаров
- **LoadingState / ErrorState** (`@shared/ui/states`) — состояния загрузки/ошибки

### 6.6. Стили

- TailwindCSS utility-классы
- `app-page` — класс для корневого div страницы
- `bg-background text-foreground` — фон/текст (темизация)
- `bg-card border-border` — карточки
- `text-muted-foreground` — второстепенный текст
- Анимации: `motion.div` из Framer Motion с `initial/animate/transition`

### 6.7. Состояния

- **Загрузка**: `LoadingState` или Spinner
- **Ошибка**: `ErrorState` с текстом ошибки
- **Пусто**: осмысленное сообщение «Нет данных»
- **Успех**: данные

### 6.8. Telegram Mini App

```typescript
import { telegram, isTelegramMiniApp } from "../../helpers/telegram";

const isMiniApp = isTelegramMiniApp();

// Главная кнопка
telegram.WebApp.MainButton.setText("Сгенерировать отчёт");
telegram.WebApp.MainButton.show();
telegram.WebApp.MainButton.onClick(handler);

// Вибрация
telegram.WebApp.HapticFeedback.impactOccurred("light");
```

---

## 7. АНТИ-ПАТТЕРНЫ (ЧТО НЕЛЬЗЯ ДЕЛАТЬ)

### ❌ Вызывать Evotor API в отчёте
```typescript
// НИКОГДА в api.ts или services/
const products = await evo.getProducts(shopId); // ❌
```
→ Используй D1-метод или `getProductStockFromD1`.

### ❌ Матчить товары по UUID между магазинами
```typescript
WHERE commodityUuid = ? AND shop_id = ?  // ❌ не найдёт тот же товар в другом магазине
```
→ Используй `commodityName`.

### ❌ Конкатенировать строки в SQL
```typescript
db.prepare(`SELECT * FROM t WHERE name = '${name}'`) // ❌ SQL-инъекция
```
→ Используй `.bind(name)`.

### ❌ Менять структуру JSON в index_documents.transactions
— Это данные Эвотор, мы их только читаем.

### ❌ Добавлять колонки без миграции
→ Используй `addColumnIfMissing` в `db/migrations.ts`.

### ❌ Использовать `quantity: 1` как заглушку
→ Используй `getProductStockFromD1`. Если 0 — значит остатка реально нет.

---

## 8. ТЕСТИРОВАНИЕ

```bash
# Бэкенд-тесты (все эндпоинты)
cd packages/backend && npx tsx test-all-endpoints.ts

# Локальный запуск
pnpm dev

# Локальный cron-симулятор
pnpm dev:cron
```

---

## 9. ДЕПЛОЙ

### Репозитории

| Remote | Назначение |
|--------|-----------|
| `origin` → `demossml/evoAppAi` | Тестовый |
| `evoworknew` → `demossml/evoWorkNew` | **Продакшен** |

### Перед деплоем на продакшен

1. Убедись, что все миграции в `db/migrations.ts` актуальны
2. Проверь `syncStock` — он теперь реально обновляет `shopProduct.quantity`
3. Убедись, что `runMigrations` вызывается в `helpers.ts` (API) и `index.ts` (cron)
4. Проверь, что нет `quantity: 1` заглушек в новых отчётах
5. Коммит → `git push evoworknew main`

### Проверка после деплоя

```bash
# На сервере (Mac mini)
journalctl --user -u evo-app-new.service --since "5 min ago" | grep -i 'stock\|error\|migration'

# Проверить, что колонки существуют
# В D1: PRAGMA table_info(shopProduct);
```

---

## 10. ЧЕК-ЛИСТ ДЛЯ НОВОГО ОТЧЁТА

- [ ] Данные только из D1 (не из Evotor API)
- [ ] Матчинг товаров по `commodityName`
- [ ] Использованы существующие D1-методы из `evotor/utils.ts`
- [ ] Эндпоинт в `api.ts` с try/catch
- [ ] Входные параметры провалидированы (400 при отсутствии)
- [ ] Остатки через `getProductStockFromD1` (не `quantity: 1`)
- [ ] Документация в `/memories/repo/backend-methods.md`
- [ ] Тест-кейс в `test-all-endpoints.ts`
- [ ] Фронтенд: состояния loading/error/empty
- [ ] Кнопка «Фильтры» не зациклена (проверить авто-отправку)
