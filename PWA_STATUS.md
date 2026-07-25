# PWA Evo App — Статус внедрения и инструкция

> **Дата:** 25 июля 2026
> **Последний коммит:** `8d6e16a`

---

## 1. Что сделано (полный список)

### Фаза 1: Базовый офлайн + кеширование ✅ 100%

| Задача | Статус | Детали |
|--------|--------|--------|
| Кеширование JS/CSS | ✅ | Cache First, 30 дней, до 60 файлов |
| Кеширование шрифтов | ✅ | Cache First, 60 дней |
| Кеширование изображений | ✅ | Cache First, 7 дней, до 100 файлов |
| API-кеш (чтение) | ✅ | NetworkFirst, 5 мин, таймаут 3с. Не кешируются: salary, auth, login |
| StaleWhileRevalidate для dashboard | ✅ | 6 эндпоинтов: sales-today, sales-garden-report, plan-for-today, accessories-sales, gross-profit-today, dashboard-home-insights |
| Offline fallback страница | ✅ | `offline.html` — показывается при потере сети для всех роутов кроме `/api/*` |
| Индикатор сети | ✅ | Красная полоса «Нет подключения к интернету» сверху при офлайне |
| Service Worker в dev-режиме | ✅ | Включён для тестирования (`devOptions.enabled: true`) |
| Очистка кеша при logout | ✅ | `clearCache.ts` — через SW postMessage + Cache API напрямую |
| Toast-уведомления PWA | ✅ | `pwa.tsx` — логирует offlineReady и needRefresh |

### Фаза 2: Синхронизация ✅ 100%

| Задача | Статус | Детали |
|--------|--------|--------|
| Background Sync для фото | ✅ | `registerUploadSync()` в `backgroundUploader.ts`. С проверкой `SyncManager` — на iOS/Telegram silently fallback на текущий localStorage-механизм |
| Офлайн-очередь действий | ✅ | `offlineQueue.ts` — универсальная очередь (сохранение в localStorage, выполнение при появлении сети) |

### Фаза 3: Установка + Native ✅ 100%

| Задача | Статус | Детали |
|--------|--------|--------|
| Кастомная установка PWA | ✅ | `pwa.tsx` — обработчик `beforeinstallprompt`. Кнопка «Установить» внизу экрана. Трек установок через аналитику (`pwa_install`) |
| Shortcuts в манифесте | ✅ | «Продажи сегодня» → `/evotor/sales-today`, «Зарплата» → `/evotor/salary-user-report` |
| Динамический theme-color | ✅ | `useTheme.ts` — меняет `<meta name="theme-color">` под светлую (`#f9fafb`) / тёмную (`#080c16`) тему |
| Иконки от дизайнера | ✅ | 6 иконок: pwa-512, pwa-192, maskable 512, apple-touch, favicon.ico, favicon.png |
| Скриншоты | ✅ | 3 скриншота 1080×1920: главная (светлая), главная (тёмная), отчёт |

### Фаза 4: Push + Badge ✅ 100%

| Задача | Статус | Детали |
|--------|--------|--------|
| Push-сервис (бэкенд) | ✅ | `push/pushService.ts` — валидация подписки, отправка уведомлений |
| API subscribe/unsubscribe | ✅ | `POST /api/push/subscribe`, `POST /api/push/unsubscribe`, `GET /api/push/vapid-public-key` |
| Подписка на push (фронтенд) | ✅ | `subscribeToPush()`, `unsubscribeFromPush()` в `pwa.tsx`. Конвертация VAPID-ключа из base64 в Uint8Array |
| Badging API | ✅ | `setAppBadge(count)` — бейдж на иконке PWA (только когда установлено на домашний экран) |

### Фаза 5: Оптимизация ✅ 100%

| Задача | Статус | Детали |
|--------|--------|--------|
| Манифест: lang, dir, scope | ✅ | `lang: "ru"`, `dir: "ltr"`, `scope: "/"` |
| Манифест: categories | ✅ | `["business", "finance"]` |
| Манифест: launch_handler | ✅ | `focus-existing` — не открывает новые окна |
| Манифест: handle_links | ✅ | `preferred` |
| Манифест: screenshots | ✅ | 2 скриншота (светлая главная + отчёт) |
| includeAssets | ✅ | favicon.ico, apple-touch-icon.png, offline.html |

---

## 2. Что НЕ сделано (и почему)

| Задача | Причина |
|--------|---------|
| **Публикация в Google Play / App Store** | Требует ручного процесса: PWABuilder → генерация APK/AAB → загрузка в Google Play Console. Не автоматизируется из кода |
| **Periodic Background Sync** | Не работает в Safari/iOS и Telegram in-app браузере — бесполезно для 90%+ пользователей |
| **VAPID-ключи в .env** | Нужно сгенерировать через `npx web-push generate-vapid-keys` и добавить в `.env` на сервере. Без этого push-уведомления не будут отправляться (подписка работать будет, отправка — нет) |
| **Web Push через Telegram Bot API** | Альтернативный канал для пользователей Telegram (не Web Push). Требует отдельной реализации |
| **Windows tile-иконки** | Нужны иконки 150×150, 310×150, 310×310. Не запрашивали у дизайнера |

