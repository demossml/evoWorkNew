#!/bin/bash
# setup.sh — полное развёртывание Evo App на Linux
# Запуск: sudo bash deploy/setup.sh
set -e

APP_DIR="/opt/evo-app"
NODE_VERSION="22"

echo "=== 1. Установка Node.js $NODE_VERSION ==="
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
fi
echo "Node.js: $(node -v)"

echo "=== 2. Установка nginx ==="
apt-get install -y nginx
systemctl enable nginx

echo "=== 3. Копирование файлов ==="
mkdir -p "$APP_DIR" "/var/log/evo-app"
cp -r . "$APP_DIR/"
cd "$APP_DIR/packages/backend"

echo "=== 4. Установка pnpm и зависимостей ==="
npm install -g pnpm
pnpm install --frozen-lockfile

echo "=== 5. Сборка фронтенда ==="
cd ../frontend
pnpm build

echo "=== 6. Настройка nginx ==="
cp "$APP_DIR/packages/backend/deploy/nginx.conf" /etc/nginx/sites-available/evo-app
ln -sf /etc/nginx/sites-available/evo-app /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "=== 7. Установка systemd сервисов ==="
cp "$APP_DIR/packages/backend/deploy/evo-app.service" /etc/systemd/system/
cp "$APP_DIR/packages/backend/deploy/evo-cron.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now evo-app evo-cron

echo "=== 8. Проверка ==="
sleep 2
curl -sf http://localhost:3000/health && echo "" || echo "Бэкенд не отвечает"
curl -sf http://localhost/ && echo "" || echo "Nginx не отвечает"

echo ""
echo "=== Готово! ==="
echo "   Бэкенд:  http://localhost:3000"
echo "   Фронт:   http://localhost"
echo "   Логи:    /var/log/evo-app/"
echo "   Статус:  systemctl status evo-app evo-cron"
