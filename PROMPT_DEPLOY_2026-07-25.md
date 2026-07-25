# Промпт для AI-агента на Mac Mini — деплой обновлений (25.07.2026)

Скопируй блок ниже и отправь агенту на Mac Mini.

---

## Задача

Закатить обновления кода из GitHub на продакшн-сервер. Обновления крупные:
добавлена система настроек (app_settings), push-уведомления с AI-агентом,
Web Push через VAPID, новый frontend (SettingsNew), переработаны пороги
в RevenueWidget.

**КРИТИЧЕСКИ ВАЖНО: все существующие данные в базе данных должны сохраниться.**
Миграции только добавляют новые таблицы и колонки — ничего не удаляют.

---

## 1. Подготовка: залить изменения на GitHub (делаю Я, не агент)

Я запушил все изменения в `origin/main` (demossml/evoAppAi). Агент должен
сделать `git pull`.

---

## 2. Инструкция для агента на Mac Mini

Выполнять строго по порядку. Если любой шаг упадёт — остановиться и
прислать мне полную ошибку.

### Шаг 1. Перейти в директорию проекта и обновить код

```bash
cd /opt/evo-app
git fetch origin main
git reset --hard origin/main
git log --oneline -5
```

### Шаг 2. Установить новые зависимости

Появился новый пакет `web-push` для push-уведомлений.

```bash
cd /opt/evo-app
pnpm install --frozen-lockfile
```

Если `pnpm install --frozen-lockfile` упадёт (из-за новых пакетов не в lockfile),
выполни:

```bash
pnpm install --no-frozen-lockfile
```

### Шаг 3. Запустить миграции базы данных

**НИ В КОЕМ СЛУЧАЕ НЕ УДАЛЯТЬ И НЕ ПЕРЕСОЗДАВАТЬ ФАЙЛ БАЗЫ ДАННЫХ.**
База лежит в `/opt/evo-app/data/local.db`. Все миграции идемпотентны —
можно запускать многократно без вреда.

Способ A — через сервер (рекомендуемый):
Просто перезапусти сервис на шаге 5 — миграции выполнятся автоматически
при старте (добавлен вызов `runMigrations` в `server.ts`).

Способ B — вручную (если нужно проверить миграции до перезапуска):
```bash
cd /opt/evo-app/packages/backend
npx tsx scripts/run-migrations.ts
```

Ожидаемый вывод:
```
[migrate] Запуск миграций...
[migrate] Таблицы в БД (N):
  app_settings: 16 записей
  push_subscriptions: 0 записей
  push_log: 0 записей
  ... (старые таблицы остались нетронутыми)
[migrate] ✅ Миграции завершены успешно.
```

Проверь, что старые данные на месте (количество магазинов, товаров, продаж
не изменилось):
```bash
sqlite3 /opt/evo-app/data/local.db "SELECT COUNT(*) FROM shops;"
sqlite3 /opt/evo-app/data/local.db "SELECT COUNT(*) FROM shopProduct;"
sqlite3 /opt/evo-app/data/local.db "SELECT COUNT(*) FROM productSold;"
```

### Шаг 4. Пересобрать фронтенд

```bash
cd /opt/evo-app/packages/frontend
pnpm build
```

Проверить, что сборка прошла успешно:
```bash
ls -la /opt/evo-app/packages/frontend/dist/index.html
# Должен показать файл index.html
```

Проверить, что Caddy видит новую сборку:
```bash
ls -la /opt/evo-app/packages/frontend/dist/assets/
# Должны быть .js и .css файлы
```

### Шаг 5. Перезапустить сервис

```bash
sudo systemctl restart evo-app
sleep 5
sudo systemctl status evo-app --no-pager | head -15
```

Убедись, что статус `active (running)`.

### Шаг 6. Проверить работоспособность

```bash
# Healthcheck
curl -s http://localhost:3000/health

# Настройки (новый эндпоинт)
curl -s http://localhost:3000/api/settings | head -c 200

# Push-статус (новый эндпоинт)
curl -s http://localhost:3000/api/push/status

# Старые эндпоинты на месте
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/api/evotor/sales-today
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/api/shops
```

Ожидаемые результаты:
- `/health` → `{"status":"ok"}`
- `/api/settings` → JSON-массив из 16 настроек
- `/api/push/status` → `{"subscriptions":0,"vapidConfigured":false,...}`
- `/api/evotor/sales-today` → HTTP 200
- `/api/shops` → HTTP 200

### Шаг 7. Проверить Caddy и HTTPS

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://localhost/health
# или через домен:
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://$DOMAIN/health
```

### Шаг 8. Проверить логи на ошибки

```bash
sudo journalctl -u evo-app --no-pager -n 30 | grep -i "error\|fail\|panic\|fatal"
sudo tail -30 /var/log/evo-app/error.log
```

Если есть ошибки — прислать мне. Если чисто — деплой завершён.

---

## 3. Быстрая проверка (одна команда)

После деплоя выполни эту команду и пришли мне вывод:

```bash
echo "=== Git ===" && cd /opt/evo-app && git log --oneline -3 && \
echo "=== Service ===" && sudo systemctl status evo-app --no-pager | head -5 && \
echo "=== Health ===" && curl -s http://localhost:3000/health && echo "" && \
echo "=== Settings ===" && curl -s http://localhost:3000/api/settings | python3 -m json.tool | head -20 && \
echo "=== Push Status ===" && curl -s http://localhost:3000/api/push/status && echo "" && \
echo "=== DB Check ===" && sqlite3 /opt/evo-app/data/local.db "SELECT 'shops:', COUNT(*) FROM shops; SELECT 'products:', COUNT(*) FROM shopProduct; SELECT 'settings:', COUNT(*) FROM app_settings; SELECT 'push_subs:', COUNT(*) FROM push_subscriptions;" && \
echo "=== Recent Errors ===" && sudo journalctl -u evo-app --no-pager -n 10 | grep -i "error\|fail" || echo "(no errors)"
```

---

## 4. Откат (если что-то пошло не так)

Если после деплоя сервис не запускается или падает с ошибкой:

```bash
# Откатить код на предыдущий коммит
cd /opt/evo-app
git reset --hard HEAD~1

# Пересобрать фронтенд старой версии
cd /opt/evo-app/packages/frontend
pnpm build

# Перезапустить
sudo systemctl restart evo-app
```

База данных не пострадает — миграции идемпотентны, старые данные
всегда сохраняются.

---

## 5. Примечания

- **VAPID-ключи**: Для push-уведомлений нужны ключи. Если в `.env` нет
  `VAPID_PUBLIC_KEY` и `VAPID_PRIVATE_KEY` — сгенерируй:
  ```bash
  cd /opt/evo-app/packages/backend
  npx web-push generate-vapid-keys
  ```
  И добавь их в `/opt/evo-app/.env`. После этого перезапусти сервис.

- **Новые таблицы в БД**:
  - `app_settings` — 16 настроек (пороги, бонусы, задержки)
  - `push_subscriptions` — Web Push подписки браузеров
  - `push_log` — логи решений AI-агента

- **Новый frontend-маршрут**: `/evotor/settings-new` — страница настроек
  в стиле dashboard-плиток. Доступна по адресу `https://$DOMAIN/evotor/settings-new`.

- **Push-уведомления**: работают только при настроенных VAPID-ключах.
  Планировщик проверяет метрики каждые 2 часа и отправляет уведомления
  при: падении выручки >20%, плане >90%, низкой марже, мёртвом стоке и др.

- **pnpm, не npm**: проект использует pnpm workspaces. Все установки
  через `pnpm install`, не `npm install`.
