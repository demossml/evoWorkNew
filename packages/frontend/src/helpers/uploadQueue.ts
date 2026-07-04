/**
 * Управление очередью загрузки фото для открытия магазина.
 * Хранилище: IndexedDB.
 * Включает повторы, backoff и conflict-resolve по fileKey (слот фото).
 */

export type UploadCategory = "area" | "stock" | "cash" | "mrc";

export interface QueuedFile {
  fileData: Blob;
  fileName: string;
  fileSize: number;
  category: UploadCategory;
  userId: string;
  shopUuid?: string;
  fileKey: string;
  timestamp: number;
  attempts: number;
  status: "pending" | "uploading" | "success" | "error";
  nextRetryAt?: number;
  lastError?: string;
  checksum?: string;
}

const DB_NAME = "StoreOpeningDB";
const DB_VERSION = 2;
const STORE_NAME = "uploadQueue";

const RETRY_BACKOFF_MS = [30_000, 2 * 60_000, 5 * 60_000, 15 * 60_000];

const toChecksum = (file: File) =>
  `${file.name}:${file.size}:${file.lastModified}:${file.type}`;

// Открытие/создание базы данных IndexedDB
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }

      const objectStore = db.createObjectStore(STORE_NAME, {
        keyPath: "fileKey",
      });
      objectStore.createIndex("userId", "userId", { unique: false });
      objectStore.createIndex("status", "status", { unique: false });
      objectStore.createIndex("timestamp", "timestamp", { unique: false });
      objectStore.createIndex("nextRetryAt", "nextRetryAt", { unique: false });
    };
  });
};

const getByFileKey = async (
  store: IDBObjectStore,
  fileKey: string
): Promise<QueuedFile | undefined> => {
  return new Promise((resolve, reject) => {
    const request = store.get(fileKey);
    request.onsuccess = () => resolve(request.result as QueuedFile | undefined);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Добавить файл в очередь загрузки.
 * Conflict-resolve:
 * - если слот fileKey уже существует и файл тот же -> игнорируем;
 * - если слот fileKey уже существует и файл новый -> заменяем содержимое и сбрасываем retry-state.
 */
export const addToUploadQueue = async (
  file: File,
  category: UploadCategory,
  userId: string,
  shopUuid: string,
  fileKey: string
): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const checksum = toChecksum(file);
    const existing = await getByFileKey(store, fileKey);

    if (existing && existing.checksum === checksum) {
      db.close();
      return;
    }

    const now = Date.now();
    const queuedFile: QueuedFile = {
      fileData: file,
      fileName: file.name,
      fileSize: file.size,
      category,
      userId,
      shopUuid,
      fileKey,
      timestamp: now,
      attempts: 0,
      status: "pending",
      nextRetryAt: now,
      lastError: undefined,
      checksum,
    };

    await new Promise<void>((resolve, reject) => {
      const request = store.put(queuedFile);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
  } catch (error) {
    console.error("Queue add error:", error);
    throw error;
  }
};

/**
 * Получить все файлы из очереди для пользователя.
 */
export const getUploadQueue = async (
  userId: string,
  shopUuid?: string
): Promise<QueuedFile[]> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("userId");

    const allFiles: QueuedFile[] = await new Promise((resolve, reject) => {
      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result as QueuedFile[]);
      request.onerror = () => reject(request.error);
    });

    db.close();
    const files = shopUuid
      ? allFiles.filter((file) => file.shopUuid === shopUuid)
      : allFiles;
    return files.sort((a, b) => a.timestamp - b.timestamp);
  } catch (error) {
    console.error("Queue read error:", error);
    return [];
  }
};

/**
 * Получить только файлы, готовые к повторной загрузке.
 */
export const getPendingFiles = async (
  userId: string,
  shopUuid?: string,
  now = Date.now()
): Promise<QueuedFile[]> => {
  const allFiles = await getUploadQueue(userId, shopUuid);
  return allFiles.filter((file) => {
    if (!(file.status === "pending" || file.status === "error")) return false;
    if (typeof file.nextRetryAt === "number" && file.nextRetryAt > now) {
      return false;
    }
    return true;
  });
};

