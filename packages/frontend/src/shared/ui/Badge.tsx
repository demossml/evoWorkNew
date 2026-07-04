import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  [
    "inline-flex items-center",
    "rounded-[var(--ui-radius-md)]",
    "px-[var(--ui-space-1)] py-[2px]",
    "text-xs font-medium",
    "border",
  ].join(" "),
  {
    variants: {
      tone: {
        neutral:
          "bg-[var(--ui-color-surface)] text-[var(--ui-color-text)] border-[var(--ui-color-border)]",
        info: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900",
        success:
          "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-200 dark:border-green-900",
        warning:
          "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900",
        danger:
          "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { badgeVariants };
