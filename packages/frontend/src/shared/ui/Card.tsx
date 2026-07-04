import * as React from "react";
import { cn } from "../../lib/utils";

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[var(--ui-radius-md)] border border-[var(--ui-color-border)]",
        "bg-[var(--ui-color-surface)] text-[var(--ui-color-text)]",
        "p-[var(--ui-space-2)] shadow-sm",
        className
      )}
      {...props}
    />
  )
);

Card.displayName = "Card";

export type CardHeaderProps = React.HTMLAttributes<HTMLDivElement>;
export function CardHeader({ className, ...props }: CardHeaderProps) {
  return (
    <div
      className={cn("mb-[var(--ui-space-2)] flex items-start justify-between", className)}
      {...props}
    />
  );
}

export type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement>;
export function CardTitle({ className, ...props }: CardTitleProps) {
  return <h3 className={cn("text-base font-semibold", className)} {...props} />;
}

export type CardDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>;
export function CardDescription({ className, ...props }: CardDescriptionProps) {
  return (
    <p className={cn("text-sm text-[var(--ui-color-muted)]", className)} {...props} />
  );
}

export type CardContentProps = React.HTMLAttributes<HTMLDivElement>;
export function CardContent({ className, ...props }: CardContentProps) {
  return <div className={cn("space-y-[var(--ui-space-1)]", className)} {...props} />;
}

export type CardFooterProps = React.HTMLAttributes<HTMLDivElement>;
export function CardFooter({ className, ...props }: CardFooterProps) {
  return (
    <div
      className={cn("mt-[var(--ui-space-2)] flex items-center gap-[var(--ui-space-1)]", className)}
      {...props}
    />
  );
}

export { Card };
