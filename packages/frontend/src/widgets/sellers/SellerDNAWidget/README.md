# SellerDNA Widget — Документация

## Обзор

SellerDNA — система анализа эффективности продавцов вейп-шопов. Рассчитывает интегральный DNA-профиль (Score 0–100), распределяет продавцов по ролям (Охотник, Стабильный, Одиночка, Восходящий, Проблемный) и предоставляет AI-инсайты.

## Метрики

### Основные

| Метрика | Описание | Расчёт |
|---------|----------|--------|
| `overallScore` | Интегральный DNA-балл (0–100) | Взвешенная сумма: эффективность + стабильность + рост + аксессуары - dead time |
| `totalRevenue` | Общая выручка за период | Сумма `PAYMENT` транзакций |
| `avgCheck` | Средний чек | `totalRevenue / checks` |
| `rubPerHour` | Выручка в час | `totalRevenue / shiftHours` |
| `accShare` | Доля аксессуаров в выручке | `accRevenue / totalRevenue × 100` |
| `trend` | Тренд выручки | Линейная регрессия дневной выручки: `slope × 7 / mean × 100`. >5% = up, < -5% = down |
| `trendSlope` | % изменения в неделю | Нормализованный slope регрессии |

### Пиковые часы

| Метрика | Описание |
|---------|----------|
| `peakHours` | 2 часа с максимальной выручкой (15-мин слоты) |
| `peakHourK` | Отношение выручки пикового часа к среднему часу продавца |
| `peakHourEfficiency` | Эффективность в пик: `peakRevenue / storeAvgRevenueAtPeakHour` (0–1) |

### Мёртвое время

| Метрика | Описание |
|---------|----------|
| `deadTimePct` | % времени смены без единого чека |
| `deadTimeSlots` | Слитые смежные dead-блоки с `from`/`to`/`minutes` |

### Стабильность

| Метрика | Описание |
|---------|----------|
| `revenueCV` | Коэффициент вариации дневной выручки (%) |
| `checkCV` | Коэффициент вариации дневных чеков (%) |
| `attendanceRate` | Доля отработанных дней от календарных (%) |
| `lateOpenRate` | % дней с опозданием на открытие (>15 мин после 10:00) |

### DNA-роли

| Роль | Условие |
|------|---------|
| **Охотник** | Score ≥ 80, тренд вверх |
| **Стабильный** | Score ≥ 60, тренд не вниз |
| **Одиночка** | Средний чек > 1800₽, аксессуары > 25% |
| **Восходящий** | Тренд вверх, Score ≥ 55 |
| **Проблемный** | Всё остальное |

## Как работает AI

### Два конвейера

1. **`/api/employees/seller-insights`** — массовый анализ (zod-схема `sellerAnalysisOutput`):
   - Все продавцы за период → промпт DeepSeek → `{ sellers: SellerInsight[], generalObservations }`
   - Использует `analyzeSellerPerformanceTask` из `ai/index.ts`

2. **`/api/sellers/insights`** — точечный анализ одного продавца:
   - `computeSellerAdvancedStats` → `generateSellerInsights` → DeepSeek или rule-based fallback
   - Возвращает `{ insights: string[] }` (3–5 пунктов)

### Fallback (rule-based)

Если `DEEPSEEK_API_KEY` отсутствует или запрос к DeepSeek падает:
- Form-а: DNA-профиль + сильные стороны + зоны роста + рекомендации
- До 5 инсайтов, каждый с конкретными цифрами

## Кэширование

### 1. In-memory (API)

```ts
const statsCache = new Map<string, { data: any; expiresAt: number }>();
// TTL: 300 сек (5 мин)
// Ключ: advanced-stats:${since}:${until}:${shopId}
```

### 2. Persisted (D1)

Таблица `seller_daily_metrics` — ночная агрегация (cron `0 4 * * *`).

```
computeSellerAdvancedStats()
  ├─ [CACHE HIT] → getSellerDailyMetrics() → buildFromCache()
  │   └─ 83% быстрее: нет парсинга transaction JSON
  └─ [CACHE MISS] → fetchDocs() → parseCheck() → buildFromLive()
```

## Cron-расписание

| Слот (UTC) | MSK | Задача |
|-----------|------|--------|
| `*/3 * * * *` | Каждые 3 мин | Синхронизация SELL-документов |
| `*/25 * * * *` | Каждые 25 мин | Обновление продуктов |
| `*/30 * * * *` | Каждые 30 мин | Синхронизация остатков |
| `0 3 * * *` | 06:00 | План-факт, обновление плана, алерт: критические продавцы |
| `0 4 * * *` | 07:00 | Агрегация `seller_daily_metrics` |
| `0 5 * * *` | 08:00 | Алерт: отставание от плана >20%, Топ-3 продавцов |

## Telegram-уведомления

| Тип | Триггер | Сообщение |
|-----|---------|-----------|
| Критические | Segment = "critical" (14 дней) | Имя, магазин, план%, тренд |
| Отставание от плана | `planCompletion < 80%` (7 дней) | Имя, магазин, выручка vs план, отставание в ₽ |
| Топ-3 дня | Ежедневно 08:00 MSK | 🥇🥈🥉 + выручка + средний чек |

## API

| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| GET | `/api/sellers/advanced-stats` | Admin | DNA-профили всех продавцов |
| GET | `/api/sellers/insights` | Admin | AI-инсайты по одному продавцу |
| GET | `/api/employees/seller-effectiveness` | Auth | Эффективность продавцов |
| GET | `/api/employees/seller-insights` | Auth | Массовый AI-анализ |

