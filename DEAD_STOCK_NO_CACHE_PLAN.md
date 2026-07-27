# Dead Stock — План удаления кэша и перехода на реальные данные

**Дата:** 2026-07-27  
**Статус:** План, код не написан  
**Задача:** Убрать всю зависимость от `dead_stock_cache`, работать только с реальными таблицами

---

## 1. Мотивация

Кэш `dead_stock_cache` — это снимок данных на момент последнего обновления (cron раз в сутки). Для отчёта по мёртвым остаткам критически важна актуальность:
- Остатки меняются в течение дня (продажи, приёмка)
- Отчёт должен показывать реальную картину на текущий момент
- Задержка до 24 часов неприемлема для операционных решений

**Решение:** Полный отказ от `dead_stock_cache`. Все данные — из реальных таблиц.

---

## 2. Затрагиваемые эндпоинты

### 2.1 GET /api/analytics/dead-stock

**Сейчас:** читает `dead_stock_cache` → фильтрует по `daysWithoutSales`.

**Будет:**
1. Загружает все товары из `shopProduct` (product_group=0)
2. Для каждого товара ищет последнюю дату продажи в `index_documents` (JSON-поиск)
3. Считает `daysWithoutSales = today − lastSaleDate`
4. Фильтрует по `daysWithoutSales >= threshold`
5. Получает остатки из `shopProduct.quantity`
6. Получает себестоимость из `product_cost_prices` (по имени товара)
7. Группирует по категориям через `parentUuid`
8. Считает `totalFrozenCost = quantity × unitCost`

**Ответ:** тот же формат (`items`, `total`, `totalFrozenCost`, `categories`, `threshold`)

### 2.2 POST /api/dead-stocks/data

**Сейчас:** использует кэш как основной источник; fallback — сканирование `index_documents`.

**Будет:**
1. Загружает товары из `shopProduct` (с фильтром по `shopIds`, `groups`)
2. Сканирует `index_documents` за ВСЮ историю для нахождения `lastSaleDate`
3. Фильтрует: только товары с `quantity > 0`
4. Считает `daysWithoutSales`, `totalFrozenCost`, категории
5. Сортирует по `daysWithoutSales DESC`

**Ответ:** `salesData`, `shopName`, `startDate`, `endDate`, `totalFrozenCost`, `categories`

---

## 3. План изменений по файлам

### 3.1 `packages/backend/src/api.ts`

#### GET /api/analytics/dead-stock (строка ~3303)

**Удалить:**
- `await createDeadStockCacheTable(db)`
- `const rows = await getDeadStockCache(db, daysWithoutSales, shopId, since, until)`
- Всю логику чтения из кэша

**Добавить:**
- Запрос `shopProduct` с `quantity > 0` и `product_group = 0`
- Запрос `product_cost_prices` для себестоимости
- Сканирование `index_documents` для `lastSaleDate`
- Вычисление `daysWithoutSales`, `totalFrozenCost`
- Группировка по категориям
- `dataCompleteness` (сколько магазинов прислали отчёт)

#### POST /api/dead-stocks/data (строка ~2253)

**Удалить:**
- `await createDeadStockCacheTable(db)`
- Чтение `dead_stock_cache`
- Ветку `if (hasCache)`

**Добавить:**
- Сканирование `index_documents` за ВСЮ историю (или минимум 365 дней)
- Период `startDate`/`endDate` — влияет на фильтр «продан / не продан в периоде»
- `lastSaleDate` — из полного скана, а не за период
- Оптимизация: сначала собрать Set проданных UUID за период, потом для непроданных — найти lastSaleDate

#### GET /api/analytics/dead-stock/analyze (строка ~3364)

**Сейчас:** читает кэш (`dead_stock_cache`) для базовой информации о товаре.

**Будет:** запрашивать данные из реальных таблиц (`shopProduct` + поиск lastSale в `index_documents`).

#### POST /api/analytics/dead-stock/actions (строка ~3189)

**Сейчас:** читает кэш для имён товаров и себестоимости (`SELECT name, shopName, unitCost FROM dead_stock_cache`).

**Будет:** запрашивать из `shopProduct` + `product_cost_prices`.

### 3.2 `packages/backend/src/sync/cron.ts`

**`refreshDeadStockTask`** — удалить функцию.
**`syncStock`** — оставить (синхронизация quantity в shopProduct).

### 3.3 `packages/backend/src/sync/db.ts`

**Удалить:**
- `DeadStockCacheRow` interface
- `createDeadStockCacheTable()`
- `refreshDeadStockCache()`
- `getDeadStockCache()`

### 3.4 `packages/backend/server.ts`

**Удалить:**
- Импорт `refreshDeadStockTask`
- Cron-задачу `deadStockCache`

