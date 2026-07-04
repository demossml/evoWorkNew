# shared/ui

Переиспользуемые UI-компоненты без бизнес-логики.

## Design Tokens

Файл: `src/shared/ui/tokens.css`

Базовые правила:
- spacing: шаг 8px (`--ui-space-1..6`)
- radius: `--ui-radius-md: 12px`
- цвета: использовать только `--ui-color-*`

Токены подключены глобально в `src/main.tsx`.

## UI-kit (PR-2)

- `Button`
- `Card`
- `Badge`
- `Grid`
- `StatCard`
- `AlertCard`
- `Input`
- `Select`
- `Textarea`

Экспорт компонентов: `src/shared/ui/index.ts`
