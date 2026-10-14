import { and, desc, eq, ilike, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateTaskBody,
  CreateTaskResponse,
  GetTaskParams,
  GetTaskResponse,
  GetTasksQueryParams,
  GetTasksResponse,
  UpdateTaskBody,
  UpdateTaskParams,
  UpdateTaskResponse,
} from "@workspace/api-zod";
import {
  db,
  questionnairesTable,
  shoppersTable,
  storesTable,
  tasksTable,
} from "@workspace/db";
import { iso, recordActivity, validDate } from "../lib/platform";

const router: IRouter = Router();

function toCalendarDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function toTask(row: {
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
    storeName: row.storeName,
    storeCode: row.storeCode,
    shopperName: row.shopperName,
    questionnaireTitle: row.questionnaireTitle,
    createdAt: iso(row.task.createdAt),
    updatedAt: iso(row.task.updatedAt),
  };
}

async function getTaskRow(taskId: number) {
  const [row] = await db
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
    .where(eq(tasksTable.id, taskId));
  return row ? toTask(row) : null;
}

async function isEligibleShopper(shopperId: number): Promise<boolean> {
  const [shopper] = await db
    .select({ id: shoppersTable.id })
    .from(shoppersTable)
    .where(
      and(
        eq(shoppersTable.id, shopperId),
        eq(shoppersTable.verificationStatus, "verified"),
        eq(shoppersTable.accountStatus, "active"),
      ),
    );
  return Boolean(shopper);
}

function hasValidDates(visitDate: string, dueDate: string): boolean {
  return validDate(visitDate) && validDate(dueDate) && dueDate >= visitDate;
}

router.get("/tasks", async (req, res): Promise<void> => {
  const parsed = GetTasksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const conditions = [];
  if (parsed.data.status) {
    conditions.push(eq(tasksTable.status, parsed.data.status));
  }
  if (parsed.data.search) {
    const search = `%${parsed.data.search}%`;
    conditions.push(
      or(
        ilike(storesTable.name, search),
        ilike(storesTable.code, search),
        ilike(shoppersTable.fullName, search),
        ilike(tasksTable.instructions, search),
      ),
    );
  }
  const rows = await db
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
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(tasksTable.createdAt));
  res.json(GetTasksResponse.parse(rows.map(toTask)));
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const visitDate = toCalendarDate(input.visitDate);
  const dueDate = toCalendarDate(input.dueDate);
  if (!hasValidDates(visitDate, dueDate)) {
    res.status(400).json({
      error: "Enter valid visit and due dates, with the due date on or after the visit date.",
    });
    return;
  }
  if (
    !input.shopperId &&
    !["draft", "cancelled"].includes(input.status)
  ) {
    res.status(400).json({
      error: "Choose an eligible shopper before assigning this task.",
    });
    return;
  }
  const [store] = await db
    .select({ id: storesTable.id })
    .from(storesTable)
    .where(eq(storesTable.id, input.storeId));
  if (!store) {
    res.status(404).json({ error: "Store not found." });
    return;
  }
  if (input.shopperId) {
    const [shopper] = await db
      .select()
      .from(shoppersTable)
      .where(eq(shoppersTable.id, input.shopperId));
    if (!shopper) {
      res.status(404).json({ error: "Shopper not found." });
      return;
    }
    if (!(await isEligibleShopper(input.shopperId))) {
      res.status(400).json({
        error: "Only verified, active shoppers can be assigned.",
      });
      return;
    }
  }
  if (input.questionnaireId) {
    const [questionnaire] = await db
      .select({ id: questionnairesTable.id })
      .from(questionnairesTable)
      .where(eq(questionnairesTable.id, input.questionnaireId));
    if (!questionnaire) {
      res.status(404).json({ error: "Questionnaire not found." });
      return;
    }
  }
  const [task] = await db
    .insert(tasksTable)
    .values({ ...input, visitDate, dueDate })
    .returning();
  const result = await getTaskRow(task.id);
  await recordActivity("created", "task", task.id, `Created task for ${result?.storeName ?? "store"}`);
  res.status(201).json(CreateTaskResponse.parse(result));
});

router.get("/tasks/:taskId", async (req, res): Promise<void> => {
  const params = GetTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const row = await getTaskRow(params.data.taskId);
  if (!row) {
    res.status(404).json({ error: "Task not found." });
    return;
  }
  res.json(GetTaskResponse.parse(row));
});

router.patch("/tasks/:taskId", async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({
      error: !params.success
        ? params.error.message
        : parsed.error?.message ?? "Invalid task data.",
    });
    return;
  }
  const [current] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, params.data.taskId));
  if (!current) {
    res.status(404).json({ error: "Task not found." });
    return;
  }
  const input = { ...current, ...parsed.data };
  const visitDate = toCalendarDate(input.visitDate);
  const dueDate = toCalendarDate(input.dueDate);
  if (!hasValidDates(visitDate, dueDate)) {
    res.status(400).json({
      error: "Enter valid visit and due dates, with the due date on or after the visit date.",
    });
    return;
  }
  if (
    !input.shopperId &&
    !["draft", "cancelled"].includes(input.status)
  ) {
    res.status(400).json({
      error: "Choose an eligible shopper before assigning this task.",
    });
    return;
  }
  const [store] = await db
    .select({ id: storesTable.id })
    .from(storesTable)
    .where(eq(storesTable.id, input.storeId));
  if (!store) {
    res.status(404).json({ error: "Store not found." });
    return;
  }
  if (input.shopperId && !(await isEligibleShopper(input.shopperId))) {
    res.status(400).json({
      error: "Only verified, active shoppers can be assigned.",
    });
    return;
  }
  if (input.questionnaireId) {
    const [questionnaire] = await db
      .select({ id: questionnairesTable.id })
      .from(questionnairesTable)
      .where(eq(questionnairesTable.id, input.questionnaireId));
    if (!questionnaire) {
      res.status(404).json({ error: "Questionnaire not found." });
      return;
    }
  }
  const {
    visitDate: requestedVisitDate,
    dueDate: requestedDueDate,
    ...updates
  } = parsed.data;
  const [updated] = await db
    .update(tasksTable)
    .set({
      ...updates,
      ...(requestedVisitDate !== undefined ? { visitDate } : {}),
      ...(requestedDueDate !== undefined ? { dueDate } : {}),
    })
    .where(eq(tasksTable.id, current.id))
    .returning();
  const result = await getTaskRow(updated.id);
  await recordActivity("updated", "task", updated.id, `Updated task #${updated.id}`);
  res.json(UpdateTaskResponse.parse(result));
});

export default router;
