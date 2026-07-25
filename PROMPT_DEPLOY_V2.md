# Промпт для AI-агента на Mac Mini — деплой (25.07.2026, v2)

Скопируй блок ниже и отправь агенту.

---

## Задача

Закатить обновления из GitHub на продакшн. Крупное обновление настроек:
полностью новая страница /evotor/settings, персональные настройки продавцов,
акционные товары, редактор расписания, AI push-агент.

**КРИТИЧЕСКИ: старые данные в БД не удалять. Новые таблицы и колонки — только ADD.**

---

## Инструкция для агента

Выполнять строго по порядку. При любой ошибке — остановиться и прислать мне вывод.

### 1. Обновить код

```bash
cd /opt/evo-app
git fetch origin main
git reset --hard origin/main
git log --oneline -3
```

### 2. Установить новые зависимости

```bash
cd /opt/evo-app
pnpm install --frozen-lockfile
# Если упадёт из-за lockfile:
pnpm install --no-frozen-lockfile
```

### 3. Применить миграции БД

**НЕ УДАЛЯТЬ И НЕ ПЕРЕСОЗДАВАТЬ БД.** База: `/opt/evo-app/data/local.db`

```bash
cd /opt/evo-app/packages/backend

# Новые таблицы и колонки
sqlite3 /opt/evo-app/data/local.db "CREATE TABLE IF NOT EXISTS seller_settings (employee_uuid TEXT PRIMARY KEY, employee_name TEXT DEFAULT '', salary_mode TEXT NOT NULL DEFAULT 'full', base_salary REAL NOT NULL DEFAULT 0, updated_at TEXT DEFAULT (datetime('now')));"

sqlite3 /opt/evo-app/data/local.db "CREATE TABLE IF NOT EXISTS promo_products (id INTEGER PRIMARY KEY AUTOINCREMENT, product_uuid TEXT NOT NULL, product_name TEXT DEFAULT '', group_uuid TEXT NOT NULL, group_name TEXT DEFAULT '', bonus_amount REAL NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, activated_at TEXT NOT NULL, deactivated_at TEXT DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')));"

sqlite3 /opt/evo-app/data/local.db "CREATE INDEX IF NOT EXISTS idx_pp_product ON promo_products(product_uuid, activated_at);"
sqlite3 /opt/evo-app/data/local.db "CREATE INDEX IF NOT EXISTS idx_pp_active ON promo_products(is_active, product_uuid);"

# Новые колонки в salaryData
sqlite3 /opt/evo-app/data/local.db "ALTER TABLE salaryData ADD COLUMN bonusPromo INTEGER NOT NULL DEFAULT 0;" 2>/dev/null
sqlite3 /opt/evo-app/data/local.db "ALTER TABLE salaryData ADD COLUMN salaryMode TEXT NOT NULL DEFAULT 'full';" 2>/dev/null
sqlite3 /opt/evo-app/data/local.db "ALTER TABLE salaryData ADD COLUMN baseSalary INTEGER NOT NULL DEFAULT 0;" 2>/dev/null

# Обнулить дефолтные группы планов (пользователь выберет сам)
sqlite3 /opt/evo-app/data/local.db "UPDATE app_settings SET value = '[]' WHERE key = 'vape_group_uuids';"

echo "Миграции готовы"
```

### 4. Проверить БД

```bash
sqlite3 /opt/evo-app/data/local.db "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" | head -20
sqlite3 /opt/evo-app/data/local.db "SELECT COUNT(*) FROM shops;"
sqlite3 /opt/evo-app/data/local.db "SELECT COUNT(*) FROM shopProduct;"
sqlite3 /opt/evo-app/data/local.db "SELECT COUNT(*) FROM productSold;"
```

Количество магазинов/товаров/продаж должно быть таким же как до деплоя.

### 5. Пересобрать фронтенд

```bash
cd /opt/evo-app/packages/frontend
pnpm build
ls -la dist/index.html
```

### 6. Перезапустить сервис

```bash
sudo systemctl restart evo-app
sleep 5
sudo systemctl status evo-app --no-pager | head -10
```

### 7. Проверить API

```bash
curl -s http://localhost:3000/health
curl -s http://localhost:3000/api/settings | head -c 100
curl -s http://localhost:3000/api/sellers/settings | head -c 100
curl -s http://localhost:3000/api/promo/products
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/evotor/sales-today
```

Все должны вернуть HTTP 200 или валидный JSON.

### 8. Проверить HTTPS

```bash
curl -s -o /dev/null -w "HTTPS: %{http_code}\n" https://localhost/health
```

### 9. Финальная проверка

```bash
echo "=== Git ===" && cd /opt/evo-app && git log --oneline -3 && \
echo "=== Service ===" && sudo systemctl status evo-app --no-pager | head -5 && \
echo "=== DB tables ===" && sqlite3 /opt/evo-app/data/local.db "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('seller_settings','promo_products','app_settings','push_log');" && \
echo "=== Settings count ===" && sqlite3 /opt/evo-app/data/local.db "SELECT COUNT(*) FROM app_settings;" && \
echo "=== Errors ===" && sudo journalctl -u evo-app --no-pager -n 20 | grep -i "error\|fail" || echo "(no errors)"
```

Пришли мне этот вывод.

---

## Откат (если что-то пошло не так)

```bash
cd /opt/evo-app
git reset --hard HEAD~1
cd packages/frontend && pnpm build
sudo systemctl restart evo-app
```

База данных не пострадает.