/**
 * Обновить статус файла.
 */
export const updateFileStatus = async (
  fileKey: string,
  status: QueuedFile["status"],
  incrementAttempts = false
): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const file = await getByFileKey(store, fileKey);

    if (file) {
      file.status = status;
      if (incrementAttempts) {
        file.attempts += 1;
      }
      if (status === "uploading") {
        file.nextRetryAt = Date.now();
      }
      if (status === "success") {
        file.lastError = undefined;
      }

      await new Promise<void>((resolve, reject) => {
        const request = store.put(file);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    db.close();
  } catch (error) {
    console.error("Queue status update error:", error);
  }
};

/**
 * Пометить файл как failed с backoff.
 */
export const markFileRetry = async (
  fileKey: string,
  errorMessage: string
): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const file = await getByFileKey(store, fileKey);
    if (!file) {
      db.close();
      return;
    }

    file.status = "error";
    file.attempts += 1;
    file.lastError = errorMessage;

    const backoffIndex = Math.min(file.attempts - 1, RETRY_BACKOFF_MS.length - 1);
    file.nextRetryAt = Date.now() + RETRY_BACKOFF_MS[backoffIndex];

    await new Promise<void>((resolve, reject) => {
      const request = store.put(file);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
  } catch (error) {
    console.error("Queue retry mark error:", error);
  }
};

/**
 * Сбросить слот в pending для ручного retry.
 */
export const resetFileForRetry = async (fileKey: string): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const file = await getByFileKey(store, fileKey);
    if (!file) {
      db.close();
      return;
    }

    file.status = "pending";
    file.nextRetryAt = Date.now();
    file.lastError = undefined;

    await new Promise<void>((resolve, reject) => {
      const request = store.put(file);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
  } catch (error) {
    console.error("Queue reset retry error:", error);
  }
};

/**
 * Удалить файл из очереди после успешной загрузки.
 */
export const removeFromQueue = async (fileKey: string): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(fileKey);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
  } catch (error) {
    console.error("Queue remove error:", error);
  }
};

/**
 * Очистить всю очередь для пользователя.
 */
export const clearUploadQueue = async (userId: string): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("userId");

    const files: QueuedFile[] = await new Promise((resolve, reject) => {
      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result as QueuedFile[]);
      request.onerror = () => reject(request.error);
    });

    for (const file of files) {
      await new Promise<void>((resolve, reject) => {
        const request = store.delete(file.fileKey);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    db.close();
  } catch (error) {
    console.error("Queue clear error:", error);
  }
};

/**
 * Получить статистику загрузки.
 */
export const getUploadStats = async (
  userId: string
): Promise<{
  total: number;
  pending: number;
  uploading: number;
  success: number;
  error: number;
  byCategory: Record<string, number>;
}> => {
  const files = await getUploadQueue(userId);

  const stats = {
    total: files.length,
    pending: files.filter((f) => f.status === "pending").length,
    uploading: files.filter((f) => f.status === "uploading").length,
    success: files.filter((f) => f.status === "success").length,
    error: files.filter((f) => f.status === "error").length,
    byCategory: {} as Record<string, number>,
  };

  files.forEach((file) => {
    stats.byCategory[file.category] = (stats.byCategory[file.category] || 0) + 1;
  });

  return stats;
};

/**
 * Очистить старые записи (старше 7 дней).
 */
export const cleanOldEntries = async (): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const allFiles: QueuedFile[] = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as QueuedFile[]);
      request.onerror = () => reject(request.error);
    });

    for (const file of allFiles) {
      if (file.timestamp < sevenDaysAgo) {
        await new Promise<void>((resolve, reject) => {
          const request = store.delete(file.fileKey);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }
    }

    db.close();
  } catch (error) {
    console.error("Queue cleanup error:", error);
  }
};
