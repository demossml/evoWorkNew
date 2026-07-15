import type React from "react";

interface TableData {
  [key: string]: string | number;
}

interface DownloadTableButtonProps {
  data: TableData[];
  fileName: string;
}

function jsonToCsv(data: TableData[]): string {
  if (data.length === 0) return "";
  const keys = Object.keys(data[0]);
  const header = keys.join(",");
  const rows = data.map(row =>
    keys.map(k => {
      const v = row[k];
      if (typeof v === "string" && (v.includes(",") || v.includes("\"") || v.includes("\n")))
        return `"${v.replace(/"/g, "\"\"")}"`;
      return String(v ?? "");
    }).join(",")
  );
  return "\uFEFF" + header + "\n" + rows.join("\n");
}

const DownloadTableButton: React.FC<DownloadTableButtonProps> = ({
  data,
  fileName,
}) => {
  const handleDownload = () => {
    const csv = jsonToCsv(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleDownload}
      className="m-2 px-3 py-1 bg-primary text-primary-foreground font-semibold rounded-lg shadow-md hover:bg-primary/90 transition-all"
    >
      Скачать таблицу (.csv)
    </button>
  );
};

export default DownloadTableButton;
