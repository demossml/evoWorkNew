import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

interface TileWrapperProps {
  /** Whether the details panel is shown */
  expanded: boolean;
  /** Called when the card is clicked */
  onToggle: () => void;
  /** The collapsed card content (always visible) */
  card: ReactNode;
  /** The expanded detail content (shown/hidden with animation) */
  detail?: ReactNode;
}

/**
 * Previously each caller passed its own `ringTone` (blue/orange/purple/pink/
 * cyan/indigo/slate/green/red) purely to visually tell tiles apart once
 * expanded. Since the tint only appeared after a tile was already opened —
 * at which point the user already knows which widget they're looking at —
 * it wasn't actually building any at-a-glance recognition, just adding
 * unrelated colors with no shared meaning. One consistent accent for
 * "this tile is expanded" is clearer and keeps color meaningful elsewhere
 * (status, confidence, etc.) rather than spent on decoration here.
 */
export function TileWrapper({ expanded, onToggle, card, detail }: TileWrapperProps) {
  return (
    <div>
      <div
        onClick={onToggle}
        className={`rounded-xl transition-all duration-300 ${
          expanded
            ? "ring-2 ring-primary scale-[1.01]"
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
