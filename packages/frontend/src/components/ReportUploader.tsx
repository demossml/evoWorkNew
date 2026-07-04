import {
  useCallback,
  useState,
  forwardRef,
  type MutableRefObject,
} from "react";
import { generatePdfFromFile } from "@features/reports/api";

interface ReportUploaderProps {
  children?: React.ReactNode;
}

const ReportUploader = forwardRef<HTMLDivElement, ReportUploaderProps>(
  ({ children }, ref) => {
    const [logs, setLogs] = useState<string[]>([]);
    const [uploading, setUploading] = useState(false);

    const addLog = (message: string) => {
      console.log(message);
      setLogs((prevLogs) => [...prevLogs, message]);
    };

    // ReportUploader.tsx
    const uploadImage = useCallback(async () => {
      const containerRef = ref as MutableRefObject<HTMLDivElement | null>;

      if (!containerRef?.current) {
        addLog("Ошибка: контейнер не найден.");
        return;
      }

      // Проверка содержимого контейнера
      if (containerRef.current.offsetHeight === 0) {
        addLog("Ошибка: контейнер не содержит видимого содержимого");
        return;
      }

      setUploading(true);
      addLog("Создание изображения...");

      try {
        const { toPng } = await import("html-to-image");
        // Добавляем задержку для завершения рендеринга
        await new Promise((resolve) => setTimeout(resolve, 300));

        const dataUrl = await toPng(containerRef.current, {
          cacheBust: true,
          filter: (node) => {
            // Игнорируем кнопки и элементы управления
            return !node.classList?.contains("no-print");
          },
        });

        // Проверка Data URL
        if (!dataUrl.startsWith("data:image/png")) {
          throw new Error("Некорректный формат изображения");
        }

        // Преобразование в Blob
        const blob = await fetch(dataUrl).then((res) => res.blob());

        // Валидация Blob
        if (blob.size === 0) {
          throw new Error("Создан пустой файл");
        }

        // Создаем File с явным указанием типа
        const file = new File([blob], "report.png", {
          type: "image/png",
          lastModified: Date.now(),
        });

        // Логирование перед отправкой
        addLog(`Отправка файла: ${file.name} (${file.size} байт)`);

        // Отправка на сервер
        await generatePdfFromFile(file);

        addLog("Изображение успешно отправлено!");
      } catch (err) {
        addLog(
          `Ошибка: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`
        );

        // Дополнительная диагностика
        if (
          err instanceof Error &&
          err.message.includes("Некорректный формат")
        ) {
          console.error("Ошибка преобразования контейнера в изображение");
        }
      } finally {
        setUploading(false);
      }
    }, [ref]);

    return (
      <div>
        {/* Контент для скриншота */}
        <div ref={ref}>{children}</div>

        <button
          onClick={uploadImage}
          className={`mt-4 px-4 py-2 text-white rounded ${
            uploading ? "bg-gray-500" : "bg-blue-500 hover:bg-blue-700"
          }`}
          disabled={uploading}
        >
          {uploading ? "Отправка..." : "Отправить отчет"}
        </button>

        <div className="mt-4 p-2 bg-gray-200 rounded text-sm">
          <h3 className="font-semibold">Логи:</h3>
          <ul>
            {logs.map((log, index) => (
              <li key={index}>• {log}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }
);

export default ReportUploader;
