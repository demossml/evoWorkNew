import type React from "react";

// Типизация данных таблицы
interface TableData {
  [key: string]: string | number;
}

interface DownloadTableButtonProps {
  data: TableData[]; // Данные для скачивания
  fileName: string; // Имя файла для скачивания
}

const DownloadTableButton: React.FC<DownloadTableButtonProps> = ({
  data,
  fileName,
}) => {
  // Функция для скачивания
  const handleDownload = async () => {
    const XLSX = await import("xlsx");
    // Создание рабочей книги из данных
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");

    // Генерация файла и скачивание
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  };

  return (
    <button
      onClick={handleDownload}
      className="m-2 px-3 py-1 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-all"
    >
      Скачать таблицу (.xlsx)
    </button>
  );
};

export default DownloadTableButton;
