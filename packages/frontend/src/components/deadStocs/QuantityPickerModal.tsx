import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface QuantityPickerModalProps {
  open: boolean;
  max: number;
  value: number;
  onClose: () => void;
  onSelect: (value: number) => void;
}

export const QuantityPickerModal: React.FC<QuantityPickerModalProps> = ({
  open,
  max,
  value,
  onClose,
  onSelect,
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.children[value - 1] as HTMLElement;
      el?.scrollIntoView({ block: "center" });
    }
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

            {/* Окно барабана */}
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
