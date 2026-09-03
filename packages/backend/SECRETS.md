# Секреты и переменные окружения

Все секреты задаются **вне репозитория**. Реальные значения никогда не должны попадать
в `wrangler.toml`, исходники или коммиты.

## Где задавать

| Окружение | Как задать |
|---|---|
| Production / staging (Cloudflare Workers) | `wrangler secret put <NAME>` |
| Локальный dev (`tsx server.ts`, `wrangler dev`) | файл `.dev.vars` (gitignored), пример — `.dev.vars.example` |

## Список секретов

| Имя | Назначение | Команда |
|---|---|---|
| `EVOTOR_API_TOKEN` | Evotor API-токен основной сети | `wrangler secret put EVOTOR_API_TOKEN` |
| `BOT_TOKEN` | Telegram-бот (файлы/фото) | `wrangler secret put BOT_TOKEN` |
| `TELEGRAM_STORAGE_BOT_TOKEN` | Telegram-бот хранилища | `wrangler secret put TELEGRAM_STORAGE_BOT_TOKEN` |
| `TELEGRAM_STORAGE_CHAT_ID` | Чат для хранилища | `wrangler secret put TELEGRAM_STORAGE_CHAT_ID` |
| `DEEPSEEK_API_KEY` | DeepSeek AI (также можно per-tenant в БД) | `wrangler secret put DEEPSEEK_API_KEY` |
| `AUTH_SECRET` | «Pepper» для PBKDF2-хеширования паролей | `wrangler secret put AUTH_SECRET` |

## AUTH_SECRET — правила

- Генерировать случайную строку **≥ 32 символов**:
  `openssl rand -base64 48`
- Задавать отдельно для prod и staging.
- ⚠️ **Смена `AUTH_SECRET` инвалидирует все существующие пароли**:
  pepper подмешивается к паролю перед PBKDF2 (`password + secret`), поэтому после
  ротации придётся заново сбрасывать пароли пользователей.

## Несекретные значения (можно в `wrangler.toml` [vars])

- `R2_PUBLIC_URL` — публичный URL R2-бакета (отдаётся клиенту).
