import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { HelpButton } from "../shared/help/HelpSheet";
import type { HelpId } from "../shared/help/helpContent";

/**
 * Сворачиваемая карточка для Настроек. По умолчанию свёрнута.
 */
export function SettingsCollapsibleCard({
  title,
  subtitle,
  defaultOpen = false,
  icon,
  helpId,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  icon?: ReactNode;
  helpId?: HelpId;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center gap-2 px-4 py-3 text-left min-h-11"
        >
          {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
          <span className="flex-1 font-medium text-sm text-foreground">{title}</span>
          {subtitle && !open && (
            <span className="text-xs text-muted-foreground truncate max-w-[40%]">{subtitle}</span>
          )}
          <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {helpId && <HelpButton helpId={helpId} className="mr-2" />}
      </div>
      {open && <div className="px-4 pb-4 border-t border-border">{children}</div>}
    </div>
  );
}
