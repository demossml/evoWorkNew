import * as React from "react";
import { cn } from "../../lib/utils";
import { Card } from "./Card";

type StatTone = "default" | "success" | "warning" | "danger";

const toneClass: Record<StatTone, string> = {
  default: "border-[var(--ui-color-border)]",
  success: "border-green-200 dark:border-green-900/70",
  warning: "border-amber-200 dark:border-amber-900/70",
  danger: "border-red-200 dark:border-red-900/70",
};

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: StatTone;
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  className,
  ...props
}: StatCardProps) {
  return (
    <Card className={cn("p-3", toneClass[tone], className)} {...props}>
      <div className="text-xs sm:text-xs text-[var(--ui-color-muted)]">{label}</div>
      <div className="mt-1 text-sm sm:text-base font-semibold text-[var(--ui-color-text)]">
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-xs text-[var(--ui-color-muted)]">{hint}</div>
      ) : null}
    </Card>
  );
}
