import { count, desc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { GetDashboardResponse } from "@workspace/api-zod";
import {
  activityLogsTable,
  db,
  questionnairesTable,
  shoppersTable,
  storesTable,
  tasksTable,
} from "@workspace/db";
import { iso } from "../lib/platform";

const router: IRouter = Router();
const pendingStatuses = ["draft", "assigned", "in_progress", "submitted"];

router.get("/dashboard", async (_req, res): Promise<void> => {
  const [
    [stores],
    [shoppers],
    [pendingVerifications],
    [tasks],
    [pendingTasks],
    [completedTasks],
    recentTaskRows,
    recentActivityRows,
  ] = await Promise.all([
    db.select({ value: count() }).from(storesTable),
    db.select({ value: count() }).from(shoppersTable),
    db
      .select({ value: count() })
      .from(shoppersTable)
      .where(eq(shoppersTable.verificationStatus, "pending")),
    db.select({ value: count() }).from(tasksTable),
    db
      .select({ value: count() })
      .from(tasksTable)
      .where(inArray(tasksTable.status, pendingStatuses)),
    db
      .select({ value: count() })
      .from(tasksTable)
      .where(eq(tasksTable.status, "approved")),
    db
      .select({
        task: tasksTable,
        storeName: storesTable.name,
        storeCode: storesTable.code,
        shopperName: shoppersTable.fullName,
        questionnaireTitle: questionnairesTable.title,
      })
      .from(tasksTable)
      .innerJoin(storesTable, eq(tasksTable.storeId, storesTable.id))
      .leftJoin(shoppersTable, eq(tasksTable.shopperId, shoppersTable.id))
      .leftJoin(
        questionnairesTable,
        eq(tasksTable.questionnaireId, questionnairesTable.id),
      )
      .orderBy(desc(tasksTable.createdAt))
      .limit(6),
    db
      .select()
      .from(activityLogsTable)
      .orderBy(desc(activityLogsTable.createdAt))
      .limit(8),
  ]);

  const result = {
    totalStores: Number(stores.value),
    totalShoppers: Number(shoppers.value),
    pendingVerifications: Number(pendingVerifications.value),
    totalTasks: Number(tasks.value),
    pendingTasks: Number(pendingTasks.value),
    completedTasks: Number(completedTasks.value),
    recentTasks: recentTaskRows.map((row) => ({
      ...row.task,
      shopperId: row.task.shopperId ?? null,
      questionnaireId: row.task.questionnaireId ?? null,
      storeName: row.storeName,
      storeCode: row.storeCode,
      shopperName: row.shopperName ?? null,
      questionnaireTitle: row.questionnaireTitle ?? null,
      createdAt: iso(row.task.createdAt),
      updatedAt: iso(row.task.updatedAt),
    })),
    recentActivity: recentActivityRows.map((activity) => ({
      ...activity,
      createdAt: iso(activity.createdAt),
    })),
  };
  res.json(GetDashboardResponse.parse(result));
});

export default router;
