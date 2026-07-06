interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Minimal inline line-sparkline, no charting library needed. Was previously
 * defined identically inside TopProductsDetails.tsx only — pulled out here
 * so RevenueWidget (and anything else that wants a 7-day trend line) can
 * reuse it instead of redefining it.
 */
export function Sparkline({ values, width = 90, height = 26, className }: SparklineProps) {
  const safeValues = values.length > 1 ? values : [0, 0];
  const min = Math.min(...safeValues);
  const max = Math.max(...safeValues);
  const span = max - min || 1;
  const points = safeValues
    .map((v, i) => {
      const x = (i / (safeValues.length - 1)) * (width - 2) + 1;
      const y = height - 2 - ((v - min) / span) * (height - 4);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={className ?? "text-primary"}
        points={points}
      />
    </svg>
  );
}
