import { asc, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { GetShopperOverviewResponse } from "@workspace/api-zod";
import {
  db,
  questionnairesTable,
  shoppersTable,
  storesTable,
  tasksTable,
} from "@workspace/db";
import { requireRole } from "../lib/auth";
import { calendarDate, iso, roundScore } from "../lib/platform";
import { listShopperSubmissions } from "../lib/submissions";

const router: IRouter = Router();

const OPEN_TASK_STATUSES = ["assigned", "in_progress", "needs_correction"];

function toTaskShape(row: {
  task: typeof tasksTable.$inferSelect;
  storeName: string;
  storeCode: string;
  shopperName: string | null;
  questionnaireTitle: string | null;
}) {
  return {
    ...row.task,
    shopperId: row.task.shopperId ?? null,
    questionnaireId: row.task.questionnaireId ?? null,
    visitDate: calendarDate(row.task.visitDate),
    dueDate: calendarDate(row.task.dueDate),
    storeName: row.storeName,
    storeCode: row.storeCode,
    shopperName: row.shopperName ?? null,
    questionnaireTitle: row.questionnaireTitle ?? null,
    submittedAt: iso(row.task.submittedAt),
    reviewerComment: row.task.reviewerComment ?? null,
    reviewedAt: iso(row.task.reviewedAt),
    createdAt: iso(row.task.createdAt) as string,
    updatedAt: iso(row.task.updatedAt) as string,
  };
}

/** Every visit task currently assigned to the signed-in shopper. */
export async function listAssignedTasks(shopperId: number | null) {
  if (!shopperId) return [];
  return db
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
    .leftJoin(questionnairesTable, eq(tasksTable.questionnaireId, questionnairesTable.id))
    .where(eq(tasksTable.shopperId, shopperId))
    .orderBy(asc(tasksTable.visitDate), desc(tasksTable.id));
}

router.get("/shopper/overview", requireRole("mystery_shopper"), async (req, res): Promise<void> => {
  const user = req.authUser!;
  if (!user.shopperId) {
    res.json(
      GetShopperOverviewResponse.parse({
        openAssignments: 0,
        draftsInProgress: 0,
        awaitingReview: 0,
        approved: 0,
        needsCorrection: 0,
        rejected: 0,
        averageScore: null,
        upcomingTasks: [],
        recentSubmissions: [],
      }),
    );
    return;
  }

  const [tasks, submissions] = await Promise.all([
    listAssignedTasks(user.shopperId),
    listShopperSubmissions(user),
  ]);

  const approved = submissions.filter((item) => item.status === "approved");
  const scores = approved.map((item) => item.score).filter((score): score is number => score != null);

  res.json(
    GetShopperOverviewResponse.parse({
      openAssignments: tasks.filter((row) => OPEN_TASK_STATUSES.includes(row.task.status)).length,
      draftsInProgress: submissions.filter((item) => item.status === "draft").length,
      awaitingReview: submissions.filter((item) =>
        ["submitted", "under_review"].includes(item.status),
      ).length,
      approved: approved.length,
      needsCorrection: submissions.filter((item) => item.status === "needs_correction").length,
      rejected: submissions.filter((item) => item.status === "rejected").length,
      averageScore: scores.length
        ? roundScore(scores.reduce((sum, value) => sum + value, 0) / scores.length)
        : null,
      upcomingTasks: tasks
        .filter((row) => OPEN_TASK_STATUSES.includes(row.task.status))
        .slice(0, 5)
        .map(toTaskShape),
      recentSubmissions: submissions.slice(0, 6),
    }),
  );
});

export default router;
