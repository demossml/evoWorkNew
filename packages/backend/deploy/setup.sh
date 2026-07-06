#!/bin/bash
# setup.sh — развёртывание Evo App на Linux (Caddy + systemd)
#
# Использование (от root или через sudo):
#   1. Заполнить /opt/evo-app/.env — токены и домен
#   2. sudo bash deploy/setup.sh
#
# Требования: Ubuntu/Debian, порты 80/443 открыты, A-запись домена → IP сервера.
set -e

APP_DIR="/opt/evo-app"
NODE_VERSION="22"
DOMAIN="${DOMAIN:-localhost}"

# ─── Проверка прав ───
if [ "$EUID" -ne 0 ]; then
    echo "❌ Запустите от root: sudo bash deploy/setup.sh"
    exit 1
fi

# ─── Проверка .env ───
if [ ! -f "$APP_DIR/.env" ]; then
    echo "❌ Файл $APP_DIR/.env не найден."
    echo "   Создайте его с переменными (см. DEPLOY.md):"
    echo ""
    echo "   DOMAIN=app.example.com"
    echo "   EVOTOR_API_TOKEN=..."
    echo "   BOT_TOKEN=..."
    echo "   TELEGRAM_STORAGE_CHAT_ID=..."
    echo "   TELEGRAM_STORAGE_BOT_TOKEN=..."
    exit 1
fi
# Загружаем .env для проверки переменных
source "$APP_DIR/.env"

if [ -z "$DOMAIN" ]; then echo "❌ DOMAIN не задан в .env"; exit 1; fi
if [ -z "$EVOTOR_API_TOKEN" ]; then echo "❌ EVOTOR_API_TOKEN не задан в .env"; exit 1; fi
if [ -z "$BOT_TOKEN" ]; then echo "❌ BOT_TOKEN не задан в .env"; exit 1; fi

echo "=== 1. Установка Node.js $NODE_VERSION ==="
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
fi
echo "   Node.js: $(node -v)"

echo "=== 2. Установка Caddy ==="
if ! command -v caddy &>/dev/null; then
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update
    apt-get install -y caddy
fi
echo "   Caddy: $(caddy version)"

echo "=== 3. Установка pnpm и зависимостей ==="
npm install -g pnpm
cd "$APP_DIR"
pnpm install --frozen-lockfile --filter @evo-app/backend --filter @evo-app/frontend

echo "=== 4. Сборка фронтенда ==="
cd "$APP_DIR/packages/frontend"
pnpm build
cp -R dist ../backend/

echo "=== 5. Создание пользователя evo ==="
if ! id evo &>/dev/null; then
    useradd -r -s /usr/sbin/nologin evo
fi
chown -R evo:evo "$APP_DIR" /var/log/evo-app
mkdir -p /var/log/evo-app

echo "=== 6. Настройка Caddy ==="
cp "$APP_DIR/packages/backend/deploy/Caddyfile" /etc/caddy/Caddyfile
# Прокидываем DOMAIN через env-файл
mkdir -p /etc/caddy
echo "DOMAIN=$DOMAIN" > /etc/caddy/evo.env
chmod 600 /etc/caddy/evo.env
caddy validate --envfile /etc/caddy/evo.env
systemctl reload caddy || systemctl restart caddy

echo "=== 7. Установка systemd сервиса ==="
cp "$APP_DIR/packages/backend/deploy/evo-app.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now evo-app

echo "=== 8. Проверка ==="
sleep 3
echo "  Health: $(curl -sf http://localhost:3000/health || echo 'НЕ ОТВЕЧАЕТ')"
echo "  Caddy:  $(curl -sf http://localhost/health || echo 'НЕ ОТВЕЧАЕТ')"

echo ""
echo "==========================================="
echo "  Готово!"
echo "  URL:  https://$DOMAIN"
echo "  Логи: /var/log/evo-app/"
echo "  Статус: systemctl status evo-app"
echo "  Caddy:  systemctl status caddy"
echo "==========================================="
