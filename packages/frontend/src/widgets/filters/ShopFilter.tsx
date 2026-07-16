import { useMemo, useCallback } from "react";
import { Store } from "lucide-react";

/* ===================== TYPES ===================== */

export interface ShopFilterProps {
  /** Shop options: { uuid -> name }. */
  shops: Record<string, string>;
  /** Selected shop UUIDs. Empty array = «Все магазины». */
  selectedIds: string[];
  /** Called when selection changes. Empty array = all shops. */
  onChange: (ids: string[]) => void;
  /** Show loading state. */
  isLoading?: boolean;
}

/* ===================== COMPONENT ===================== */

export const ShopFilter: React.FC<ShopFilterProps> = ({
  shops,
  selectedIds,
  onChange,
  isLoading = false,
}) => {
  const shopEntries = useMemo(
    () => Object.entries(shops).sort(([, a], [, b]) => a.localeCompare(b)),
    [shops]
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const isAll = selectedIds.length === 0;

  const toggleShop = useCallback(
    (uuid: string) => {
      if (selectedSet.has(uuid)) {
        onChange(selectedIds.filter((id) => id !== uuid));
      } else {
        onChange([...selectedIds, uuid]);
      }
    },
    [selectedIds, selectedSet, onChange]
  );

  const selectAll = useCallback(() => onChange([]), [onChange]);

  if (isLoading) {
    return (
      <div className="space-y-1.5">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Магазин
        </span>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-full h-7 animate-pulse bg-muted"
              style={{ width: `${60 + i * 15}px` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        Магазин
      </span>

      <div className="flex flex-wrap gap-1.5">
        {shopEntries.map(([uuid, name]) => {
          const sel = selectedSet.has(uuid);
          return (
            <button
              key={uuid}
              type="button"
              onClick={() => toggleShop(uuid)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition border ${
                sel
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
              }`}
            >
              {name}
            </button>
          );
        })}

        {/* «Все магазины» — последняя кнопка */}
        <button
          type="button"
          onClick={selectAll}
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition border flex items-center gap-1 ${
            isAll
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
          }`}
        >
          <Store className="w-3 h-3" />
          Все магазины
        </button>
      </div>

      {!isAll && (
        <p className="text-[10px] text-muted-foreground">
          Выбрано: {selectedIds.length} из {shopEntries.length}
          {" · "}
          <button type="button" onClick={selectAll} className="text-primary hover:underline">
            Сбросить
          </button>
        </p>
      )}
    </div>
  );
};


