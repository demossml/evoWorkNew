import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { HelpButton } from "@shared/help/HelpSheet";
import type { HelpId } from "@shared/help/helpContent";

interface ReportHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  helpId?: HelpId;
}

export function ReportHeader({ title, subtitle, onBack, helpId }: ReportHeaderProps) {
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));

  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1">
        {onBack !== undefined && (
          <button
            type="button"
            onClick={handleBack}
            className="shrink-0 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-muted-foreground"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">
          {title}
        </h1>
        {helpId && <HelpButton helpId={helpId} />}
      </div>
      {subtitle && (
        <p className="mt-1 text-sm text-muted-foreground">
          {subtitle}
        </p>
      )}
    </div>
  );
}
