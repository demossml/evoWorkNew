import * as React from "react";
import { cn } from "../../lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-[96px] w-full rounded-[var(--ui-radius-md)] border border-[var(--ui-color-border)]",
        "bg-[var(--ui-color-surface)] px-[var(--ui-space-1)] py-[var(--ui-space-1)]",
        "text-sm text-[var(--ui-color-text)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-color-primary)]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    />
  )
);

Textarea.displayName = "Textarea";

export { Textarea };
