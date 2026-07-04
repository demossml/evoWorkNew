/**
 * Фоновый загрузчик файлов из очереди.
 * Включает повторные попытки, lock от параллельного запуска и обработку offline.
 */

import {
  cleanOldEntries,
  getPendingFiles,
  markFileRetry,
  removeFromQueue,
  updateFileStatus,
} from "./uploadQueue";

const MAX_ATTEMPTS = 4;
const UPLOAD_LOCK_KEY = "upload_queue_lock";
const LOCK_TTL_MS = 2 * 60 * 1000;

const acquireLock = (): boolean => {
  const now = Date.now();
  const raw = localStorage.getItem(UPLOAD_LOCK_KEY);
  if (raw) {
    const expiresAt = Number(raw);
    if (Number.isFinite(expiresAt) && expiresAt > now) {
      return false;
    }
  }
  localStorage.setItem(UPLOAD_LOCK_KEY, String(now + LOCK_TTL_MS));
  return true;
};

const refreshLock = () => {
  localStorage.setItem(UPLOAD_LOCK_KEY, String(Date.now() + LOCK_TTL_MS));
};

const releaseLock = () => {
  localStorage.removeItem(UPLOAD_LOCK_KEY);
};

// Функция для загрузки одного файла
const uploadFile = async (
  fileData: Blob,
  fileName: string,
  category: string,
  userId: string,
  shopUuid: string,
  fileKey: string,
  onProgress?: (progress: number) => void
): Promise<boolean> => {
  try {
    const formData = new FormData();
    const file = new File([fileData], fileName, { type: fileData.type });

    formData.append("file", file);
    formData.append("category", category);
    formData.append("userId", userId);
    formData.append("shopUuid", shopUuid);
    formData.append("fileKey", fileKey);

    await updateFileStatus(fileKey, "uploading");

    return new Promise<boolean>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      if (onProgress) {
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            onProgress(progress);
          }
        });
      }

      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.success) {
              await removeFromQueue(fileKey);
              resolve(true);
              return;
            }
            await markFileRetry(fileKey, "Upload failed - server response");
            reject(new Error("Upload failed - server response"));
          } catch {
            await markFileRetry(fileKey, "Invalid server response");
            reject(new Error("Invalid server response"));
          }
          return;
        }

        await markFileRetry(fileKey, `HTTP ${xhr.status}`);
        reject(new Error(`Upload failed with status ${xhr.status}`));
      };

      xhr.onerror = async () => {
        await markFileRetry(fileKey, "Network error during upload");
        reject(new Error("Network error during upload"));
      };

      xhr.open("POST", "/api/uploads/upload-photos");
      xhr.send(formData);
    });
  } catch (error) {
    console.error("Upload file error:", error);
    await markFileRetry(
      fileKey,
      error instanceof Error ? error.message : "Unknown upload error"
    );
    return false;
  }
};

/**
 * Запустить фоновую загрузку для пользователя.
 */
export const startBackgroundUpload = async (
  userId: string,
  onProgress?: (uploaded: number, total: number) => void
): Promise<{ uploaded: number; failed: number }> => {
  if (!navigator.onLine) {
    return { uploaded: 0, failed: 0 };
  }

  if (!acquireLock()) {
    return { uploaded: 0, failed: 0 };
  }

  try {
    await cleanOldEntries();

    const pendingFiles = await getPendingFiles(userId);
    if (pendingFiles.length === 0) {
      return { uploaded: 0, failed: 0 };
    }

    let uploaded = 0;
    let failed = 0;

    for (const queuedFile of pendingFiles) {
      refreshLock();

      if (queuedFile.attempts >= MAX_ATTEMPTS) {
        failed += 1;
        continue;
      }

      try {
        const resolvedShopUuid =
          queuedFile.shopUuid ??
          (queuedFile.fileKey.includes(":")
            ? queuedFile.fileKey.split(":")[0]
            : undefined);

        if (!resolvedShopUuid) {
          await markFileRetry(queuedFile.fileKey, "Missing shopUuid");
          failed += 1;
          continue;
        }

        const success = await uploadFile(
          queuedFile.fileData,
          queuedFile.fileName,
          queuedFile.category,
          queuedFile.userId,
          resolvedShopUuid,
          queuedFile.fileKey
        );

        if (success) {
          uploaded += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }

      if (onProgress) {
        onProgress(uploaded, pendingFiles.length);
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    return { uploaded, failed };
  } finally {
    releaseLock();
  }
};

/**
 * Проверить наличие файлов в очереди.
 */
export const hasFilesInQueue = async (userId: string): Promise<boolean> => {
  const pendingFiles = await getPendingFiles(userId);
  return pendingFiles.length > 0;
};

/**
 * Получить количество файлов в очереди.
 */
export const getQueueCount = async (userId: string): Promise<number> => {
  const pendingFiles = await getPendingFiles(userId);
  return pendingFiles.length;
};
