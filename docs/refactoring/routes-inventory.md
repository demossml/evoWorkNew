# Routes Inventory — evoWorkNew Backend

> Сгенерировано: 2026-07-17 | Файл: `packages/backend/src/api.ts`
> Всего роутов: 103 | Дубликаты регистрации: 0 (исправлено)

## Дубликаты путей (старый/новый нейминг — требуют стандартизации)

| Старый путь | Новый путь | Фронтенд использует |
|-------------|-----------|-------------------|
| `/api/deadStocks/update` | `/api/dead-stocks/update` | Оба |
| `/api/is-open-store` | `/api/stores/is-open-store` | Оба |
| `/api/open-store` | `/api/stores/open-store` | Оба |
| `/api/finish-opening` | `/api/stores/finish-opening` | Оба |
| `/api/upload-photos` | `/api/stores/opening-photos` | Новый |
| `/api/openings/photos` | `/api/stores/opening-photos` | Новый |

**Решение**: старые пути пометить `@deprecated`, удалить через 2 релиза.

## Список всех роутов по доменам

### Dead Stock (4)
- POST /api/dead-stocks/data
- POST /api/dead-stocks/ai-analysis
- POST /api/dead-stocks/update
- POST /api/deadStocks/update (legacy)

### Analytics (6)
- GET /api/analytics/dead-stock
- GET /api/analytics/dead-stock/analyze
- POST /api/analytics/dead-stock/actions
- POST /api/analytics/event
- GET /api/analytics/revenue/hourly-plan-fact
- GET /api/analytics/revenue/accessories-report

### Shops & Stores (12)
- POST /api/evotor/shops
- GET /api/evotor/shops
- GET /api/evotor/shops-names
- POST /api/evotor/groups-by-shop
- POST /api/stores/open-store
- POST /api/stores/is-open-store
- POST /api/stores/finish-opening
- POST /api/stores/opening-photos
- POST /api/stores/openings-report
- POST /api/stores/pos-sessions
- POST /api/stores/shops-opening-status
- POST /api/open-store (legacy)
- POST /api/is-open-store (legacy)
- POST /api/finish-opening (legacy)

### Sales Reports (8)
- POST /api/evotor/sales-result
- GET /api/evotor/sales-today-graf
- GET /api/evotor/sales-report
- POST /api/evotor/sales-garden-report
- POST /api/evotor/share-report
- GET /api/evotor/report/financial/today
- POST /api/profit-report
- POST /api/evotor/stock-report

### Employees & Salary (8)
- GET /api/employee-name
- GET /api/employees
- POST /api/employees/register
- POST /api/register
- POST /api/evotor/salary
- GET /api/salary/table
- POST /api/by-last-name-uuid
- GET /api/employee-role

### Schedules (4)
- POST /api/schedules/table
- POST /api/schedules/table-view
- POST /api/evotor/settings/shop-schedules
- GET /api/evotor/settings/shop-schedules

### Sellers Analytics (6)
- GET /api/sellers/dna/sellers
- GET /api/sellers/dna/metrics
- GET /api/sellers/dna/records
- GET /api/sellers/hourly-compare
- POST /api/employees/seller-effectiveness
- GET /api/sellers/table

### AI & Insights (7)
- POST /api/ai/analyze-sales
- POST /api/ai/dashboard-summary2-insights
- POST /api/ai/director/stock-transfer
- POST /api/ai/analyze/plan-metrics-content
- GET /api/ai/sellers-natural-breaks
- POST /api/evotor/generate-pdf
- POST /api/evotor/dashboard-home-insights

### Products & Forecast (4)
- POST /api/products/effectiveness
- POST /api/evotor/order
- POST /api/evotor/order-v2
- POST /api/evotor/dead-stock

### Admin (5)
- POST /api/admin/data-mode
- GET /api/evotor/settings-config
- POST /api/evotor/settings-config
- POST /api/evotor/settings/accessory-groups
- GET /api/evotor/settings/accessory-groups

### Store Openings (3)
- POST /api/openings/photos
- POST /api/upload-photos
- POST /api/upload-photos-batch

### Uploads (2)
- POST /api/upload
- POST /api/uploads/upload

### Internal Sync (2)
- POST /api/internal/sync/:task
- GET /api/internal/sync

### Other (10)
- GET /api/user
- POST /api/user
- POST /api/get-file
- GET /api/evotor/settings/shop-schedules
- POST /api/evotor/settings/shop-schedules
- GET /api/stores/opening-photos
- POST /api/stores/opening-photos
- GET /api/evotor/plan-for-today
- GET /api/evotor/settings-config
- POST /api/evotor/settings-config
