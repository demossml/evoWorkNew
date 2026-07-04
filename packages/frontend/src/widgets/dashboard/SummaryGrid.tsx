// components/SummaryGrid.tsx

import type { ReactNode } from "react";

interface SummaryGridProps {
  children: ReactNode;
}

export function SummaryGrid({ children }: SummaryGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {children}
    </div>
  );
}
