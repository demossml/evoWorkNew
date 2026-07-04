import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

type RingTone = "blue" | "orange" | "purple" | "pink" | "cyan" | "indigo" | "slate" | "green" | "red";

const ringMap: Record<RingTone, string> = {
  blue:   "ring-2 ring-blue-500 scale-[1.01]",
  orange: "ring-2 ring-orange-500 scale-[1.01]",
  purple: "ring-2 ring-purple-500 scale-[1.01]",
  pink:   "ring-2 ring-pink-500 scale-[1.01]",
  cyan:   "ring-2 ring-cyan-500 scale-[1.01]",
  indigo: "ring-2 ring-indigo-500 scale-[1.01]",
  slate:  "ring-2 ring-slate-500 scale-[1.01]",
  green:  "ring-2 ring-green-500 scale-[1.01]",
  red:    "ring-2 ring-red-500 scale-[1.01]",
};

interface TileWrapperProps {
  /** Whether the details panel is shown */
  expanded: boolean;
  /** Called when the card is clicked */
  onToggle: () => void;
  /** Color tone for the ring accent when expanded */
  ringTone: RingTone;
  /** The collapsed card content (always visible) */
  card: ReactNode;
  /** The expanded detail content (shown/hidden with animation) */
  detail?: ReactNode;
}

export function TileWrapper({ expanded, onToggle, ringTone, card, detail }: TileWrapperProps) {
  const ringClass = ringMap[ringTone] || ringMap["blue"];

  return (
    <div>
      <div
        onClick={onToggle}
        className={`rounded-xl transition-all duration-300 ${
          expanded
            ? ringClass
            : "hover:-translate-y-0.5 cursor-pointer"
        }`}
      >
        {card}
      </div>
      <AnimatePresence initial={false}>
        {expanded && detail && (
          <motion.div
            key="detail-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-3">{detail}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