**Оставить:**
- `syncStock` (каждые 30 минут)

### 3.5 `packages/backend/src/db/migrations.ts`

**Удалить:** миграцию `dead_stock_cache` (CREATE TABLE IF NOT EXISTS).

### 3.6 `packages/frontend/src/hooks/useDeadStock.ts`

**Проверить:** хук должен работать с новым форматом ответа (без изменений API-контракта).

---

## 4. Оптимизация производительности

Без кэша сканирование всех `index_documents` может быть медленным.
Предложения:

### 4.1 Единый проход по документам
Вместо «для каждого товара → найти последнюю продажу»:
- Один запрос: `SELECT transactions, close_date FROM index_documents WHERE shop_id = ? AND type IN ('SELL','PAYBACK')`
- За один проход собираем `lastSaleDate` для всех товаров магазина
- Аналогично тому, как это делает `refreshDeadStockCache`, но БЕЗ сохранения в кэш

### 4.2 Ограничение глубины сканирования
- Параметр `maxHistoryDays = 365` (по умолчанию)
- Если товар не продавался 365+ дней → `daysWithoutSales = 999`

### 4.3 Индекс для ускорения
```sql
CREATE INDEX IF NOT EXISTS idx_id_shop_type_date ON index_documents (shop_id, type, close_date);
```

### 4.4 Пагинация (опционально)
- `GET /api/analytics/dead-stock?limit=100&offset=0`
- Для больших магазинов (> 1000 товаров)

---

## 5. Чеклист удаления кэша

- [ ] GET /api/analytics/dead-stock — переписан без кэша
- [ ] POST /api/dead-stocks/data — переписан без кэша
- [ ] GET /api/analytics/dead-stock/analyze — переписан без кэша
- [ ] POST /api/analytics/dead-stock/actions — переписан без кэша
- [ ] `refreshDeadStockTask` — удалена
- [ ] `createDeadStockCacheTable` — удалена
- [ ] `refreshDeadStockCache` — удалена
- [ ] `getDeadStockCache` — удалена
- [ ] `DeadStockCacheRow` interface — удалён
- [ ] `dead_stock_cache` CREATE TABLE в миграциях — удалён
- [ ] Импорт `refreshDeadStockTask` в server.ts — удалён
- [ ] Cron `deadStockCache` в server.ts — удалён
- [ ] `dead_stock_cache` таблица в D1 — дропнута
- [ ] Тесты `test_dead_stock.py` — обновлены (убраны тесты кэша)
- [ ] Проверка: POST возвращает только товары с реальным stock > 0
- [ ] Проверка: GET возвращает данные без кэша
- [ ] Проверка: время ответа в пределах 5-15 секунд

---

## 6. Ожидаемый результат

| Показатель | С кэшем | Без кэша |
|------------|---------|----------|
| Актуальность остатков | ±24 часа | **в реальном времени** |
| Актуальность lastSaleDate | ±24 часа | **в реальном времени** |
| Время ответа GET | < 1 сек | 3-10 сек |
| Время ответа POST | < 1 сек | 5-15 сек |
| Зависимость от cron | Есть | **Нет** |
| Сложность поддержки | Кэш + реальные данные | **Только реальные данные** |

---

## 7. НЕ трогаем

- `syncStock` — остаётся, обновляет `shopProduct.quantity` каждые 30 мин
- Фронтенд (`DeadStock.tsx`, `useDeadStock.ts`) — API-контракт не меняется
- `product_cost_prices` — остаётся как источник себестоимости
- `index_documents` — остаётся как источник продаж

---

## 8. Сохранение результата отчёта как HTML-страницы

### 8.1 Постановка

На странице Dead Stock (`/evotor/dead-stock`) нужна кнопка **«Сохранить отчёт»** /
**«Поделиться»**, которая:

- Генерирует **полную HTML-страницу** с результатами отчёта
- Сохраняет её на сервере (R2 / локальный диск)
- Возвращает **временную ссылку**, по которой страница доступна
- Страница **read-only**: данные, скролл, все стили/цвета — но без кнопок,
  фильтров, интерактивных элементов

### 8.2 Требования к HTML-странице

| Требование | Описание |
|------------|----------|
| **Полноценный HTML** | Не скриншот, не PDF. Валидный HTML5 с инлайн-CSS |
| **Все стили** | Цвета, шрифты, отступы, тёмная/светлая тема — как на экране |
| **Скролл** | Страница может быть длинной, скролл работает |
| **Read-only** | Нет кнопок «Фильтр», «Действия», «Настройки». Только данные |
| **Временная ссылка** | Уникальный URL, действует N дней (по умолчанию 30) |
| **Шаринг** | Ссылку можно отправить в Telegram, открыть в браузере |
| **Автономность** | Открывается без бэкенда (все данные в HTML) |

