import * as React from "react";
import { cn } from "../../lib/utils";
import { Card } from "./Card";
import { Badge } from "./Badge";

type AlertSeverity = "info" | "warning" | "critical";

const severityStyles: Record<
  AlertSeverity,
  {
    card: string;
    title: string;
    desc: string;
    badgeTone: "info" | "warning" | "danger";
  }
> = {
  info: {
    card: "border-blue-200 bg-blue-50/80 dark:border-blue-900/70 dark:bg-blue-950/20",
    title: "text-blue-900 dark:text-blue-100",
    desc: "text-blue-800 dark:text-blue-200",
    badgeTone: "info",
  },
  warning: {
    card: "border-amber-200 bg-amber-50/80 dark:border-amber-900/70 dark:bg-amber-950/20",
    title: "text-amber-900 dark:text-amber-100",
    desc: "text-amber-800 dark:text-amber-200",
    badgeTone: "warning",
  },
  critical: {
    card: "border-red-200 bg-red-50/80 dark:border-red-900/70 dark:bg-red-950/20",
    title: "text-red-900 dark:text-red-100",
    desc: "text-red-800 dark:text-red-200",
    badgeTone: "danger",
  },
};

export interface AlertCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  value?: React.ReactNode;
  description: React.ReactNode;
  severity?: AlertSeverity;
}

export function AlertCard({
  title,
  value,
  description,
  severity = "info",
  className,
  ...props
}: AlertCardProps) {
  const style = severityStyles[severity];

  return (
    <Card className={cn("p-3", style.card, className)} {...props}>
      <div className="flex items-center justify-between gap-2">
        <div className={cn("text-xs sm:text-xs font-semibold uppercase tracking-wide", style.title)}>
          {title}
        </div>
        <Badge tone={style.badgeTone}>{severity}</Badge>
      </div>
      {value ? <div className={cn("mt-1 text-sm font-semibold", style.title)}>{value}</div> : null}
      <div className={cn("mt-1 text-xs", style.desc)}>{description}</div>
    </Card>
  );
}
