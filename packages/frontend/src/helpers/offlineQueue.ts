/**
 * offlineQueue.ts — офлайн-очередь действий.
 * Сохраняет действия в localStorage, выполняет при появлении сети.
 * Используется для dead stock, opening photo и других операций,
 * которые должны дойти до сервера даже при потере соединения.
 */

interface OfflineAction {
  id: string;
  type: "SAVE_DEADSTOCK" | "SAVE_OPENING" | "UPLOAD_PHOTO";
  payload: unknown;
  createdAt: string;
}

const QUEUE_KEY = "offline_action_queue";

export function enqueueAction(action: Omit<OfflineAction, "id" | "createdAt">): void {
  const queue: OfflineAction[] = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  queue.push({
    ...action,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function getQueue(): OfflineAction[] {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
}

export function removeFromQueue(id: string): void {
  const queue = getQueue().filter((a) => a.id !== id);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function clearQueue(): void {
  localStorage.removeItem(QUEUE_KEY);
}

export function hasPendingActions(): boolean {
  const q = getQueue();
  return q.length > 0;
}
