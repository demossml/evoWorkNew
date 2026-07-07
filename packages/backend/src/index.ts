import type { ScheduledController, ExecutionContext } from "@cloudflare/workers-types";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { api } from "./api";
import { authenticate, initialize } from "./helpers";
import {
  getDataForCurrentDate,
  updatePlan_,
  updateProducts,
  updateProductsShope,
  syncDocuments,
  syncStock,
  aggregateSellerDailyMetrics,
  checkAndSendCriticalAlerts,
  checkPlanLagAndAlert,
  sendDailyTopSellers,
} from "./sync/cron";
import type { IEnv } from "./types";

const app = new Hono<IEnv>()
  .use("/*", cors())
  .use("/*", initialize)
  .get("/", (c) => c.json({ message: "Welcome to Evo backend" }))
  .use("/*", authenticate)
  .route("/", api);

export default {
  fetch: app.fetch,
  async scheduled(
    controller: ScheduledController,
    env: IEnv["Bindings"],
    _ctx: ExecutionContext,
  ): Promise<void> {
    const cronTasks: Record<
      string,
      { label: string; run: (env: IEnv["Bindings"]) => Promise<void> }[]
    > = {
      "*/3 * * * *": [
        { label: "синхронизация документов (SELL)", run: syncDocuments },
      ],
      "*/25 * * * *": [
        { label: "обновления продуктов", run: updateProducts },
        { label: "обновления продуктов магазинов", run: updateProductsShope },
      ],
      "*/30 * * * *": [
        { label: "синхронизация остатков (stock)", run: syncStock },
      ],
      "0 3 * * *": [
        { label: "план-факт", run: getDataForCurrentDate },
        { label: "обновление плана (vape)", run: updatePlan_ },
        { label: "алерт: критические продавцы", run: checkAndSendCriticalAlerts },
      ],
      "0 4 * * *": [
        { label: "агрегация метрик продавцов (daily)", run: aggregateSellerDailyMetrics },
      ],
      "0 5 * * *": [
        { label: "алерт: отставание от плана >20%", run: checkPlanLagAndAlert },
        { label: "топ-3 продавцов дня", run: sendDailyTopSellers },
      ],
    };

    const tasks = cronTasks[controller.cron];
    if (!tasks) {
      console.log(`[cron] Нет задач для расписания: ${controller.cron}`);
      return;
    }

    for (const task of tasks) {
      console.log(`[cron] Запуск: ${task.label}`);
      await task.run(env);
      console.log(`[cron] Готово: ${task.label}`);
    }

    console.log(`[cron] Все задачи для ${controller.cron} выполнены`);
  },
};

export * from "./api";
