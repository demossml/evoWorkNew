import type { StoreOpeningStep } from "../../../pages/opening/types";

interface ProgressStepsProps {
  current: StoreOpeningStep;
  onStepClick?: (step: StoreOpeningStep) => void;
}

export default function ProgressSteps({ current, onStepClick }: ProgressStepsProps) {
  const steps = [
    { id: "shop", label: "Магазин" },
    { id: "initial", label: "Открытие" },
    { id: "photos", label: "Фото" },
    { id: "cash_check", label: "Касса" },
  ] as Array<{ id: StoreOpeningStep; label: string }>;

  const currentIndex = steps.findIndex((step) => step.id === current);

  return (
    <div className="flex items-center justify-between mb-6">
      {steps.map((s, index) => (
        <div key={s.id} className="flex flex-col items-center text-center flex-1">
          <button
            type="button"
            disabled={!onStepClick || index > currentIndex}
            onClick={() => onStepClick?.(s.id)}
            className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold transition-colors ${
              index < currentIndex
                ? "bg-success text-success-foreground"
                : current === s.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
            } ${!onStepClick || index > currentIndex ? "cursor-default" : "cursor-pointer"}`}
          >
            {index < currentIndex ? "✓" : index + 1}
          </button>
          <span className="text-xs mt-1">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
