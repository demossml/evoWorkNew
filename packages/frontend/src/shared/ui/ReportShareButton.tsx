import { useState, useCallback, type RefObject } from "react";
import { Copy, Check, Loader, Share } from "lucide-react";

interface ReportShareButtonProps {
  targetRef: RefObject<HTMLDivElement | null>;
  filename?: string;
}

type ShareState = "idle" | "generating" | "uploading" | "done" | "error";

export function ReportShareButton({ targetRef, filename = "report" }: ReportShareButtonProps) {
  const [state, setState] = useState<ShareState>("idle");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    if (!targetRef.current) return;
    setState("generating");
    setShareUrl(null);

    try {
      const { toJpeg } = await import("html-to-image");
      const dataUrl = await toJpeg(targetRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        quality: 0.92,
      });

      setState("uploading");
      const imgRes = await fetch(dataUrl);
      const blob = await imgRes.blob();

      const formData = new FormData();
      formData.append("file", blob, `${filename}.jpg`);

      const res = await fetch("/api/evotor/share-report", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const fullUrl = `${window.location.origin}${data.url}`;
      setShareUrl(fullUrl);
      setState("done");
    } catch {
      setState("error");
    }
  }, [targetRef, filename]);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }, [shareUrl]);

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      {state === "error" && (
        <div className="text-xs text-red-500">Ошибка, попробуй ещё раз</div>
      )}

      {state === "done" && shareUrl ? (
        <div className="w-full flex items-center gap-2 rounded-xl bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 px-3 py-2">
          <span className="text-xs text-green-700 dark:text-green-300 truncate flex-1">
            {shareUrl}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-green-100 dark:hover:bg-green-900 transition-colors"
            title="Копировать ссылку"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
            ) : (
              <Copy className="w-4 h-4 text-green-600 dark:text-green-400" />
            )}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleShare}
          disabled={state === "generating" || state === "uploading"}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 text-sm font-semibold hover:from-blue-700 hover:to-blue-800 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-md shadow-blue-900/20"
        >
          {state === "generating" ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Генерирую...
            </>
          ) : state === "uploading" ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Загружаю...
            </>
          ) : (
            <>
              <Share className="w-4 h-4" />
              Поделиться отчётом
            </>
          )}
        </button>
      )}
    </div>
  );
}
