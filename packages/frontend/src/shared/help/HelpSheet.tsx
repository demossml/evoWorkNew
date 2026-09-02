import { useState } from "react";
import { Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { HELP, type HelpId } from "./helpContent";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
      {children}
    </h4>
  );
}

export function HelpSheet({
  helpId,
  open,
  onClose,
}: {
  helpId: HelpId;
  open: boolean;
  onClose: () => void;
}) {
  const article = HELP[helpId];
  if (!article) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md gap-3">
        <DialogHeader>
          <DialogTitle>{article.title}</DialogTitle>
          <DialogDescription className="sr-only">
            {article.why[0] ?? article.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-foreground max-h-[60vh] overflow-y-auto pr-1">
          {article.why.length > 0 && (
            <section>
              <SectionTitle>Зачем</SectionTitle>
              <ul className="space-y-1 list-disc pl-4 text-muted-foreground">
                {article.why.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </section>
          )}
          {article.how.length > 0 && (
            <section>
              <SectionTitle>Как пользоваться</SectionTitle>
              <ol className="space-y-1 list-decimal pl-4 text-muted-foreground">
                {article.how.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ol>
            </section>
          )}
          {article.lookAt.length > 0 && (
            <section>
              <SectionTitle>На что смотреть</SectionTitle>
              <ul className="space-y-1 list-disc pl-4 text-muted-foreground">
                {article.lookAt.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </section>
          )}
          {article.note && (
            <p className="text-xs text-muted-foreground border-t border-border pt-2">
              {article.note}
            </p>
          )}
        </div>

        <DialogClose asChild>
          <button className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
            Понятно
          </button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

export function HelpButton({
  helpId,
  className,
}: {
  helpId: HelpId;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const article = HELP[helpId];
  if (!article) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Справка"
        title="Справка"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`inline-flex items-center justify-center w-9 h-9 min-w-[36px] rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 ${
          className ?? ""
        }`}
      >
        <Info className="w-4 h-4" />
      </button>
      <HelpSheet helpId={helpId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
