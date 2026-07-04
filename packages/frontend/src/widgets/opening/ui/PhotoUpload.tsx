import { useState, useEffect } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";

export interface UploadStatus {
  progress: number;
  status: "compressing" | "uploading" | "success" | "error"; // Добавлен статус "compressing"
}

export interface PhotoUploadProps {
  label: string;
  maxFiles?: number;
  files: File[];
  uploadStatuses?: UploadStatus[];
  onChange: (files: File[]) => void;
  onRemove?: (file: File, index: number) => void;
}

export default function PhotoUpload({
  label,
  maxFiles = Number.POSITIVE_INFINITY,
  files,
  uploadStatuses = [],
  onChange,
  onRemove,
}: PhotoUploadProps) {
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setLoading(true);

    const incoming = Array.from(e.target.files);
    const availableSlots = maxFiles - files.length;
    const filesToAdd = incoming.slice(0, availableSlots);

    e.target.value = "";

    await new Promise((res) => setTimeout(res, 120));
    onChange([...files, ...filesToAdd]);

    setLoading(false);
  };

  const removePhoto = (index: number) => {
    const file = files[index];
    const updated = files.filter((_, i) => i !== index);
    onChange(updated);
    if (onRemove && file) onRemove(file, index);
  };

  const getStatus = (i: number) =>
    uploadStatuses?.[i] ?? { progress: 100, status: "success" as const };

  const isDisabled = loading || files.length >= maxFiles;

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
      {/* Заголовок */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-800 dark:text-gray-200 font-medium">
          {label}
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {files.length}/{maxFiles}
        </span>
      </div>

      {/* Кнопка загрузки */}
      <label>
        <div
          className={`
            w-full py-3 rounded-xl border border-dashed text-sm font-medium
            flex items-center justify-center gap-2 transition-all select-none
            active:scale-[0.97]
            ${
              isDisabled
                ? "border-gray-300 bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                : "border-gray-400 dark:border-gray-500 hover:border-gray-500 dark:hover:border-gray-400 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 cursor-pointer"
            }
          `}
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Загрузка...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5" />
              <span className="text-xs">Добавить фото</span>
            </div>
          )}
        </div>

        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple={maxFiles > 1}
          disabled={isDisabled}
          onChange={handleFileSelect}
          className="hidden"
        />
      </label>

      {/* Превью изображений */}
      {files.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {files.map((file, i) => {
            const status = getStatus(i);
            const preview = previewUrls[i];

            const isCompressing = status.status === "compressing";
            const isUploading = status.status === "uploading";
            const isError = status.status === "error";
            const isSuccess = status.status === "success";

            return (
              <div
                key={i}
                className="relative rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 shadow-sm"
              >
                <img
                  src={preview}
                  className="h-full w-full object-cover"
                  alt=""
                />

                {/* Оверлей статуса */}
                {(isCompressing || isUploading || isError || isSuccess) && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    {isCompressing && (
                      <div className="text-center text-white">
                        <div className="w-10 h-10 border-4 border-gray-200 border-t-white rounded-full animate-spin mx-auto mb-1" />
                        <div className="text-xs font-medium">Сжатие...</div>
                      </div>
                    )}

                    {isUploading && (
                      <div className="text-center text-white">
                        <div className="w-10 h-10 border-4 border-gray-200 border-t-white rounded-full animate-spin mx-auto mb-1" />
                        <div className="text-xs font-medium">
                          {Math.round(status.progress)}%
                        </div>
                      </div>
                    )}

                    {isSuccess && (
                      <div className="text-white text-center">
                        <div className="text-2xl">✅</div>
                        <div className="text-xs opacity-90">Готово</div>
                      </div>
                    )}

                    {isError && (
                      <div className="text-white text-center">
                        <div className="text-2xl">❌</div>
                        <div className="text-xs">Ошибка</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Прогресс-бар - показываем только для загрузки, не для сжатия */}
                {isUploading && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gray-400 dark:bg-gray-600 h-1">
                    <div
                      className="h-1 bg-blue-500 transition-all"
                      style={{ width: `${status.progress}%` }}
                    />
                  </div>
                )}

                {/* Кнопка удаления */}
                <button
                  onClick={() => removePhoto(i)}
                  disabled={isCompressing}
                  className={`
                    absolute top-2 right-2 w-8 h-8 rounded-full
                    flex items-center justify-center
                    text-white transition-all
                    shadow-md
                    ${
                      isCompressing
                        ? "bg-gray-400 dark:bg-gray-500 cursor-not-allowed"
                        : "bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
                    }
                  `}
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                {/* Футер */}
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2 text-white">
                  <div className="text-xs truncate">{file.name}</div>
                  <div className="text-xs opacity-80">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Лимит */}
      {files.length >= maxFiles && (
        <div className="text-xs text-orange-600 dark:text-orange-400 text-center">
          Достигнут лимит фото
        </div>
      )}
    </div>
  );
}
