// components/ui/LoadingSkeleton.tsx
export function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-28 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800"
        />
      ))}
    </div>
  );
}
