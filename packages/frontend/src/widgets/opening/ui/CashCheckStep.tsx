// CashCheckStep.tsx
import { useState, useEffect } from "react";
import CashDiscrepancyForm from "./CashDiscrepancyForm";
import type {
  StoreOpeningStep,
  CashDiscrepancyData,
} from "../../../pages/opening/types";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateDashboardQueries } from "@shared/api";
import { finishOpening } from "@features/opening/api";

interface CashCheckStepProps {
  setCurrentStep: React.Dispatch<React.SetStateAction<StoreOpeningStep>>;
  userId: string;
  selectedShop: string | null;
}

export default function CashCheckStep({
  setCurrentStep,
  userId,
  selectedShop,
}: CashCheckStepProps) {
  const queryClient = useQueryClient();
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [discrepancy, setDiscrepancy] = useState<CashDiscrepancyData>({
    amount: "",
    type: "+",
  });

  // Автоматическая прокрутка вверх при монтировании компонента
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const finish = async () => {
    if (isCorrect === false) {
      const amount = Number(discrepancy.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setErrorMessage("Введите корректную сумму расхождения");
        return;
      }
    }

    try {
      setErrorMessage(null);
      setIsSubmitting(true);
      if (!selectedShop) {
        throw new Error("Сначала выберите магазин");
      }
      await finishOpening({
        ok: isCorrect,
        discrepancy: isCorrect ? null : discrepancy,
        userId,
        shopUuid: selectedShop,
      });
      await Promise.all([
        invalidateDashboardQueries(queryClient),
        queryClient.invalidateQueries({ queryKey: ["isOpenStore"] }),
      ]);

      setCurrentStep("initial");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Не удалось завершить открытие. Повторите попытку."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Проверка кассы</h2>

      {errorMessage && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="space-y-2">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="cash"
            checked={isCorrect === true}
            onChange={() => setIsCorrect(true)}
          />
          Касса сходится
        </label>

        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="cash"
            checked={isCorrect === false}
            onChange={() => setIsCorrect(false)}
          />
          Касса не сходится
        </label>
      </div>

      {isCorrect === false && (
        <CashDiscrepancyForm data={discrepancy} setData={setDiscrepancy} />
      )}

      <div className="flex gap-2">
        <button
          className="flex-1 py-3 bg-gray-200 text-gray-800 rounded-xl shadow"
          onClick={() => setCurrentStep("photos")}
          disabled={isSubmitting}
        >
          Назад к фото
        </button>
        <button
          className="flex-1 py-3 bg-blue-600 text-white rounded-xl shadow"
          onClick={finish}
          disabled={isCorrect === null || isSubmitting}
        >
          {isSubmitting ? "Сохраняю..." : "Завершить открытие"}
        </button>
      </div>
    </div>
  );
}
