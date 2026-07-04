import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import PhotoUpload from "./PhotoUpload";
import type { StoreOpeningStep } from "../../../pages/opening/types";
import {
  addToUploadQueue,
  getUploadQueue,
  getUploadStats,
  markFileRetry,
  type QueuedFile,
  removeFromQueue,
  updateFileStatus,
  getPendingFiles,
  clearUploadQueue,
} from "../../../helpers/uploadQueue";
import { startBackgroundUpload } from "../../../helpers/backgroundUploader";

interface PhotoStepProps {
  setCurrentStep: React.Dispatch<React.SetStateAction<StoreOpeningStep>>;
  userId: string;
  selectedShop: string | null;
}

export interface PhotoFiles {
  area: File[];
  stock: File[];
  cash: File[];
  mrc: File[];
}

interface FileUploadStatus {
  [fileName: string]: {
    progress: number;
    status: "compressing" | "uploading" | "success" | "error";
    category: keyof PhotoFiles;
  };
}

type QueueStats = {
  total: number;
  pending: number;
  uploading: number;
  success: number;
  error: number;
  byCategory: Record<string, number>;
};

// Функция для сжатия изображения в JPEG (стабильнее для AI-анализа)
const compressImage = async (file: File, quality = 0.72): Promise<File> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      resolve(file);
      return;
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      // Оптимальные настройки для фотографий магазина
      const MAX_WIDTH = 1200;
      const MAX_HEIGHT = 800;

      let { width, height } = img;

      // Масштабируем если изображение слишком большое
      if (width > MAX_WIDTH || height > MAX_HEIGHT) {
        const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
        width *= ratio;
        height *= ratio;
      }

      canvas.width = width;
      canvas.height = height;

      ctx?.drawImage(img, 0, 0, width, height);

      // Конвертируем в JPEG
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressedFile = new File(
              [blob],
              file.name.replace(/\.[^/.]+$/, ".jpg"),
              { type: "image/jpeg" }
            );
            resolve(compressedFile);
          } else {
            // Если конвертация не поддерживается, используем оригинальный файл
            console.warn("JPEG compression failed, using original file");
            resolve(file);
          }
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = () => {
      reject(new Error("Image loading failed"));
    };

    img.src = URL.createObjectURL(file);
  });
};

// Функция для загрузки одного файла
const uploadSingleFile = async (
  file: File,
  category: keyof PhotoFiles,
  queueFileKey: string,
  shopUuid: string,
  statusKey: string,
  userId: string,
  onProgress: (statusKey: string, progress: number) => void,
  onSuccess: (statusKey: string, queueFileKey: string) => void,
  onError: (
    statusKey: string,
    queueFileKey: string,
    errorMessage: string
  ) => void
): Promise<void> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", category);
  formData.append("userId", userId);
  formData.append("shopUuid", shopUuid);
  formData.append("fileKey", queueFileKey); // ← ОБЯЗАТЕЛЬНО

  try {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100);
        onProgress(statusKey, progress);
      }
    });

    await new Promise<void>((resolve, reject) => {
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.success) {
              onSuccess(statusKey, queueFileKey);
              resolve();
            } else {
              onError(
                statusKey,
                queueFileKey,
                "Upload failed - server error"
              );
              reject(new Error("Upload failed - server error"));
            }
          } catch {
            onError(statusKey, queueFileKey, "Invalid server response");
            reject(new Error("Invalid server response"));
          }
        } else {
          onError(
            statusKey,
            queueFileKey,
            `Upload failed with status ${xhr.status}`
          );
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => {
        onError(statusKey, queueFileKey, "Network error during upload");
        reject(new Error("Network error during upload"));
      };

      xhr.open("POST", "/api/uploads/upload-photos");
      xhr.send(formData);
    });
  } catch (error) {
    console.error("❌ Ошибка загрузки файла:", error);
    onError(
      statusKey,
      queueFileKey,
      error instanceof Error ? error.message : "Unknown upload error"
    );
    throw error;
  }
};

