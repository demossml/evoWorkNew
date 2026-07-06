import { motion } from "framer-motion";

/**
 * Previously this took 5 arbitrary color variants (blue/green/purple/amber/
 * gray) with no shared meaning — the same metric (e.g. revenue) ended up
 * blue on one report and green on another, and there was no way to tell
 * "this is the headline number" from "this is a supporting figure" other
 * than which gradient a page author picked. `emphasis` replaces that with
 * one deliberate distinction: is this the number the user should see first,
 * or one of the supporting figures around it.
 */
export type KPIEmphasis = "primary" | "default";

export interface KPIItem {
  label: string;
  value: string;
  emphasis?: KPIEmphasis;
}

interface ReportKPIBarProps {
  items: KPIItem[];
}

export function ReportKPIBar({ items }: ReportKPIBarProps) {
  if (!items.length) return null;

  return (
    <div className={`grid gap-3 ${items.length <= 2 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4"}`}>
      {items.map((item, idx) => {
        const isPrimary = item.emphasis === "primary";
        return (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: idx * 0.05 }}
            className={`rounded-xl p-4 ${
              isPrimary
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-foreground"
            }`}
          >
            <div className={`text-xs mb-1 ${isPrimary ? "opacity-85" : "text-muted-foreground"}`}>
              {item.label}
            </div>
            <div className="text-lg sm:text-xl font-bold">{item.value}</div>
          </motion.div>
        );
      })}
    </div>
  );
}
