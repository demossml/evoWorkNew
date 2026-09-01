import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUp, ArrowDown, Trash2, Plus, Camera, HelpCircle, MessageSquare, Save, ChevronDown,
} from "lucide-react";
import type { OpeningPointConfig, OpeningStep } from "../../pages/opening/types";

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function newStep(kind: "photo" | "question" | "text" | "cash"): OpeningStep {
  if (kind === "photo") {
    return {
      id: uid(), type: "photo", title: "Новое фото", description: "", required: true, max_photos: 1,
    };
  }
  if (kind === "text") {
    return { id: uid(), type: "text", title: "Новый комментарий", description: "", required: false };
  }
  if (kind === "cash") {
    return {
      id: uid(), type: "question", title: "Сходится ли касса?", required: true,
      options: ["Да", "Нет"],
      followups: [{
        when_option: "Нет",
        fields: [
          { id: uid(), type: "number", label: "Сумма расхождения, ₽", required: true },
          { id: uid(), type: "text", label: "Комментарий", required: true },
        ],
      }],
    };
  }
  return {
    id: uid(), type: "question", title: "Новый вопрос", required: true, options: ["Да", "Нет"],
  };
}

interface Props {
  initial: OpeningPointConfig;
  onSave: (config: OpeningPointConfig) => Promise<void>;
  onCancel?: () => void;
}

export default function OpeningConfigEditor({ initial, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(initial.title);
  const [steps, setSteps] = useState<OpeningStep[]>(initial.steps);
  const [mode, setMode] = useState<"platform" | "external">(initial.photo_storage.mode);
  const [externalUrl, setExternalUrl] = useState(initial.photo_storage.external_folder_url ?? "");
  const [saving, setSaving] = useState(false);

  const move = (idx: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev];
      const to = idx + dir;
      if (to < 0 || to >= next.length) return prev;
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
  };

  const updateStep = (id: string, patch: Partial<OpeningStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? ({ ...s, ...patch } as OpeningStep) : s)));
  };

  const removeStep = (id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  };

  const save = async () => {
    setSaving(true);
    try {
      const config: OpeningPointConfig = {
        version: 1,
        setup_completed: true,
        title: title.trim() || "Открытие торговой точки",
        photo_storage: { mode, external_folder_url: externalUrl || undefined },
        steps,
      };
      await onSave(config);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-muted-foreground">Название процесса</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Хранение фото</label>
        <div className="mt-1 inline-flex rounded-md border border-border p-0.5 text-xs">
          <button
            className={`rounded px-2 py-1 ${mode === "platform" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => setMode("platform")}
          >
            В приложении
          </button>
          <button
            className={`rounded px-2 py-1 ${mode === "external" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => setMode("external")}
          >
            Внешняя папка
          </button>
        </div>
        {mode === "external" && (
          <input
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            placeholder="Ссылка на папку"
            className="w-full mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          />
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground">Шаги ({steps.length})</span>
          <span className="text-[10px] text-muted-foreground">до 25</span>
        </div>
        <div className="mt-1 space-y-2">
          {steps.map((s, idx) => (
            <div key={s.id} className="rounded-lg border border-border bg-card p-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-4">{idx + 1}.</span>
                <input
                  value={s.title}
                  onChange={(e) => updateStep(s.id, { title: e.target.value } as Partial<OpeningStep>)}
                  className="flex-1 min-w-0 bg-muted rounded px-2 py-1 text-sm text-foreground"
                />
                <span className="text-[9px] text-muted-foreground uppercase shrink-0">
                  {s.type === "photo" ? "фото" : s.type === "question" ? "вопрос" : "текст"}
                </span>
                <button onClick={() => move(idx, -1)} className="p-1 text-muted-foreground"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button onClick={() => move(idx, 1)} className="p-1 text-muted-foreground"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button onClick={() => removeStep(s.id)} className="p-1 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              {s.type === "photo" && (
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <input
                    value={s.description}
                    onChange={(e) => updateStep(s.id, { description: e.target.value } as Partial<OpeningStep>)}
                    placeholder="Инструкция"
                    className="flex-1 bg-muted rounded px-2 py-1 text-foreground"
                  />
                  <label className="flex items-center gap-1 text-muted-foreground">
                    макс. фото
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={s.max_photos}
                      onChange={(e) => updateStep(s.id, { max_photos: Math.min(5, Math.max(1, Number(e.target.value) || 1)) } as Partial<OpeningStep>)}
                      className="w-12 bg-muted rounded px-1 py-0.5 text-foreground"
                    />
                  </label>
                </div>
              )}
              {s.type === "question" && (
                <div className="mt-1 flex items-center gap-1 text-xs flex-wrap">
                  <span className="text-muted-foreground">Варианты:</span>
                  {(s.options ?? []).map((o, oi) => (
                    <input
                      key={oi}
                      value={o}
                      onChange={(e) => {
                        const opts = [...(s.options ?? [])];
                        opts[oi] = e.target.value;
                        updateStep(s.id, { options: opts } as Partial<OpeningStep>);
                      }}
                      className="w-20 bg-muted rounded px-1 py-0.5 text-foreground"
                    />
                  ))}
                  {(s as any).followups && (s as any).followups.length > 0 && (
                    <span className="text-[9px] text-muted-foreground ml-1">
                      follow-up при «{((s as any).followups[0]).when_option}»
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={() => setSteps((p) => [...p, newStep("photo")])} className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs text-foreground">
            <Camera className="w-3.5 h-3.5" /> Фото
          </button>
          <button onClick={() => setSteps((p) => [...p, newStep("question")])} className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs text-foreground">
            <HelpCircle className="w-3.5 h-3.5" /> Вопрос Да/Нет
          </button>
          <button onClick={() => setSteps((p) => [...p, newStep("cash")])} className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs text-foreground">
            <ChevronDown className="w-3.5 h-3.5" /> Сверка кассы
          </button>
          <button onClick={() => setSteps((p) => [...p, newStep("text")])} className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs text-foreground">
            <MessageSquare className="w-3.5 h-3.5" /> Комментарий
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving || steps.length === 0}
          className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" /> Сохранить
        </button>
        {onCancel && (
          <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-muted text-foreground text-sm">
            Отмена
          </button>
        )}
      </div>
    </div>
  );
}
