# 🔍 Полный аудит кода Evo App — 15.07.2026

## 📦 Текущее состояние production-бандла (фронтенд)

| Чанк | Размер | Проблема |
|------|--------|----------|
| `index-DyEXpEAG.js` | **369 KB** | Главный бандл — гигантский! |
| `index-BLy1ikVw.css` | **110 KB** | CSS без PurgeCSS-оптимизации |
| `BarChart-C5UmqXv9.js` | **383 KB** | Recharts — одна библиотека весит больше всего бандла |
| `html2canvas.esm-CBrSDip1.js` | **202 KB** | html2canvas — аналог html-to-image |
| `Home-DgoAC4i4.js` | **125 KB** | Домашняя страница |
| **Общий вес JS** | **~1.5 MB** | Для PWA/TWA это катастрофа |

---

## 🔴 КРИТИЧЕСКИЕ ПРОБЛЕМЫ

### 1. ДУБЛИРОВАНИЕ СТАТИСТИЧЕСКИХ ФУНКЦИЙ (БЭКЕНД)

**Файлы-близнецы:**
- `src/services/statistics.ts` (133 строки) — экспортирует `avg`, `stddev`, `linearRegression`, `median`, `mad`, `dayOfWeek`, `formatDateLocal`
- `src/services/sharedStats.ts` (80+ строк) — экспортирует **ТЕ ЖЕ САМЫЕ** `avg`, `stddev`, `linearRegression`, `median`, `mad` + дополнительно `parseHour`, `parseDate`, `classifyABC`, `classifyXYZ`

**Кто откуда импортирует:**
- `statistics.ts` → `sellerEffectiveness.ts`, `productEffectiveness.ts`, `storeEffectiveness.ts`
- `sharedStats.ts` → `sellerAdvancedStats.ts`, `orderForecastV2.ts`, `sellerHourlyCompare.ts`

**Исправление:** удалить `statistics.ts`, всё перевести на `sharedStats.ts`.

### 2. ДУБЛИРОВАНИЕ ДАТА-ФУНКЦИЙ (БЭКЕНД)

Одни и те же функции с разными именами в 3+ файлах:
- `utils.ts`: `formatDateTime()`, `formatDateWithTime()`, `getIsoTimestamp()`, `formatDate()`, `getTodayRangeEvotor()`
- `services/statistics.ts`: `formatDateLocal()`
- `evotor/utils.ts`: `formatDateWithTimeLocal()`
- **Внутри самого `utils.ts`**: строки 235, 311, 383 — **дубликаты `formatDateWithTime` и `formatDate` как локальные функции!**

### 3. НЕИСПОЛЬЗУЕМЫЕ NPM-ПАКЕТЫ (ФРОНТЕНД)

| Пакет | Статус | Экономия |
|-------|--------|----------|
| **`motion`** | ❌ **НИГДЕ не импортируется!** | ~30 KB |
| **`chart.js`** + **`react-chartjs-2`** | ❌ **НИГДЕ не используются!** | ~200 KB |
| **`html2canvas`** | ⚠️ Используется в 2 файлах, `html-to-image` в 5 | Дублирование функционала |
| **`xlsx`** | ⚠️ Только в 1 файле (`DownloadTableButton.tsx`) | ~500 KB |

**Итого мёртвых зависимостей: ~730 KB** — это можно удалить прямо сейчас.

### 4. ГИГАНТСКИЕ ФАЙЛЫ (НЕДЕЛИМЫЕ МОНОЛИТЫ)

**Фронтенд:**
- `DashboardSummary.tsx` — **1780 строк** (один компонент!)
- `SellerPerformance.tsx` — **1325 строк**
- `BottomNavigation.tsx` — **387 строк**

**Бэкенд:**
- `api.ts` — **3378 строк** (все роуты в одном файле!)
- `utils.ts` — **3294 строки** (свалка всего)
- `evotor/index.ts` — **2486 строк**

### 5. ПЛОХАЯ ТИПИЗАЦИЯ (ФРОНТЕНД)

- **`as any`** — **43 случая** в 26 файлах
- **`: any`** — **21 случай**
- Худший файл: `endpoints.ts` — **11 `as any`** (ручное редактирование сгенерированного кода)
- `useStoreEffectiveness.ts` — функция `enrichStore(raw: any, idx: number, all: any[])` — полностью нетипизированная

### 6. ОТСУТСТВИЕ MANUAL CHUNKS (VITE)

В `vite.config.ts` **нет `build.rollupOptions.manualChunks`** — Vite сам решает как делить. Результат:
- Recharts (383 KB) попадает в отдельный чанк, но загружается вместе со страницами, которые его используют
- `lucide-react` иконки дублируются в каждом чанке
- Нет выделенного vendor-чанка для React, react-router, framer-motion

---

## 🟡 СРЕДНИЕ ПРОБЛЕМЫ

### 7. ДВЕ БИБЛИОТЕКИ ДЛЯ СКРИНШОТОВ

- `html2canvas` (202 KB) + `html-to-image` — делают одно и то же
- `html2canvas` используется в `ReportShareButton` и `PlanStatusWidget`
- `html-to-image` используется в 5 файлах
- **Нужно оставить одну** (предпочтительно `html-to-image` — легче)

### 8. ТРИ ЧАРТ-БИБЛИОТЕКИ

До удаления `chart.js` / `react-chartjs-2` остаётся только `recharts`. Но сам recharts — 383 KB. Можно рассмотреть облегчённую замену (например, легковесный canvas-чарт для простых графиков).

### 9. ИКОНКИ LUCIDE-REACT ДУБЛИРУЮТСЯ

`BottomNavigation.tsx` импортирует **16 иконок** каждая отдельной строкой. Хотя tree-shaking работает, при отсутствии `manualChunks` иконки попадают в главный бандл, а не в отдельный чанк.

