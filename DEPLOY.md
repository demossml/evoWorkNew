# Деплой на Linux (Caddy + HTTPS)

Развёртывание Evo App на чистом Linux-сервере (Ubuntu/Debian). Одна команда — `sudo bash deploy/setup.sh` — после заполнения `.env`.

## Что нужно от сервера

- Ubuntu 22.04+ или Debian 12+
- Порт 80 и 443 открыты (Caddy получает сертификат Let's Encrypt)
- **A-запись домена** уже направлена на IP сервера (иначе Caddy не выпустит HTTPS)

## Шаг 1. Клонировать репозиторий

```bash
git clone https://github.com/demossml/evoWorkNew.git /opt/evo-app
cd /opt/evo-app
```

## Шаг 2. Создать `.env` с токенами

```bash
nano /opt/evo-app/.env
```

Содержимое (`<...>` заменить на реальные значения):

```bash
DOMAIN=<ваш-домен.ru>
EVOTOR_API_TOKEN=<токен-эвотор-api>
BOT_TOKEN=<токен-telegram-бота>
TELEGRAM_STORAGE_CHAT_ID=<id-чата-для-файлов>
TELEGRAM_STORAGE_BOT_TOKEN=<токен-бота-для-файлов>
```

Пример (не настоящие токены):

```bash
DOMAIN=evo.mycompany.com
EVOTOR_API_TOKEN=1126f94c-2b19-490e-872c-49ded3be310e
BOT_TOKEN=8727487138:AAHnSTM9tisI2pOmRqooqTSHwsuJVtMmXag
TELEGRAM_STORAGE_CHAT_ID=-5118742446
TELEGRAM_STORAGE_BOT_TOKEN=8727487138:AAHnSTM9tisI2pOmRqooqTSHwsuJVtMmXag
```

Файл `.env` НЕ коммитится (уже в `.gitignore`).

## Шаг 3. Запустить установку

```bash
sudo bash packages/backend/deploy/setup.sh
```

Скрипт делает:

| Шаг | Что делает |
|---|---|
| 1 | Устанавливает Node.js 22 (если нет) |
| 2 | Устанавливает Caddy (если нет) |
| 3 | Устанавливает pnpm + зависимости бэкенда и фронтенда |
| 4 | Собирает фронтенд (`pnpm build`) |
| 5 | Создаёт пользователя `evo`, чинит права |
| 6 | Настраивает Caddy (reverse proxy + авто-HTTPS) |
| 7 | Ставит systemd-сервис `evo-app` |
| 8 | Проверяет health `/health` и `/` |

## Шаг 4. Проверить

```bash
# Бэкенд
curl https://$DOMAIN/health
# → {"status":"ok","uptime":1.2,"ts":...}

# Фронтенд
curl -s https://$DOMAIN/ | head -5
# → <!DOCTYPE html>...

# Статус сервисов
systemctl status evo-app
systemctl status caddy
```

## Что происходит при старте сервера

1. **Синхронизация** — документы за 90 дней из Evotor API
2. **План продаж** — расчёт на сегодня
3. **Продажи по плану** — факт vs план по магазинам
4. **Зарплаты** — расчёт за вчерашний день

Затем cron (каждые 6 часов):
- Планы, продажи, зарплаты обновляются автоматически
- Синхронизация документов — каждые 30 минут

## Обновление кода (из репозитория)

На сервере:

```bash
cd /opt/evo-app
git pull
cd packages/frontend && pnpm build && cp -R dist ../backend/
systemctl restart evo-app
```

Код пишется локально (на Mac), пушится в GitHub. Сервер подтягивает через `git pull`.

## Логи

```bash
tail -f /var/log/evo-app/app.log     # бэкенд
tail -f /var/log/evo-app/error.log   # ошибки
journalctl -u evo-app -f             # systemd
journalctl -u caddy -f               # Caddy
```

## Структура продакшена

```
/opt/evo-app/
├── .env                    # токены и домен (НЕ коммитить!)
├── packages/
│   ├── backend/
│   │   ├── server.ts       # Hono-сервер (API + cron + статика)
│   │   ├── dist/           # копия собранного фронтенда
│   │   └── deploy/
│   │       ├── setup.sh    # автоустановка
│   │       ├── Caddyfile   # конфиг Caddy
│   │       └── evo-app.service  # systemd
│   └── frontend/
│       └── dist/           # собранный SPA
├── data/
│   ├── local.db            # SQLite (документы, планы, зарплаты)
│   ├── storage/            # R2-эмуляция (файлы)
│   └── logs/               # логи
└── node_modules/
```

/etc/
├── caddy/
│   ├── Caddyfile           # → /opt/.../deploy/Caddyfile
│   └── evo.env             # DOMAIN=...
└── systemd/system/
    └── evo-app.service     # → /opt/.../deploy/evo-app.service
```
