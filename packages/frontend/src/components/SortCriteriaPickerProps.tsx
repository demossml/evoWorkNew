import type React from "react";
import { useState } from "react";

interface SortCriteriaPickerProps {
  onSortChange: (criteria: string) => void;
}

export const SortCriteriaPicker: React.FC<SortCriteriaPickerProps> = ({
  onSortChange,
}) => {
  const [sortCriteria, setSortCriteria] = useState<string>("sum"); // Новый стейт для критерия сортировки

  // Определяем доступные критерии сортировки
  const criteriaOptions = [
    { value: "sum", label: "₽" },
    { value: "quantity", label: "количеству" },
    { value: "name", label: "наименованию" },
  ];

  // Обработчик нажатия на плитку
  const handleClick = (value: string) => {
    setSortCriteria(value); // Устанавливаем выбранный критерий
    onSortChange(value); // Сообщаем родителю об изменении
  };

  return (
    <div>
      <div className="flex items-center justify-between w-full mb-4">
        <span className="text-muted-foreground text-sm">
          Критерий сортировки
        </span>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {criteriaOptions.map((option) => (
          <button
            key={option.value}
            className={`
             flex 
                items-center 
                justify-center 
                px-3 
                py-2 
                rounded-md 
                text-center
                dark:text-muted-foreground 
                border-2 
            ${
              sortCriteria === option.value
                ? "border-primary dark:border-blue-400"
                : "border-border"
            } 
            transition-colors 
                duration-300 
                ease-in-out
                min-w-max
                h-7
                whitespace-nowrap
          `}
            onClick={() => handleClick(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
};
