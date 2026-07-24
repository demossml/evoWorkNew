#!/bin/bash
# recalc-salary-all.sh — пересчёт зарплаты за все даты
# Запускать из /home/admingimolost/evo-work-new/packages/backend

set -e
cd /home/admingimolost/evo-work-new/packages/backend

DB="/home/admingimolost/evo-work-new/data/local.db"

DATES=$(sqlite3 "$DB" \
  "SELECT DISTINCT SUBSTR(close_date, 1, 10) FROM index_documents WHERE type = 'SELL' ORDER BY close_date;")

for day in $DATES; do
  echo "=== $day ==="
  SALARY_DB="$DB" npx tsx scripts/run-salary-date.ts "$day"
done

echo "Готово."
