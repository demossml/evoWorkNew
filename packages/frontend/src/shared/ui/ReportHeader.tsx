import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router";

interface ReportHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}

export function ReportHeader({ title, subtitle, onBack }: ReportHeaderProps) {
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));

  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-2">
        {onBack !== undefined && (
          <button
            type="button"
            onClick={handleBack}
            className="shrink-0 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h1>
      </div>
      {subtitle && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {subtitle}
        </p>
      )}
    </div>
  );
}
