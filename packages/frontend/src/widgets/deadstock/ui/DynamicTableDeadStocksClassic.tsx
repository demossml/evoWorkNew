import {
  Fragment,
  type UIEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence, useScroll, useSpring } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useGetShops } from "../../../hooks/useApi";
import { trackEvent } from "../../../helpers/analytics";
import { invalidateDashboardQueries } from "@shared/api";
import { updateDeadStocks } from "@features/deadstock/api";

/* ===================== TYPES ===================== */

interface DeadStockItem {
  name: string;
  quantity: number;
  sold: number;
  lastSaleDate: string | null;
  mark?: "keep" | "move" | "sellout" | "writeoff" | null;
  moveCount?: number;
  moveToStore?: string;
}

interface DynamicTableProps {
  data: DeadStockItem[];
  shopUuid: string;
}

interface QuantityPickerModalProps {
  open: boolean;
  max: number;
  value: number;
  onClose: () => void;
  onSelect: (value: number) => void;
}

/* ===================== CONSTANTS ===================== */

const tableN: Record<string, string> = {
  name: "Имя",
  quantity: "Остаток",
  sold: "Продано",
  lastSaleDate: "Последняя продажа",
};
const INITIAL_VISIBLE_ROWS = 120;
const LOAD_MORE_STEP = 120;

/* ===================== QUANTITY PICKER ===================== */