// Функция для ограничения количества одновременных промисов
const limitConcurrency = async <T,>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> => {
  const results: T[] = [];
  const executing = new Set<Promise<T>>();

  for (const task of tasks) {
    const p = task().then((result) => {
      results.push(result);
      executing.delete(p);
      return result;
    });

    executing.add(p);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
};

export default function PhotoStep({
  setCurrentStep,
  userId,
  selectedShop,
}: PhotoStepProps) {
  const today = new Date().toISOString().slice(0, 10);
  const statusStorageKey = `openingPhotoSlots:${userId}:${selectedShop ?? "no-shop"}:${today}`;

  const [photos, setPhotos] = useState<PhotoFiles>({
    area: [],
    stock: [],
    cash: [],
    mrc: [],
  });

  const [fileUploadStatus, setFileUploadStatus] = useState<FileUploadStatus>(
    {}
  );
  const [uploadedFiles, setUploadedFiles] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [canProceed, setCanProceed] = useState(false);
  const [slotStatuses, setSlotStatuses] = useState<Record<string, string>>({});
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [queueProgress, setQueueProgress] = useState<{ uploaded: number; total: number } | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);

  // Функция для создания уникального ключа файла
  const createFileKey = (
    file: File,
    category: keyof PhotoFiles,
    index: number
  ): string => {
    return `${category}_${file.name}_${file.size}_${file.lastModified}_${index}`;
  };
  const updateSlotStatus = (
    slotKey: string,
    status: "pending" | "uploading" | "success" | "error" | "compressing"
  ) => {
    setSlotStatuses((prev) => {
      const next = {
        ...prev,
        [slotKey]: status,
      };
      localStorage.setItem(statusStorageKey, JSON.stringify(next));
      return next;
    });
  };

  // Функция для обработки прогресса загрузки
  const handleUploadProgress = (fileKey: string, progress: number) => {
    setFileUploadStatus((prev) => ({
      ...prev,
      [fileKey]: {
        ...prev[fileKey],
        progress: Math.max(prev[fileKey]?.progress || 0, progress), // Не уменьшаем прогресс
      },
    }));
  };

  // Функция для обработки успешной загрузки
  const handleUploadSuccess = async (
    statusKey: string,
    queueFileKey: string,
    slotKey: string
  ) => {
    setFileUploadStatus((prev) => ({
      ...prev,
      [statusKey]: {
        ...prev[statusKey],
        progress: 100,
        status: "success",
      },
    }));

    setUploadedFiles((prev) => new Set(prev).add(statusKey));

    // Удаляем из очереди после успешной загрузки
    await removeFromQueue(queueFileKey);
    updateSlotStatus(slotKey, "success");
  };

  // Функция для обработки ошибки загрузки
  const handleUploadError = async (
    statusKey: string,
    queueFileKey: string,
    slotKey: string,
    errorMessage: string
  ) => {
    setFileUploadStatus((prev) => ({
      ...prev,
      [statusKey]: {
        ...prev[statusKey],
        status: "error",
      },
    }));
    await markFileRetry(queueFileKey, errorMessage);
    updateSlotStatus(slotKey, "error");
  };

  // Обработчик изменения файлов в категории
  const handleFilesChange = async (
    files: File[],
    category: keyof PhotoFiles
  ) => {
    setPhotos((prev) => ({
      ...prev,
      [category]: files,
    }));

    // Запускаем обработку новых файлов
    await processAndUploadFiles(files, category);
  };

  // Основная функция для обработки и загрузки файлов
  const processAndUploadFiles = async (
    files: File[],
    category: keyof PhotoFiles
  ) => {
    setIsUploading(true);

    try {
      // Создаем задачи для каждого файла
      const uploadTasks = files.map((file, index) => {
        const statusKey = createFileKey(file, category, index);
        const slotKey = `${category}_${index}`;
        const queueFileKey = `${selectedShop ?? "no-shop"}:${slotKey}`;

        return async (): Promise<string> => {
          // Пропускаем уже загруженные файлы
          if (
            uploadedFiles.has(statusKey) ||
            fileUploadStatus[statusKey]?.status === "success"
          ) {
            return statusKey;
          }

          // Пропускаем файлы в процессе загрузки
          if (
            fileUploadStatus[statusKey]?.status === "uploading" ||
            fileUploadStatus[statusKey]?.status === "compressing"
          ) {
            return statusKey;
          }

          // Устанавливаем статус сжатия
          setFileUploadStatus((prev) => ({
            ...prev,
            [statusKey]: {
              progress: 0,
              status: "compressing",
              category,
            },
          }));
          updateSlotStatus(slotKey, "compressing");

          // Добавляем файл в очередь IndexedDB
          if (!selectedShop) {
            throw new Error("Сначала выберите магазин");
          }
          await addToUploadQueue(file, category, userId, selectedShop, queueFileKey);

          let compressedFile: File;
          try {
            // Сжимаем файл
            compressedFile = await compressImage(file);

            // Обновляем прогресс после сжатия
            setFileUploadStatus((prev) => ({
              ...prev,
              [statusKey]: {
                ...prev[statusKey],
                progress: 10, // 10% после сжатия
                status: "uploading",
              },
            }));
            updateSlotStatus(slotKey, "uploading");
          } catch (compressionError) {
            console.warn(
              "Сжатие не удалось, используем оригинальный файл:",
              compressionError
            );
            compressedFile = file;

            setFileUploadStatus((prev) => ({
              ...prev,
              [statusKey]: {
                ...prev[statusKey],
                progress: 5,
                status: "uploading",
              },
            }));
            updateSlotStatus(slotKey, "uploading");
          }

          // Обновляем статус в очереди
          await updateFileStatus(queueFileKey, "uploading");

          // Загружаем файл
          await uploadSingleFile(
            compressedFile,
            category,
            queueFileKey,
            selectedShop,
            statusKey,
            userId,
            handleUploadProgress,
            (nextStatusKey, nextQueueFileKey) =>
              handleUploadSuccess(nextStatusKey, nextQueueFileKey, slotKey),
            (nextStatusKey, nextQueueFileKey, errorMessage) =>
              handleUploadError(
                nextStatusKey,
                nextQueueFileKey,
                slotKey,
                errorMessage
              )
          );

          return statusKey;
        };
      });

      // Запускаем загрузку с ограничением параллелизма (макс 2 одновременные загрузки)
      await limitConcurrency(uploadTasks, 2);
    } catch (error) {
      console.error("❌ Ошибка в процессе загрузки:", error);
    } finally {
      setIsUploading(false);
    }
  };

  // Получаем статус для отображения в PhotoUpload
  const getFilesUploadStatus = (files: File[], category: keyof PhotoFiles) => {
    return files.map((file, index) => {
      const fileKey = createFileKey(file, category, index);
      const status = fileUploadStatus[fileKey];

      if (status) {
        return status;
      }

      // Если статуса нет, проверяем не загружен ли уже файл
      if (uploadedFiles.has(fileKey)) {
        return {
          progress: 100,
          status: "success" as const,
          category,
        };
      }

      // Статус по умолчанию
      return {
        progress: 0,
        status: "compressing" as const,
        category,
      };
    });
  };

  // Проверяем, все ли обязательные фото загружены
  const allRequiredPhotosUploaded =
    photos.area.length >= 2 &&
    photos.area.slice(0, 2).every((file, index) => {
      const fileKey = createFileKey(file, "area", index);
      return fileUploadStatus[fileKey]?.status === "success";
    }) &&
    photos.stock.length >= 3 &&
    photos.stock.slice(0, 3).every((file, index) => {
      const fileKey = createFileKey(file, "stock", index);
      return fileUploadStatus[fileKey]?.status === "success";
    }) &&
    photos.cash.length >= 1 &&
    photos.cash.slice(0, 1).every((file, index) => {
      const fileKey = createFileKey(file, "cash", index);
      return fileUploadStatus[fileKey]?.status === "success";
    }) &&
    photos.mrc.length >= 1 &&
    photos.mrc.slice(0, 1).every((file, index) => {
      const fileKey = createFileKey(file, "mrc", index);
      return fileUploadStatus[fileKey]?.status === "success";
    });

  // Проверка минимальных требований для продолжения
  const minRequirementsMet =
    photos.area.length >= 1 &&
    photos.stock.length >= 2 &&
    photos.cash.length >= 1 &&
    photos.mrc.length >= 1;

  // Обновляем возможность продолжения
  useEffect(() => {
    setCanProceed(minRequirementsMet);
  }, [minRequirementsMet]);

  // Восстанавливаем фото и статусы слотов после перезагрузки страницы
  useEffect(() => {
    const restore = async () => {
      try {
        const localSnapshotRaw = localStorage.getItem(statusStorageKey);
        const localSnapshot = localSnapshotRaw
          ? (JSON.parse(localSnapshotRaw) as Record<string, string>)
          : {};

        if (!selectedShop) return;
        const queue = await getUploadQueue(userId, selectedShop);
        const restoredPhotos: PhotoFiles = {
          area: [],
          stock: [],
          cash: [],
          mrc: [],
        };
        const restoredStatus: FileUploadStatus = {};
        const mergedSlots: Record<string, string> = { ...localSnapshot };
        const uploaded: string[] = [];

        queue.forEach((item: QueuedFile) => {
          const [, slotKeyRaw = item.fileKey] = item.fileKey.split(":");
          const [categoryRaw, indexRaw] = slotKeyRaw.split("_");
          const category = categoryRaw as keyof PhotoFiles;
          const index = Number(indexRaw);
          if (!["area", "stock", "cash", "mrc"].includes(category)) return;
          if (!Number.isInteger(index) || index < 0) return;

          const restoredFile = new File([item.fileData], item.fileName, {
            type: item.fileData.type || "image/jpeg",
            lastModified: item.timestamp || Date.now(),
          });

          const arr = [...restoredPhotos[category]];
          arr[index] = restoredFile;
          restoredPhotos[category] = arr;

          const statusKey = createFileKey(restoredFile, category, index);
          const uiStatus: "compressing" | "uploading" | "success" | "error" =
            item.status === "pending" || item.status === "uploading"
              ? "uploading"
              : item.status === "error"
                ? "error"
                : "success";

          restoredStatus[statusKey] = {
            progress: uiStatus === "success" ? 100 : uiStatus === "error" ? 0 : 30,
            status: uiStatus,
            category,
          };

          if (uiStatus === "success") {
            uploaded.push(statusKey);
          }

          mergedSlots[slotKeyRaw] = uiStatus;
        });

        // Удаляем undefined-элементы, если какие-то слоты отсутствуют
        const normalize = (arr: File[]) =>
          arr.filter((item) => item instanceof File);

        setPhotos({
          area: normalize(restoredPhotos.area),
          stock: normalize(restoredPhotos.stock),
          cash: normalize(restoredPhotos.cash),
          mrc: normalize(restoredPhotos.mrc),
        });
        setFileUploadStatus(restoredStatus);
        setUploadedFiles(new Set(uploaded));
        setSlotStatuses(mergedSlots);
        localStorage.setItem(statusStorageKey, JSON.stringify(mergedSlots));
      } catch (error) {
        console.error("Ошибка восстановления фото-статусов:", error);
      }
    };

    if (userId && selectedShop) {
      void restore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selectedShop]);

  useEffect(() => {
    let mounted = true;
    let interval: number | undefined;
    const QUEUE_POLL_MS = 15_000;

    const refreshQueue = async () => {
      try {
        const stats = await getUploadStats(userId);
        if (mounted) {
          setQueueStats(stats);
          setQueueError(null);
        }
      } catch (error) {
        if (mounted) {
          setQueueError(
            error instanceof Error ? error.message : "Ошибка чтения очереди"
          );
        }
      }
    };

    const runBackgroundUpload = async () => {
      const result = await startBackgroundUpload(userId, (uploaded, total) => {
        if (mounted) {
          setQueueProgress({ uploaded, total });
        }
      });
      if (mounted) {
        setQueueProgress(null);
        if (result.failed > 0) {
          setQueueError("Часть файлов не загрузилась, будет повтор.");
        }
      }
      await refreshQueue();
    };

    const stopPolling = () => {
      if (interval) {
        window.clearInterval(interval);
        interval = undefined;
      }
    };

    const startPolling = () => {
      if (interval || !userId) return;
      interval = window.setInterval(() => {
        void refreshQueue();
      }, QUEUE_POLL_MS);
    };

    if (userId) {
      void refreshQueue();
      void runBackgroundUpload();
      if (document.visibilityState === "visible") {
        startPolling();
      }
    }

    const onOnline = () => {
      void runBackgroundUpload();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshQueue();
        startPolling();
      } else {
        stopPolling();
      }
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mounted = false;
      stopPolling();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [userId]);

  const uploadStats = {
    total: Object.keys(fileUploadStatus).length,
    success: Object.values(fileUploadStatus).filter((s) => s.status === "success")
      .length,
    error: Object.values(fileUploadStatus).filter((s) => s.status === "error")
      .length,
    uploading: Object.values(fileUploadStatus).filter(
      (s) => s.status === "uploading" || s.status === "compressing"
    ).length,
  };

  // Функция перехода на следующий шаг
  const handleProceed = async () => {
    // Сохраняем незагруженные файлы в очередь для фоновой загрузки
    const pendingFiles = await getPendingFiles(userId, selectedShop ?? undefined);
    console.log(`📦 Незагруженных файлов в очереди: ${pendingFiles.length}`);

    setCurrentStep("cash_check");
  };

  // Очистка фото из IndexedDB при ручном удалении
  const handleRemovePhoto = async (_file: File, index: number, category: keyof PhotoFiles) => {
    const queueFileKey = `${selectedShop ?? "no-shop"}:${category}_${index}`;
    try {
      await removeFromQueue(queueFileKey);
    } catch (e) {
      console.warn("Не удалось удалить из очереди:", e);
    }
  };

  // Сброс всех фото и очистка очереди
  const handleResetAll = async () => {
    try {
      await clearUploadQueue(userId);
      setPhotos({ area: [], stock: [], cash: [], mrc: [] });
      setFileUploadStatus({});
      setUploadedFiles(new Set());
      setSlotStatuses({});
      localStorage.removeItem(statusStorageKey);
    } catch (e) {
      console.error("Ошибка сброса:", e);
    }
  };

  const handleRetryFailed = async () => {
    const categories: Array<keyof PhotoFiles> = ["area", "stock", "cash", "mrc"];
    for (const category of categories) {
      await processAndUploadFiles(photos[category], category);
    }
  };

  const handleRetryQueue = async () => {
    setQueueError(null);
    const result = await startBackgroundUpload(userId, (uploaded, total) => {
      setQueueProgress({ uploaded, total });
    });
    setQueueProgress(null);
    if (result.failed > 0) {
      setQueueError("Часть файлов не загрузилась, будет повтор.");
    }
    const stats = await getUploadStats(userId);
    setQueueStats(stats);
  };

  const slotMeta: Array<{ key: string; label: string }> = [
    { key: "area_0", label: "Территория #1" },
    { key: "area_1", label: "Территория #2" },
    { key: "stock_0", label: "Витрина #1" },
    { key: "stock_1", label: "Витрина #2" },
    { key: "stock_2", label: "Витрина #3" },
    { key: "cash_0", label: "Касса" },
    { key: "mrc_0", label: "МРЦ" },
  ];

  const renderSlotStatus = (status?: string) => {
    if (status === "success") return "✅";
    if (status === "error") return "❌";
    if (status === "uploading" || status === "compressing" || status === "pending")
      return "⏳";
    return "—";
  };

  // Статистика загрузки для отображения
  // const uploadStats = {
  //   total: Object.keys(fileUploadStatus).length,
  //   success: Object.values(fileUploadStatus).filter(
  //     (status) => status.status === "success"
  //   ).length,
  //   error: Object.values(fileUploadStatus).filter(
  //     (status) => status.status === "error"
  //   ).length,
  //   uploading: Object.values(fileUploadStatus).filter(
  //     (status) => status.status === "uploading"
  //   ).length,
  //   compressing: compressionQueue.size,
  // };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Сделайте фотографии:</h2>

      <div className="space-y-4">
        <PhotoUpload
          label="Территория магазина (2 фото)"
          maxFiles={2}
          files={photos.area}
          uploadStatuses={getFilesUploadStatus(photos.area, "area")}
          onChange={(files) => handleFilesChange(files, "area")}
          onRemove={(file, i) => handleRemovePhoto(file, i, "area")}
        />

        <PhotoUpload
          label="Запасы товаров / Витрина (3 фото)"
          maxFiles={3}
          files={photos.stock}
          uploadStatuses={getFilesUploadStatus(photos.stock, "stock")}
          onChange={(files) => handleFilesChange(files, "stock")}
          onRemove={(file, i) => handleRemovePhoto(file, i, "stock")}
        />

        <PhotoUpload
          label="Состояние кассы (1 фото)"
          maxFiles={1}
          files={photos.cash}
          uploadStatuses={getFilesUploadStatus(photos.cash, "cash")}
          onChange={(files) => handleFilesChange(files, "cash")}
          onRemove={(file, i) => handleRemovePhoto(file, i, "cash")}
        />

        <PhotoUpload
          label="Фото МРЦ (1 фото)"
          maxFiles={1}
          files={photos.mrc}
          uploadStatuses={getFilesUploadStatus(photos.mrc, "mrc")}
          onChange={(files) => handleFilesChange(files, "mrc")}
          onRemove={(file, i) => handleRemovePhoto(file, i, "mrc")}
        />
      </div>

      {/* Кнопка сброса всех фото */}
      {(photos.area.length > 0 || photos.stock.length > 0 || photos.cash.length > 0 || photos.mrc.length > 0) && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleResetAll}
            className="px-4 py-2 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
          >
            🗑️ Сбросить всё и начать заново
          </button>
        </div>
      )}

      {/* Статус загрузки */}
      {Object.keys(fileUploadStatus).length > 0 && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-blue-900 dark:text-blue-100">
              Статус загрузки
            </h3>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {uploadStats.success} / {uploadStats.total}
            </div>
          </div>

          {/* Прогресс бар */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-3">
            <motion.div
              className="bg-blue-600 h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{
                width: `${
                  (uploadStats.success / uploadStats.total) *
                  100
                }%`,
              }}
              transition={{ duration: 0.3 }}
            />
          </div>

          <div className="text-xs text-gray-700 dark:text-gray-300 space-y-1">
            {uploadStats.uploading > 0 && <div>⏳ Идет загрузка: {uploadStats.uploading}</div>}
            {uploadStats.error > 0 && (
              <div className="text-red-600">❌ Ошибок: {uploadStats.error}</div>
            )}
          </div>

          {uploadStats.error > 0 && (
            <button
              type="button"
              onClick={handleRetryFailed}
              className="mt-3 px-3 py-2 rounded-lg bg-amber-500 text-white text-xs"
            >
              Повторить ошибки
            </button>
          )}

          {/* Информация о фоне */}
          {!allRequiredPhotosUploaded && minRequirementsMet && (
            <div className="text-xs text-amber-600 dark:text-amber-400">
              ⚠️ Некоторые фото еще загружаются. Вы можете продолжить - загрузка
              продолжится в фоне.
            </div>
          )}
        </div>
      )}

      {queueStats && (
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-gray-900 dark:text-gray-100">
              Очередь фоновой загрузки
            </h3>
            <button
              type="button"
              onClick={handleRetryQueue}
              className="text-xs px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            >
              Повторить
            </button>
          </div>
          {queueError && (
            <div className="text-xs text-red-600 dark:text-red-400 mb-2">
              {queueError}
            </div>
          )}
          {queueProgress && (
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
              Отправлено: {queueProgress.uploaded} / {queueProgress.total}
            </div>
          )}
          <div className="text-xs text-gray-700 dark:text-gray-300 space-y-1">
            <div>Всего в очереди: {queueStats.total}</div>
            <div>Ожидают: {queueStats.pending}</div>
            <div>Загружаются: {queueStats.uploading}</div>
            <div>Ошибки: {queueStats.error}</div>
          </div>
        </div>
      )}

      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <h3 className="text-sm font-medium mb-2">Слоты фото</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {slotMeta.map((slot) => (
            <div
              key={slot.key}
              className="flex items-center justify-between px-2 py-1 rounded bg-white dark:bg-gray-700"
            >
              <span>{slot.label}</span>
              <span>{renderSlotStatus(slotStatuses[slot.key])}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="sticky z-20 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur supports-[backdrop-filter]:bg-gray-50/80 supports-[backdrop-filter]:dark:bg-gray-900/80 py-2 -mx-1 px-1" style={{ bottom: "var(--app-bottom-clearance, 72px)" }}>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCurrentStep("initial")}
            className="flex-1 py-3 rounded-xl shadow font-medium bg-gray-200 text-gray-800"
          >
            Назад
          </button>

          {minRequirementsMet && (
            <motion.button
              onClick={handleProceed}
              disabled={!canProceed}
              className={`flex-1 py-3 rounded-xl shadow font-medium transition-colors ${
                canProceed
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
              whileTap={canProceed ? { scale: 0.97 } : {}}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {isUploading
                ? "Продолжить (дозагрузка в фоне)"
                : allRequiredPhotosUploaded
                  ? "Все готово! Продолжить"
                  : "Продолжить"}
            </motion.button>
          )}
        </div>
      </div>

      {!minRequirementsMet && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-sm text-amber-700 dark:text-amber-300">
          📸 Загрузите минимум: 1 фото территории, 2 фото витрины, 1 фото кассы,
          1 фото МРЦ
        </div>
      )}

      {/* Индикатор активной загрузки */}
      {isUploading && (
        <div className="fixed right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg" style={{ bottom: "calc(var(--app-bottom-clearance, 72px) + 0.5rem)" }}>
          ⏳ Идет загрузка фото...
        </div>
      )}
    </div>
  );
}
