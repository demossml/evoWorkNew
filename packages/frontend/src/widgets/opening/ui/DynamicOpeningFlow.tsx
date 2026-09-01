import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import PhotoUpload from "./PhotoUpload";
import type { OpeningAnswer, OpeningPointConfig, OpeningStep } from "../../../pages/opening/types";
import { getAuthHeaders } from "@shared/api";

interface Props {
  config: OpeningPointConfig;
  userId: string;
  selectedShop: string | null;
  onFinish: (answers: OpeningAnswer[], cashResult: { ok: boolean; discrepancy: { amount: string; type: "+" | "-" } | null }) => void;
}

async function uploadPhotos(files: File[], stepId: string, userId: string, shopUuid: string): Promise<string[]> {
  const ids: string[] = [];
  for (const file of files) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", stepId);
    fd.append("userId", userId);
    fd.append("shopUuid", shopUuid);
    fd.append("fileKey", `${stepId}_${file.name}_${file.size}`);
    try {
      const res = await fetch("/api/uploads/upload-photos", { method: "POST", body: fd });
      if (res.ok) {
        const data = (await res.json()) as { id?: string; file_id?: string; fileId?: string };
        const id = data.id ?? data.file_id ?? data.fileId;
        if (id) ids.push(String(id));
      }
    } catch {
      /* ignore single photo upload error */
    }
  }
  return ids;
}

export default function DynamicOpeningFlow({ config, userId, selectedShop, onFinish }: Props) {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<OpeningAnswer[]>([]);
  const [photoFiles, setPhotoFiles] = useState<Record<string, File[]>>({});
  const [questionChoice, setQuestionChoice] = useState<Record<string, string>>({});
  const [followupValues, setFollowupValues] = useState<Record<string, Record<string, string | number>>>({});
  const [textValues, setTextValues] = useState<Record<string, string>>({});
  const [finishing, setFinishing] = useState(false);

  const steps = useMemo(() => config.steps, [config]);
  const step: OpeningStep | undefined = steps[idx];
  const isLast = idx === steps.length - 1;

  // ── gates ──
  const stepValid = (() => {
    if (!step) return false;
    if (step.type === "photo") {
      const n = photoFiles[step.id]?.length ?? 0;
      return step.required ? n >= 1 : true;
    }
    if (step.type === "question") {
      if (step.required && !questionChoice[step.id]) return false;
      const choice = questionChoice[step.id];
      const followup = step.followups?.find((f) => f.when_option === choice);
      if (followup) {
        const vals = followupValues[step.id] ?? {};
        return followup.fields.every((f) => (f.required ? String(vals[f.id] ?? "").trim() !== "" : true));
      }
      return true;
    }
    if (step.type === "text") {
      return step.required ? (textValues[step.id] ?? "").trim() !== "" : true;
    }
    return true;
  })();

  const buildAnswer = (s: OpeningStep): OpeningAnswer | null => {
    if (s.type === "photo") return { step_id: s.id, photo_ids: [] };
    if (s.type === "question") {
      const option = questionChoice[s.id];
      if (!option) return null;
      return { step_id: s.id, option, followup: followupValues[s.id] };
    }
    return { step_id: s.id, text: textValues[s.id] ?? "" };
  };

  const next = async () => {
    if (!step) return;
    const answer = buildAnswer(step);
    if (answer) {
      setAnswers((prev) => [...prev.filter((a) => a.step_id !== step.id), answer]);
    }
    if (!isLast) {
      setIdx((i) => i + 1);
      return;
    }
    // finish: upload photos + finish-opening
    setFinishing(true);
    try {
      const finalAnswers = [...answers];
      if (answer) {
        const i = finalAnswers.findIndex((a) => a.step_id === step.id);
        if (i >= 0) finalAnswers[i] = answer; else finalAnswers.push(answer);
      }
      // загружаем фото platform-mode
      if (config.photo_storage.mode === "platform") {
        for (const s of config.steps) {
          if (s.type !== "photo") continue;
          const files = photoFiles[s.id] ?? [];
          if (files.length > 0) {
            const ids = await uploadPhotos(files, s.id, userId, selectedShop ?? "");
            finalAnswers.push({ step_id: s.id, photo_ids: ids });
          }
        }
      }
      onFinish(finalAnswers, { ok: true, discrepancy: null });
    } finally {
      setFinishing(false);
    }
  };

  if (!step) {
    return <div className="text-sm text-muted-foreground">Нет шагов</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Шаг {idx + 1} из {steps.length}
        </span>
        {idx > 0 && (
          <button onClick={() => setIdx((i) => i - 1)} className="flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowLeft className="w-3.5 h-3.5" /> Назад
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={step.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
          {step.type === "photo" && (
            <div>
              <h2 className="text-lg font-semibold">{step.title}</h2>
              {step.description && <p className="text-sm text-muted-foreground mt-1">{step.description}</p>}
              <div className="mt-3">
                <PhotoUpload
                  label="Фото"
                  maxFiles={step.max_photos}
                  files={photoFiles[step.id] ?? []}
                  onChange={(files) => setPhotoFiles((p) => ({ ...p, [step.id]: files }))}
                />
              </div>
            </div>
          )}

          {step.type === "question" && (
            <div>
              <h2 className="text-lg font-semibold">{step.title}</h2>
              <div className="mt-3 space-y-2">
                {step.options.map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`q-${step.id}`}
                      checked={questionChoice[step.id] === opt}
                      onChange={() => setQuestionChoice((p) => ({ ...p, [step.id]: opt }))}
                    />
                    {opt}
                  </label>
                ))}
              </div>
              {step.followups?.map((f) =>
                questionChoice[step.id] === f.when_option ? (
                  <div key={f.when_option} className="mt-3 space-y-2 border-t border-border pt-3">
                    {f.fields.map((field) => (
                      <div key={field.id}>
                        <label className="text-xs text-muted-foreground">
                          {field.label}{field.required ? " *" : ""}
                        </label>
                        <input
                          type={field.type === "number" ? "number" : "text"}
                          className="w-full mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                          value={String((followupValues[step.id] ?? {})[field.id] ?? "")}
                          onChange={(e) => {
                            const v = field.type === "number" ? Number(e.target.value) : e.target.value;
                            setFollowupValues((p) => ({ ...p, [step.id]: { ...(p[step.id] ?? {}), [field.id]: v } }));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                ) : null,
              )}
            </div>
          )}

          {step.type === "text" && (
            <div>
              <h2 className="text-lg font-semibold">{step.title}</h2>
              {step.description && <p className="text-sm text-muted-foreground mt-1">{step.description}</p>}
              <textarea
                className="w-full mt-3 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground min-h-[100px]"
                value={textValues[step.id] ?? ""}
                onChange={(e) => setTextValues((p) => ({ ...p, [step.id]: e.target.value }))}
              />
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <button
        onClick={next}
        disabled={!stepValid || finishing}
        className="w-full px-4 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {finishing ? "Сохранение…" : isLast ? (<><Check className="w-4 h-4" /> Завершить</>) : (<>Далее <ArrowRight className="w-4 h-4" /></>)}
      </button>
    </div>
  );
}
