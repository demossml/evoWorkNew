// SendToTelegramButton.tsx
import type React from "react";
import { generatePdfFromHtml } from "@features/reports/api";

interface SendToTelegramButtonProps {
  html: string; // Тип для html пропса
}

const SendToTelegramButton: React.FC<SendToTelegramButtonProps> = ({
  html,
}) => {
  const sendToTelegram = async () => {
    alert(`Отправляем HTML: ${html}`);

    if (!html?.trim()) {
      alert("Нет данных для отправки");
      return;
    }

    try {
      await generatePdfFromHtml(html);
      alert("Отчёт отправлен в Telegram!");
    } catch {
      alert("Ошибка отправки.");
    }
  };

  return (
    <button
      onClick={sendToTelegram}
      className="text-blue-500  dark:text-blue-400 text-sm font-semibold flex items-center"
    >
      <span className="mr-2">←</span> Отпарить в Telegram
    </button>
  );
};

export default SendToTelegramButton;
