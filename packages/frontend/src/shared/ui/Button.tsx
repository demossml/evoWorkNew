import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center",
    "font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    "rounded-[var(--ui-radius-md)]",
    "gap-[calc(var(--ui-space-1)/2)]",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--ui-color-primary)] text-white hover:opacity-90 focus-visible:ring-[var(--ui-color-primary)]",
        secondary:
          "bg-[var(--ui-color-surface)] text-[var(--ui-color-text)] border border-[var(--ui-color-border)] hover:bg-slate-50 dark:hover:bg-slate-800 focus-visible:ring-[var(--ui-color-primary)]",
        ghost:
          "bg-transparent text-[var(--ui-color-text)] hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:ring-[var(--ui-color-primary)]",
        danger:
          "bg-[var(--ui-color-danger)] text-white hover:opacity-90 focus-visible:ring-[var(--ui-color-danger)]",
      },
      size: {
        sm: "h-8 px-[var(--ui-space-1)] text-xs",
        md: "h-10 px-[var(--ui-space-2)] text-sm",
        lg: "h-12 px-[var(--ui-space-3)] text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
