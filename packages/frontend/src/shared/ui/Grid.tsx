import * as React from "react";
import { cn } from "../../lib/utils";

type GridCols = 1 | 2 | 3 | 4;

const colsClass: Record<GridCols, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
  4: "grid-cols-1 md:grid-cols-2 xl:grid-cols-4",
};

export interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  cols?: GridCols;
}

export function Grid({ cols = 2, className, ...props }: GridProps) {
  return (
    <div
      className={cn("grid gap-[var(--ui-space-2)]", colsClass[cols], className)}
      {...props}
    />
  );
}