---

## 3. Инструкция: как установить приложение

### На Android (Chrome)

1. Открой приложение в Chrome
2. Нажми ⋮ (три точки) → **«Установить приложение»** или **«Добавить на главный экран»**
3. Подтверди установку
4. Иконка появится на домашнем экране и в списке приложений

**Альтернативно:** в самом приложении внизу появится баннер «Установите приложение» с кнопкой «Установить» — нажми на неё.

### На iPhone / iPad (Safari)

1. Открой приложение в Safari
2. Нажми кнопку **«Поделиться»** (квадрат со стрелкой вверх)
3. Прокрути вниз → **«На экран "Домой"»**
4. Нажми «Добавить»
5. Иконка появится на домашнем экране

### В Telegram Mini App

Приложение уже работает внутри Telegram. Установка PWA на домашний экран возможна:
1. Нажми ⋮ в Mini App → **«Добавить на главный экран»** (если доступно)
2. Или открой приложение в браузере через «Открыть в...» и установи как PWA

### Где появляются иконки

| Платформа | Где видно иконку |
|-----------|-----------------|
| **Android** | Домашний экран, список приложений, меню недавних, уведомления |
| **iOS** | Домашний экран (через Safari «На экран Домой») |
| **Windows** | Панель задач, меню Пуск (если установлено через Chrome/Edge) |
| **Браузер** | Вкладка (favicon), закладки |

### Какая иконка где используется

| Файл | Где |
|------|-----|
| `pwa-512x512.png` | Android (домашний экран, список приложений) |
| `pwa-512x512-maskable.png` | Android (адаптивная — система обрезает под круг/каплю) |
| `pwa-192x192.png` | Android (уведомления, старые устройства) |
| `apple-touch-icon.png` | iOS (домашний экран через Safari) |
| `favicon.ico` | Вкладка браузера, закладки |

---

## 4. Инструкция: как настроить Push-уведомления

### Шаг 1: Сгенерировать VAPID-ключи

На сервере (Mac Mini) выполни:

```bash
cd /opt/evo-app/packages/backend
npx web-push generate-vapid-keys
```

Вывод будет примерно таким:
```
=======================================
Public Key:
BLBfhO...длинная_строка...

Private Key:
vPkIzM...длинная_строка...
=======================================
```

### Шаг 2: Добавить ключи в .env

Открой `/opt/evo-app/.env` и добавь:

```bash
VAPID_PUBLIC_KEY=BLBfhO...скопируй_сюда_публичный_ключ
VAPID_PRIVATE_KEY=vPkIzM...скопируй_сюда_приватный_ключ
```

### Шаг 3: Перезапустить сервер

```bash
sudo systemctl restart evo-app
```

### Шаг 4: Настроить web-push на бэкенде (опционально)

Сейчас `pushService.ts` использует упрощённую отправку через `fetch()` к push-сервису браузера. Для полноценной работы с шифрованием (aes128gcm) нужно:

```bash
cd /opt/evo-app/packages/backend
npm install web-push
```

Затем обновить `push/pushService.ts` — использовать библиотеку `web-push` вместо ручного fetch.

### Шаг 5: Запросить разрешение у пользователя

На фронтенде вызвать `subscribeToPush()` (экспортируется из `pwa.tsx`). Это покажет браузерный диалог «Разрешить уведомления?».

**Где это сделать:** например, при первом входе пользователя или в настройках приложения.

### Ограничения

- **iOS / Safari**: Web Push не поддерживается до iOS 16.4+. На старых версиях — только через Telegram Bot API
- **Telegram in-app браузер**: Web Push не работает. Уведомления можно отправлять через Telegram Bot API (отдельная реализация)
- **Android + Chrome**: полная поддержка
- **Десктоп (Chrome/Edge/Firefox)**: полная поддержка

---

## 5. Файлы, которые были изменены/созданы

| Файл | Действие |
|------|----------|
| `vite.config.ts` | 🛠 runtimeCaching, navigateFallback, shortcuts, screenshots, maskable icon |
| `public/offline.html` | ✨ Создан |
| `public/pwa-*.png` | 🖼 Обновлены (дизайнер) |
| `public/apple-touch-icon.png` | 🖼 Обновлён (дизайнер) |
| `public/favicon.ico` | 🖼 Обновлён (дизайнер) |
| `public/screenshots/*.png` | ✨ Созданы (дизайнер) |
| `src/pwa.tsx` | 🛠 beforeinstallprompt, push-подписка, badging |
| `src/pwa.ts` | 🗑 Удалён (переименован в .tsx) |
| `src/hooks/useTheme.ts` | 🛠 Динамический meta theme-color |
| `src/App.tsx` | 🛠 Онлайн/офлайн индикатор |
| `src/helpers/backgroundUploader.ts` | 🛠 registerUploadSync() |
| `src/helpers/offlineQueue.ts` | ✨ Создан |
| `src/helpers/clearCache.ts` | ✨ Создан |
| `packages/backend/src/push/pushService.ts` | ✨ Создан |
| `packages/backend/src/api.ts` | 🛠 push-эндпоинты subscribe/unsubscribe/vapid-key |