### 10. ИНДЕКСНЫЙ CSS БЕЗ PURGECSS

`index.css` — 110 KB в продакшене. Tailwind генерирует утилиты, но неиспользуемые классы не удаляются агрессивно. Плюс есть `tokens.css` как «совместимость» со старым кодом.

---

## 🟢 ПЛАН УСКОРЕНИЯ (мгновенная загрузка)

### Фаза 1: Быстрые победы (1–3 часа)

| № | Действие | Эффект |
|---|----------|--------|
| 1.1 | **Удалить `motion`** из package.json | −30 KB из бандла |
| 1.2 | **Удалить `chart.js` + `react-chartjs-2`** | −200 KB |
| 1.3 | **Удалить `html2canvas`**, оставить `html-to-image` | −202 KB |
| 1.4 | **Заменить `xlsx`** на легковесный CSV-экспорт (руками, без библиотек) | −500 KB |
| 1.5 | **Удалить `statistics.ts`**, всё на `sharedStats.ts` | Чистота кода |

**Итого экономия: ~932 KB JS!**

### Фаза 2: Оптимизация бандла (3–6 часов)

| № | Действие | Эффект |
|---|----------|--------|
| 2.1 | **`manualChunks` в vite.config.ts**: выделить `vendor` (react, react-dom, react-router), `framer` (framer-motion), `charts` (recharts), `icons` (lucide-react) | Параллельная загрузка, кэширование |
| 2.2 | **Динамический импорт `BottomNavigation`** в App.tsx — не нужно грузить 16 иконок для первой отрисовки | −50 KB из главного бандла |
| 2.3 | **PurgeCSS / safelist-аудит**: проверить что все классы в `index.css` действительно используются | −30-50 KB CSS |
| 2.4 | **Сжатие Brotli** на Caddy (уже есть Caddyfile?) | −60% размер передачи |

### Фаза 3: Оптимизация загрузки данных (4–8 часов)

| № | Действие | Эффект |
|---|----------|--------|
| 3.1 | **Предзагрузка критичных данных**: `useQuery` с `staleTime: 5min` + `placeholderData` из кэша | Мгновенный показ, без спиннера |
| 3.2 | **React Query `prefetchQuery`** на `mouseenter` ссылок в `BottomNavigation` | Данные готовы до перехода |
| 3.3 | **Перенести `fetchDataMode` из App в lazy-компонент** | Не блокирует первый рендер |
| 3.4 | **Убрать `startBackgroundUpload` из App**, вынести в Web Worker или ленивую инициализацию | Не блокирует главный поток |

### Фаза 4: Архитектурные улучшения (1–2 дня)

| № | Действие | Эффект |
|---|----------|--------|
| 4.1 | **Разбить `api.ts` (3378 строк)** на роутеры: `routes/sellers.ts`, `routes/products.ts`, `routes/shops.ts` | Обслуживаемость |
| 4.2 | **Разбить `utils.ts` (3294 строки)** на модули: `date.utils.ts`, `plan.utils.ts`, `format.utils.ts` | Обслуживаемость |
| 4.3 | **Разбить `DashboardSummary.tsx` (1780 строк)** на отдельные виджеты | Переиспользование, читаемость |
| 4.4 | **Унифицировать типы** ProductMetrics/SellerMetrics/StoreMetrics между бэкендом и фронтендом через общий пакет `@evo-app/shared` | Типобезопасность, нет `as any` |
| 4.5 | **Добавить `eslint` правило `no-explicit-any`** с warning | Постепенное исправление 43+ cases |

### Фаза 5: Продвинутые техники (2–3 дня)

| № | Действие | Эффект |
|---|----------|--------|
| 5.1 | **Service Worker с Workbox `Precaching`**: предзагрузка всех JS/CSS чанков после первого посещения | Мгновенный офлайн-доступ |
| 5.2 | **HTTP/2 Server Push** на Caddy для критичных чанков | На 1 RTT быстрее |
| 5.3 | **`react` в `peerDependencies`** + CDN (esm.sh) — вынести React из бандла | −120 KB из своего бандла |
| 5.4 | **Оптимизация Recharts**: замена на легковесный `uPlot` или `lightweight-charts` для линейных графиков | −300 KB |

---

## 📊 ОЖИДАЕМЫЙ РЕЗУЛЬТАТ

| Метрика | Сейчас | После Фазы 1–2 | После всех фаз |
|---------|--------|----------------|----------------|
| Главный бандл JS | 369 KB | **~100 KB** | **~50 KB** |
| Общий вес JS | ~1.5 MB | **~500 KB** | **~250 KB** |
| CSS | 110 KB | **~60 KB** | **~30 KB** |
| Время первой загрузки (3G) | ~8-12 сек | **~2-3 сек** | **<1 сек** |
| Время повторной загрузки | ~3-5 сек | **~1 сек** | **мгновенно (SW)** |

---

## 🎯 РЕКОМЕНДУЕМЫЙ ПОРЯДОК ВЫПОЛНЕНИЯ

1. **Прямо сейчас** (макс. эффект / мин. усилия):
   - Удалить `motion`, `chart.js`, `react-chartjs-2`, `html2canvas` из зависимостей
   - Заменить `xlsx` на ручной CSV
   - Удалить `statistics.ts`, смержить в `sharedStats.ts`

2. **Сегодня-завтра**:
   - `manualChunks` в vite.config.ts
   - Ленивая загрузка `BottomNavigation`
   - Prefetch на `mouseenter`

3. **На этой неделе**:
   - Разбить `api.ts`, `utils.ts`, `DashboardSummary.tsx`
   - Унифицировать типы, включить `no-explicit-any`
   - Service Worker precaching
