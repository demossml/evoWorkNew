// SendToTelegramButton.tsx
import { useState } from "react";
import type React from "react";
import { generatePdfFromHtml } from "@features/reports/api";

interface SendToTelegramButtonProps {
  html: string; // Тип для html пропса
}

const SendToTelegramButton: React.FC<SendToTelegramButtonProps> = ({
  html,
}) => {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const sendToTelegram = async () => {
    if (!html?.trim()) {
      setError("Нет данных для отправки");
      return;
    }
    setSending(true);
    setError(null);
    setSent(false);
    try {
      await generatePdfFromHtml(html);
      setSent(true);
    } catch {
      setError("Ошибка отправки в Telegram.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={sendToTelegram}
        disabled={sending}
        className="text-blue-500 dark:text-blue-400 text-sm font-semibold flex items-center disabled:opacity-50"
      >
        <span className="mr-2">←</span>
        {sending ? "Отправляю..." : "Отправить в Telegram"}
      </button>
      {sent && (
        <span className="text-xs text-emerald-500">Отчёт отправлен в Telegram</span>
      )}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
};

export default SendToTelegramButton;
