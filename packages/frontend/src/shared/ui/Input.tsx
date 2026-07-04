import * as React from "react";
import { cn } from "../../lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-[var(--ui-radius-md)] border border-[var(--ui-color-border)]",
        "bg-[var(--ui-color-surface)] px-[var(--ui-space-1)] text-sm text-[var(--ui-color-text)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-color-primary)]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    />
  )
);

Input.displayName = "Input";

export { Input };
