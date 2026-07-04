import type React from "react";
import { GoBackButton } from "@shared/ui/navigation";

// Компонент отображения ошибки
type ErrorDisplayProps = {
  error: string;
};

export const ErrorState: React.FC<ErrorDisplayProps> = ({ error }) => {
  const message = /AbortError|timeout/i.test(error)
    ? "Время ожидания ответа истекло. Попробуйте еще раз."
    : error;
  return (
    <div className="app-page relative p-4">
      {/* Контейнер для кнопки "Назад", расположенной в верхнем левом углу */}
      <div className="absolute top-4 left-4">
        <GoBackButton />
      </div>

      {/* Основной контент */}
      <div className="flex min-h-full flex-col items-center justify-center">
        {/* Сообщение об ошибке */}
        <div className="text-red-500 text-center font-semibold mt-4 dark:text-red-400">
          Ошибка: {message}
        </div>
      </div>
    </div>
  );
};