### 8.3 Реализация

#### Backend: POST /api/dead-stocks/save-report

**Запрос:**
```json
{
  "since": "2026-06-27",
  "until": "2026-07-27",
  "shopIds": null,
  "groups": [],
  "daysWithoutSales": 14,
  "title": "Мёртвые остатки на 27.07.2026"
}
```

**Ответ:**
```json
{
  "url": "http://localhost:3000/reports/dead-stock/a1b2c3d4.html",
  "expiresAt": "2026-08-27",
  "size": 245000
}
```

**Логика:**
1. Получает данные отчёта через те же функции, что и `GET /api/analytics/dead-stock`
2. Рендерит HTML-страницу с инлайн-CSS (серверный рендеринг)
3. Сохраняет в R2 (`reports/dead-stock/{id}.html`) или локально в `data/storage/reports/`
4. Возвращает URL + дату истечения
5. Автоочистка: cron удаляет файлы старше 30 дней

#### HTML-шаблон

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Мёртвые остатки — {date}</title>
  <style>
    /* Инлайн-CSS: копия стилей из production */
    :root { --bg: #fff; --fg: #111; --card: #f9f9f9; --border: #e5e5e5; ... }
    @media (prefers-color-scheme: dark) { :root { ... } }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    .dead-stock-table { width: 100%; border-collapse: collapse; }
    /* ... все стили для отчёта ... */
  </style>
</head>
<body>
  <header>
    <h1>Мёртвые остатки</h1>
    <p>Период: {since} – {until} · Без продаж ≥ {threshold} дн.</p>
    <p>Товаров: {total} · Заморожено: {totalFrozenCost} ₽</p>
    <p>Сгенерировано: {generatedAt}</p>
  </header>
  <main>
    <!-- Таблица товаров -->
    <!-- Группировка по категориям -->
    <!-- Итоги -->
  </main>
  <footer>
    <p>Evo App · Ссылка действительна до {expiresAt}</p>
  </footer>
</body>
</html>
```

#### Frontend: кнопка «Сохранить отчёт»

- Место: тулбар страницы `/evotor/dead-stock`, рядом с фильтрами
- Иконка: `Share2` или `Download`
- Поведение:
  1. Нажатие → POST `/api/dead-stocks/save-report` с текущими параметрами фильтра
  2. Успех → показать ссылку + кнопка «Скопировать» / «Открыть»
  3. Ошибка → toast с ошибкой

### 8.4 Файлы

| Файл | Что |
|------|-----|
| `packages/backend/src/api.ts` | Новый эндпоинт `POST /api/dead-stocks/save-report` |
| `packages/backend/src/services/reportHtml.ts` | Генератор HTML (шаблон + данные) |
| `packages/backend/src/sync/cron.ts` | Cron-задача очистки старых отчётов |
| `packages/frontend/src/pages/deadstock/DeadStock.tsx` | Кнопка «Сохранить отчёт» |
| `packages/frontend/src/widgets/deadstock/ui/SaveReportButton.tsx` | Компонент кнопки |

### 8.5 Чеклист

- [ ] Backend: `POST /api/dead-stocks/save-report`
- [ ] Backend: генератор HTML с инлайн-CSS
- [ ] Backend: сохранение в R2 / локальный диск
- [ ] Backend: cron очистки отчётов старше 30 дней
- [ ] Backend: `GET /reports/dead-stock/:id.html` — отдача статики
- [ ] Frontend: кнопка «Сохранить отчёт»
- [ ] Frontend: модалка с ссылкой + копирование
- [ ] Тест: генерация, открытие ссылки, скролл, цвета, отсутствие кнопок

---

## 9. Общий чеклист (кэш + сохранение)

- [ ] Удалить `dead_stock_cache` из всех эндпоинтов
- [ ] Удалить `refreshDeadStockTask`, `createDeadStockCacheTable`, `refreshDeadStockCache`, `getDeadStockCache`
- [ ] Удалить `DeadStockCacheRow` interface
- [ ] Удалить миграцию `dead_stock_cache`
- [ ] Удалить cron `deadStockCache` из server.ts
- [ ] Переписать 4 эндпоинта на прямые запросы
- [ ] `syncStock` оставить
- [ ] Добавить `POST /api/dead-stocks/save-report`
- [ ] Добавить HTML-генератор
- [ ] Добавить cron очистки старых HTML-отчётов
- [ ] Добавить кнопку «Сохранить отчёт» на фронте
- [ ] Обновить тесты `test_dead_stock.py`
- [ ] Проверить: время ответа, актуальность данных, ссылка работает
