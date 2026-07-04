import { useState, useCallback, type RefObject } from "react";

interface ReportShareButtonProps {
  targetRef: RefObject<HTMLDivElement | null>;
  filename?: string;
}

type ShareState = "idle" | "generating" | "uploading" | "error";

export function ReportShareButton({ targetRef, filename = "report" }: ReportShareButtonProps) {
  const [state, setState] = useState<ShareState>("idle");

  const handleShare = useCallback(async () => {
    if (!targetRef.current) return;
    setState("generating");

    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(targetRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
      });

      setState("uploading");
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.92)
      );

      const formData = new FormData();
      formData.append("file", blob, `${filename}.jpg`);

      const res = await fetch("/api/evotor/share-report", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      window.open(`${window.location.origin}${data.url}`, "_blank");
      setState("idle");
    } catch {
      setState("error");
    }
  }, [targetRef, filename]);

  return (
    <div className="flex flex-col items-center gap-1">
      {state === "error" && (
        <div className="text-xs text-red-500">Ошибка, попробуй ещё раз</div>
      )}
      <button
        type="button"
        onClick={handleShare}
        disabled={state === "generating" || state === "uploading"}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 text-sm font-semibold hover:from-blue-700 hover:to-blue-800 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-md shadow-blue-900/20"
      >
        {state === "generating"
          ? "⏳ Генерирую..."
          : state === "uploading"
            ? "📤 Загружаю..."
            : "📤 Поделиться отчётом"}
      </button>
    </div>
  );
}
