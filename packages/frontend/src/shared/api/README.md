# shared/api

Единая точка API-клиента и общих API-оберток.

Текущий клиент: `client.ts`.

## Правила слоя API

1. `UI` (`pages/widgets/features/ui`) не вызывает `client.api` напрямую.
2. Сетевые вызовы выносятся в:
   - `features/<domain>/api/*` для пользовательских сценариев;
   - `entities/<entity>/api.ts` для CRUD по бизнес-сущностям;
   - `shared/api/endpoints.ts` только для общих кросс-доменных оберток.
3. `AI` вызовы живут в `features/ai/api/*` или `ai/orchestration/*`, но не в React-компонентах.
4. Ошибки и нормализация ответа обрабатываются в API-слое, а не в JSX.