const QuantityPickerModal = ({
  open,
  max,
  value,
  onClose,
  onSelect,
}: QuantityPickerModalProps) => {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[value - 1] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "center" });
  }, [open, value]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="bg-white dark:bg-gray-900 rounded-2xl w-64 p-4"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center text-sm mb-2">Выберите количество</div>

            <div className="relative h-40 overflow-hidden">
              <div className="absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 border-y border-blue-500 pointer-events-none" />

              <div
                ref={listRef}
                className="h-full overflow-y-scroll snap-y snap-mandatory scrollbar-none"
              >
                {Array.from({ length: max }, (_, i) => i + 1).map((num) => (
                  <div
                    key={num}
                    onClick={() => {
                      onSelect(num);
                      onClose();
                    }}
                    className={`h-8 flex items-center justify-center snap-center cursor-pointer
                      ${
                        num === value
                          ? "text-blue-600 font-semibold"
                          : "text-gray-500"
                      }`}
                  >
                    {num}
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={onClose}
              className="mt-3 w-full py-1.5 rounded bg-gray-200 dark:bg-gray-700 text-sm"
            >
              Отмена
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/* ===================== MAIN TABLE ===================== */

export const DynamicTableDeadStocksClassic = ({
  data,
  shopUuid,
}: DynamicTableProps) => {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<DeadStockItem[]>(data);
  const [filter, setFilter] = useState("all");
  const [showSave, setShowSave] = useState(false);

  const [sortConfig, setSortConfig] = useState<{
    key: keyof DeadStockItem | null;
    direction: "asc" | "desc" | null;
  }>({ key: null, direction: null });
  const [visibleRowsCount, setVisibleRowsCount] = useState(INITIAL_VISIBLE_ROWS);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: scrollRef });
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });

  const shopsQuery = useGetShops();

  const sortedData = useMemo(() => {
    let filtered = items.map((item, sourceIndex) => ({ item, sourceIndex }));
    if (filter !== "all") {
      filtered = filtered.filter((entry) => entry.item.mark === filter);
    }

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        const dir = sortConfig.direction === "asc" ? 1 : -1;
        const aVal = a.item[sortConfig.key!] ?? "";
        const bVal = b.item[sortConfig.key!] ?? "";
        if (aVal < bVal) return -1 * dir;
        if (aVal > bVal) return 1 * dir;
        return 0;
      });
    }

    return filtered;
  }, [items, filter, sortConfig]);

  useEffect(() => {
    setVisibleRowsCount(INITIAL_VISIBLE_ROWS);
  }, [sortedData.length, sortConfig.key, sortConfig.direction, filter]);

  const hasMoreRows = visibleRowsCount < sortedData.length;
  const renderedRows = useMemo(
    () => sortedData.slice(0, visibleRowsCount),
    [sortedData, visibleRowsCount]
  );

  const loadMoreRows = useCallback(() => {
    setVisibleRowsCount((prev) => Math.min(prev + LOAD_MORE_STEP, sortedData.length));
  }, [sortedData.length]);

  const handleTableScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      if (!hasMoreRows) return;
      const el = event.currentTarget;
      const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceToBottom < 220) {
        loadMoreRows();
      }
    },
    [hasMoreRows, loadMoreRows]
  );

  const handleSort = (key: keyof DeadStockItem) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const updateMark = (index: number, mark: DeadStockItem["mark"]) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index].mark = mark;
      if (mark !== "move") {
        updated[index].moveCount = undefined;
        updated[index].moveToStore = undefined;
      }
      return updated;
    });
    setShowSave(true);
  };

  const updateMoveCount = useCallback((index: number, value: number) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index].moveCount = value;
      return updated;
    });
    setShowSave(true);
  }, []);

  const updateMoveToStore = useCallback((index: number, value: string) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index].moveToStore = value;
      return updated;
    });
    setShowSave(true);
  }, []);

  const handleSave = async () => {
    try {
      const changedItems = items.filter(
        (item) => item.mark !== null && item.mark !== undefined
      );
      void trackEvent("deadstock_save_started", {
        shopUuid,
        props: { itemsCount: changedItems.length },
      });

      const result = await updateDeadStocks({ items: changedItems, shopUuid });
      console.log("SAVE успешно:", result);
      void trackEvent("deadstock_save_success", {
        shopUuid,
        props: { itemsCount: changedItems.length },
      });
      await invalidateDashboardQueries(queryClient);
      setShowSave(false);

      // ✅ Переход на главную страницу после сохранения
      window.location.href = "/";
    } catch (e) {
      void trackEvent("deadstock_save_failed", {
        shopUuid,
        props: {
          reason: e instanceof Error ? e.message : "unknown_error",
        },
      });
      alert(`Ошибка при сохранении данных ${e}`);
    }
  };

  return (
    <div className="w-full min-h-screen px-2 sm:px-4 bg-custom-gray dark:bg-gray-900 rounded-2xl">
      <motion.div
        style={{ scaleX, transformOrigin: "0%" }}
        className="h-1 bg-blue-500 mb-2 rounded-full"
      />

      <div className="flex gap-2 mb-3 text-xs sm:text-xs">
        <select
          className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Все</option>
          <option value="keep">Оставить</option>
          <option value="move">Переместить</option>
          <option value="sellout">Распродаем</option>
          <option value="writeoff">Списать</option>
        </select>

        {showSave && (
          <button
            onClick={handleSave}
            className="px-3 py-1 bg-blue-600 text-white rounded"
          >
            Сохранить
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleTableScroll}
        className="max-h-[calc(100vh-6rem)] overflow-y-auto"
      >
        <table className="w-full table-auto">
          <thead className="sticky top-0 bg-gray-100 dark:bg-gray-700 z-10">
            <tr>
              {Object.keys(tableN).map((key) => (
                <th
                  key={key}
                  onClick={() => handleSort(key as keyof DeadStockItem)}
                  className="px-2 py-1 text-left cursor-pointer text-xs"
                >
                  {tableN[key]}
                </th>
              ))}
              <th className="px-2 py-1 text-xs">Отметка</th>
            </tr>
          </thead>

          <tbody>
            {renderedRows.map(({ item: row, sourceIndex }) => (
              <Fragment key={`${sourceIndex}-${row.name}`}>
                <tr>
                  <td colSpan={5} className="px-2 py-1 text-xs font-medium">
                    {row.name}
                  </td>
                </tr>

                <tr>
                  <td />
                  <td className="text-center text-xs">{row.quantity}</td>
                  <td className="text-center text-xs">{row.sold}</td>
                  <td className="text-center text-xs">
                    {row.lastSaleDate ?? "—"}
                  </td>

                  <td className="text-center">
                    <select
                      className="px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-xs"
                      value={row.mark ?? ""}
                      onChange={(e) =>
                        updateMark(
                          sourceIndex,
                          e.target.value as DeadStockItem["mark"]
                        )
                      }
                    >
                      <option value="">—</option>
                      <option value="keep">Оставить</option>
                      <option value="move">Переместить</option>
                      <option value="sellout">Распродаем</option>
                      <option value="writeoff">Списать</option>
                    </select>

                    {row.mark === "move" && (
                      <div className="flex flex-col gap-3 mt-3 text-[9px]">
                        <button
                          onClick={() => {
                            setActiveIndex(sourceIndex);
                            setPickerOpen(true);
                          }}
                          className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-left"
                        >
                          {row.moveCount ?? "Кол-во"}
                        </button>

                        <select
                          className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800"
                          value={row.moveToStore ?? ""}
                          onChange={(e) =>
                            updateMoveToStore(sourceIndex, e.target.value)
                          }
                        >
                          <option value="">Магазин</option>
                          {shopsQuery.data?.shopsNameAndUuid
                            // ✅ Исключаем текущий магазин
                            .filter((s) => s.uuid !== shopUuid)
                            .map((s) => (
                              <option key={s.uuid} value={s.uuid}>
                                {s.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
        {hasMoreRows && (
          <div className="sticky bottom-0 z-20 bg-custom-gray dark:bg-gray-900 px-2 py-2 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={loadMoreRows}
              className="w-full h-10 rounded-lg border border-gray-300 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-300"
            >
              Показать еще ({Math.max(sortedData.length - visibleRowsCount, 0)})
            </button>
          </div>
        )}
      </div>

      {activeIndex !== null && (
        <QuantityPickerModal
          open={pickerOpen}
          max={items[activeIndex].quantity}
          value={items[activeIndex].moveCount ?? 1}
          onClose={() => setPickerOpen(false)}
          onSelect={(val) => updateMoveCount(activeIndex, val)}
        />
      )}
    </div>
  );
};
