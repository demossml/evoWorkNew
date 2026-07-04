import { Card } from "@shared/ui";
import { useLoadLeads } from "../model";

export function LeadsListWidget() {
  const { items, loading, error } = useLoadLeads();

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Лиды</h3>
      {loading && <div className="mt-2 text-xs text-gray-500">Загрузка...</div>}
      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
      {!loading && !error && (
        <ul className="mt-2 space-y-1 text-xs text-gray-700 dark:text-gray-200">
          {items.slice(0, 10).map((lead) => (
            <li key={lead.id}>{lead.fullName || lead.phone || lead.id}</li>
          ))}
          {items.length === 0 && <li className="text-gray-500">Нет лидов</li>}
        </ul>
      )}
    </Card>
  );
}
