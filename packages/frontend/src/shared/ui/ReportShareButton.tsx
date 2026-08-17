import { useState, useCallback, type RefObject } from "react";
import { Copy, Check, Loader, Share } from "lucide-react";
import { getAuthHeaders } from "@shared/api";

interface ReportShareButtonProps {
  targetRef: RefObject<HTMLDivElement | null>;
  filename?: string;
  /** Подпись кнопки (по умолчанию «Поделиться отчётом») */
  label?: string;
}

type ShareState = "idle" | "generating" | "uploading" | "done" | "error";

export function ReportShareButton({ targetRef, filename = "report", label = "Поделиться отчётом" }: ReportShareButtonProps) {
  const [state, setState] = useState<ShareState>("idle");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleShare = useCallback(async () => {
    if (!targetRef.current) return;
    setState("generating");
    setShareUrl(null);
    setErrorMsg(null);

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

      // auth-заголовки; для FormData — без Content-Type (boundary сам)
      const h = getAuthHeaders();
      delete h["Content-Type"];

      const res = await fetch("/api/evotor/share-report", {
        method: "POST",
        headers: h,
        body: formData,
      });

      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const data = await res.json();
      const fullUrl = `${window.location.origin}${data.url}`;
      setShareUrl(fullUrl);
      setState("done");
    } catch (err: any) {
      setErrorMsg(err?.message || "Ошибка загрузки");
      setState("error");
    }
  }, [targetRef, filename]);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // fallback без clipboard API
      const ta = document.createElement("textarea");
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }, [shareUrl]);

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      {state === "error" && (
        <div className="text-xs text-red-500">
          Ошибка: {errorMsg || "попробуй ещё раз"}
        </div>
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
              {label}
            </>
          )}
        </button>
      )}
    </div>
  );
}