## Фронтенд — компоненты

```
SellerDNAWidget/
├── index.tsx                # Три вкладки: Рейтинг, Сравнение, Детали
├── SellerList.tsx           # Карточки с RankBadge (🥇🥈🥉)
├── SellerDetailView.tsx     # Детальный профиль с графиками
├── SellerComparisonView.tsx # Сравнение 2-4 продавцов
└── types.ts                 # Все типы (SellerDNAProfile, DNALabel, ...)
```

## Как тестировать

### Backend — unit

```bash
cd packages/backend
npx vitest run src/services/sellerAdvancedStats.test.ts
```

**Тест-кейсы для `parseCheck`:**
1. Пустой массив транзакций → все поля 0
2. `PAYMENT` 1000₽ → revenue = 1000
3. `REGISTER_POSITION` с commodityUuid=vape → accRevenue=0, vapeRevenue=amount
4. `REGISTER_POSITION` с commodityUuid=accessory → accRevenue=amount
5. `REGISTER_POSITION` с discount=100 → hasDiscount=true, discountAmount=100
6. `REFUND` 500₽ → revenue -= 500
7. Некорректный JSON → не падает, возвращает 0

**Тест-кейсы для `computeDeadTime`:**
1. Все часы с чеками → deadTimePct=0
2. Половина часов пустая → deadTimePct≈50%
3. Нет OPEN_SESSION → shiftHours=8 (default)
4. Одна OPEN_SESSION → shiftMinutes от open до close

**Тест-кейсы для `computeSellerAdvancedStats`:**
1. Пустой период → `{ sellers: [] }`
2. Один продавец, один день, один чек → корректный профиль
3. Cache path (seller_daily_metrics) → тот же результат что live path
4. Множество продавцов → сортировка по Score, rank 1..N

**Тест-кейсы для `generateSellerInsights`:**
1. `apiKey = undefined` → rule-based fallback (есть инсайты)
2. `apiKey` валидный + мок DeepSeek → парсинг JSON ответа
3. `apiKey` валидный + DeepSeek возвращает не-JSON → line-based extraction

### Backend — интеграционные

```bash
# Запустить локально
cd packages/backend
npx wrangler dev

# Проверить маршруты (замени токен)
curl -H "initData: guest" \
  "http://localhost:8787/api/sellers/advanced-stats?since=2024-01-01&until=2024-01-31"

curl -H "initData: guest" \
  "http://localhost:8787/api/sellers/insights?sellerId=<UUID>&since=2024-01-01&until=2024-01-31"
```

### Frontend — unit

```bash
cd packages/frontend
npx vitest run src/widgets/sellers/SellerDNAWidget/__tests__/
```

**Тест-кейсы для `SellerList`:**
1. Пустой массив → нет карточек, нет ошибок
2. 3 продавца → 3 карточки, правильные RankBadge
3. `onSellerSelect` → вызывается с правильным seller при клике
4. Сортировка по Score desc → правильный порядок
5. Сортировка по имени asc → алфавитный порядок

**Тест-кейсы для `RankBadge`:**
1. rank=1 → 🥇
2. rank=2 → 🥈
3. rank=3 → 🥉
4. rank=5 → круг с `#5`

**Тест-кейсы для `SellerDetailView`:**
1. `seller = null` → заглушка "Выберите продавца"
2. Валидный профиль → все метрики отображаются
3. `insights = []` → нет секции инсайтов
4. `insights` непустой → список инсайтов
5. Скруглённый score-ринг → анимируется к значению

### Frontend — e2e (Playwright/Cypress)

1. **Загрузка виджета**: открыть страницу → виден заголовок "Seller DNA"
2. **Переключение вкладок**: клик "Сравнение" → видна таблица сравнения
3. **Выбор продавца**: клик на карточку → переход на вкладку "Детали"
4. **Бейджи топ-3**: первый продавец имеет 🥇
5. **Фильтр дат**: изменить дату → перезагрузка данных

## Архитектурные решения

### Почему два AI-конвейера?

- `/api/employees/seller-insights` (старый) — работает с `computeSellerEffectiveness`, использует сложную zod-схему. Оптимизирован для массового анализа.
- `/api/sellers/insights` (новый) — работает с `computeSellerAdvancedStats`, использует простой `deepseekChat`, fallback rule-based. Оптимизирован для быстрого точечного анализа.

Рекомендуется консолидировать в будущем.

### Почему cache path всё ещё ходит в D1?

Кэш `seller_daily_metrics` сохраняет дневные агрегаты, но не почасовые. Для графиков "Выручка по часам" нужна почасовая разбивка — она получается лёгким запросом `SELECT close_date` (без JSON). Полный отказ от D1 round-trips потребовал бы переноса почасовой статистики в кэш (что утроило бы его размер).

## Известные ограничения

1. **Dead time slots** строятся по первому дню сессии (не агрегируются по всем дням). `deadTimePct` корректен для всех дней.
2. **storeAvgHourly** на cache path оценивается пропорционально чекам (не точная выручка), т.к. кэш не хранит почасовую выручку.
3. **In-memory кэш** (300s TTL) теряется при рестарте воркера. Для multi-worker рекомендуется KV.
4. **`accShare`** может быть 0, если таблица `accessories` не заполнена.
