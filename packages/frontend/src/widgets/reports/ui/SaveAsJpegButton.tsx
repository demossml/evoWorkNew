import { Button } from "@/components/ui/button";
import { useRef, useState, useEffect } from "react";
import { Save, Loader } from "lucide-react";
import { telegram, isTelegramMiniApp } from "@/helpers/telegram.ts";
import { uploadReportImage } from "@features/reports/api";

interface SaveAsJpegButtonProps {
  children: React.ReactNode;
  fileName?: string;
}

export const SaveAsJpegButton: React.FC<SaveAsJpegButtonProps> = ({
  children,
  fileName = "report.jpeg",
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isMiniApp = isTelegramMiniApp();

  // console.log("isTelegramMiniApp", isTelegramMiniApp);

  // Инициализация при монтировании компонента
  useEffect(() => {
    if (isMiniApp) {
      // Настройка темы
      const theme = telegram.WebApp.colorScheme;
      document.documentElement.classList.toggle("dark", theme === "dark");

      // Установка цвета фона
      telegram.WebApp.setBackgroundColor(
        theme === "dark" ? "#1f2937" : "#2563eb"
      );

      // Настройка главной кнопки
      telegram.WebApp.MainButton.setText("Сохранить как JPEG");
      telegram.WebApp.MainButton.onClick(handleSaveAsJpeg);
      telegram.WebApp.MainButton.show();

      return () => {
        // Очистка при размонтировании
        telegram.WebApp.MainButton.offClick(handleSaveAsJpeg);
        telegram.WebApp.MainButton.hide();
      };
    }
  }, []);

  // Функция для сохранения блока как JPEG
  const handleSaveAsJpeg = async () => {
    if (!contentRef.current) return;

    try {
      setIsLoading(true);

      // Тактильная отдача при начале процесса
      if (isMiniApp) {
        telegram.WebApp.HapticFeedback.impactOccurred("light");
        telegram.WebApp.MainButton.showProgress();
      }

      const { toJpeg } = await import("html-to-image");
      // Генерируем изображение
      const dataUrl = await toJpeg(contentRef.current, {
        quality: 0.95,
        backgroundColor: "#ffffff",
      });

      // Преобразуем base64 в Blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], fileName, { type: "image/jpeg" });

      if (isMiniApp) {
        try {
          const uploadUrl = await uploadReportImage(file);

          // Успешная тактильная отдача
          telegram.WebApp.HapticFeedback.notificationOccurred("success");

          // Открываем ссылку
          telegram.WebApp.openLink(uploadUrl);

          console.log("File uploaded successfully. URL:", uploadUrl);
        } catch (err) {
          console.error(
            "Ошибка при загрузке файла через Telegram Mini App:",
            err
          );

          // Тактильная отдача ошибки
          telegram.WebApp.HapticFeedback.notificationOccurred("error");

          telegram.WebApp.showAlert(
            `Не удалось отправить файл: ${err instanceof Error ? err.message : String(err)}`
          );
        } finally {
          // Скрываем индикатор загрузки
          if (telegram.WebApp.MainButton.isVisible) {
            telegram.WebApp.MainButton.hideProgress();
          }
        }
      } else {
        // Для обычного браузера - просто скачиваем файл
        const link = document.createElement("a");
        link.download = fileName;
        link.href = dataUrl;
        link.click();
      }
    } catch (error) {
      console.error("Ошибка при сохранении JPEG:", error);
      if (isMiniApp) {
        telegram.WebApp.HapticFeedback.notificationOccurred("error");
        telegram.WebApp.showAlert("Ошибка при генерации изображения.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Контент, который будем сохранять */}
      <div
        ref={contentRef}
        className="bg-custom-gray dark:bg-gray-800 p-4 rounded-lg shadow-md"
      >
        {children}
      </div>

      {/* Кнопка сохранения - показываем только в обычном браузере */}
      {!isTelegramMiniApp && (
        <Button
          onClick={handleSaveAsJpeg}
          disabled={isLoading}
          className="w-full mt-2 bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-400 dark:text-gray-300 rounded-md flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Сохранение...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Сохранить как JPEG
            </>
          )}
        </Button>
      )}
    </div>
  );
};
