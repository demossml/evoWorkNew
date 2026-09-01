import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Сворачиваемая карточка для Настроек. По умолчанию свёрнута.
 */
export function SettingsCollapsibleCard({
  title,
  subtitle,
  defaultOpen = false,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left min-h-11"
      >
        {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
        <span className="flex-1 font-medium text-sm text-foreground">{title}</span>
        {subtitle && !open && (
          <span className="text-xs text-muted-foreground truncate max-w-[40%]">{subtitle}</span>
        )}
        <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-4 pb-4 border-t border-border">{children}</div>}
    </div>
  );
}
