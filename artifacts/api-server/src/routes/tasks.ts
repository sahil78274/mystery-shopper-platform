import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
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
  submissionsTable,
  tasksTable,
} from "@workspace/db";
import { requireAssignedRegion, requireRole, regionScopeFor } from "../lib/auth";
import { normalizeTextFields, validDate } from "../lib/validation";
import {
  ADMIN_MANAGED_TASK_STATUSES,
  canChangeTaskStore,
  canReassignTask,
} from "../lib/workflow";
import { iso, recordActivity } from "../lib/platform";
import { sendTaskAssignmentNotice } from "../lib/email-notifications";
import { shouldNotifyTaskAssignment } from "../lib/email-workflows";

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
    submittedAt: iso(row.task.submittedAt),
    reviewerComment: row.task.reviewerComment,
    reviewedAt: iso(row.task.reviewedAt),
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

async function sendAssignmentEmail(task: {
  shopperId: number | null;
  status: string;
  storeName: string;
  visitDate: string | Date;
  dueDate: string | Date;
}): Promise<void> {
  if (!task.shopperId || task.status !== "assigned") return;
  const [shopper] = await db
    .select({ fullName: shoppersTable.fullName, email: shoppersTable.email })
    .from(shoppersTable)
    .where(eq(shoppersTable.id, task.shopperId));
  if (!shopper) return;
  await sendTaskAssignmentNotice({
    email: shopper.email,
    name: shopper.fullName,
    storeName: task.storeName,
    visitDate: toCalendarDate(task.visitDate),
    dueDate: toCalendarDate(task.dueDate),
  });
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

router.get("/tasks", requireRole("admin", "mystery_shopper", "regional_executive"), requireAssignedRegion, async (req, res): Promise<void> => {
  const parsed = GetTasksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = req.authUser!;
  const conditions = [];
  // Shoppers only ever see their own assignments.
  if (user.role === "mystery_shopper") {
    if (!user.shopperId) {
      res.json(GetTasksResponse.parse([]));
      return;
    }
    conditions.push(eq(tasksTable.shopperId, user.shopperId));
  }
  const scopedRegion = regionScopeFor(user);
  if (user.role === "regional_executive") {
    conditions.push(scopedRegion ? eq(storesTable.region, scopedRegion) : sql`false`);
  }
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

router.post("/tasks", requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(normalizeTextFields(req.body, ["instructions"]));
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  if (!ADMIN_MANAGED_TASK_STATUSES.includes(input.status)) {
    res.status(400).json({ error: "Task status is managed by the shopper and review workflow." });
    return;
  }
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
    .values({
      ...input,
      visitDate,
      dueDate,
    })
    .returning();
  const result = await getTaskRow(task.id);
  await recordActivity(
    "created",
    "task",
    task.id,
    `Created task for ${result?.storeName ?? "store"}`,
    req.authUser!.id,
  );
  if (shouldNotifyTaskAssignment({
    previousShopperId: null,
    nextShopperId: task.shopperId ?? null,
    previousStatus: "draft",
    nextStatus: task.status,
  }) && result) {
    await sendAssignmentEmail(result);
  }
  res.status(201).json(CreateTaskResponse.parse(result));
});

router.get("/tasks/:taskId", requireRole("admin", "mystery_shopper", "regional_executive"), requireAssignedRegion, async (req, res): Promise<void> => {
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
  const user = req.authUser!;
  if (user.role === "mystery_shopper" && row.shopperId !== user.shopperId) {
    res.status(404).json({ error: "Task not found." });
    return;
  }
  const scopedRegion = regionScopeFor(user);
  if (scopedRegion) {
    const [store] = await db
      .select({ id: storesTable.id })
      .from(storesTable)
      .where(and(eq(storesTable.id, row.storeId), eq(storesTable.region, scopedRegion)));
    if (!store) {
      res.status(404).json({ error: "Task not found." });
      return;
    }
  }
  res.json(GetTaskResponse.parse(row));
});

router.patch("/tasks/:taskId", requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  const parsed = UpdateTaskBody.safeParse(normalizeTextFields(req.body, ["instructions"]));
  if (!params.success || !parsed.success) {
    res.status(400).json({
      error: !params.success
        ? params.error.message
        : parsed.error?.message ?? "Invalid task data.",
    });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.id, params.data.taskId))
      .for("update");
    if (!current) return { ok: false as const, status: 404, message: "Task not found." };

    const input = { ...current, ...parsed.data };
    const visitDate = toCalendarDate(input.visitDate);
    const dueDate = toCalendarDate(input.dueDate);
    if (!hasValidDates(visitDate, dueDate)) {
      return {
        ok: false as const,
        status: 400,
        message: "Enter valid visit and due dates, with the due date on or after the visit date.",
      };
    }
    if (
      !input.shopperId &&
      !["draft", "cancelled"].includes(input.status)
    ) {
      return {
        ok: false as const,
        status: 400,
        message: "Choose an eligible shopper before assigning this task.",
      };
    }
    if (
      parsed.data.status !== undefined &&
      parsed.data.status !== current.status &&
      !ADMIN_MANAGED_TASK_STATUSES.includes(parsed.data.status)
    ) {
      return {
        ok: false as const,
        status: 400,
        message: "Task status is managed by the shopper and review workflow.",
      };
    }

    const [store] = await tx
      .select({ id: storesTable.id })
      .from(storesTable)
      .where(eq(storesTable.id, input.storeId));
    if (!store) return { ok: false as const, status: 404, message: "Store not found." };

    if (input.shopperId) {
      const [shopper] = await tx
        .select({ id: shoppersTable.id })
        .from(shoppersTable)
        .where(
          and(
            eq(shoppersTable.id, input.shopperId),
            eq(shoppersTable.verificationStatus, "verified"),
            eq(shoppersTable.accountStatus, "active"),
          ),
        );
      if (!shopper) {
        return {
          ok: false as const,
          status: 400,
          message: "Only verified, active shoppers can be assigned.",
        };
      }
    }

    if (input.questionnaireId) {
      const [questionnaire] = await tx
        .select({ id: questionnairesTable.id })
        .from(questionnairesTable)
        .where(eq(questionnairesTable.id, input.questionnaireId));
      if (!questionnaire) {
        return { ok: false as const, status: 404, message: "Questionnaire not found." };
      }
    }

    const [existingSubmission] = await tx
      .select({ shopperId: submissionsTable.shopperId })
      .from(submissionsTable)
      .where(eq(submissionsTable.taskId, current.id))
      .limit(1);
    const nextShopperId = input.shopperId ?? null;
    if (!canChangeTaskStore(Boolean(existingSubmission), current.storeId, input.storeId)) {
      return {
        ok: false as const,
        status: 409,
        message: "This task's store cannot be changed after a report has been started.",
      };
    }
    if (!canReassignTask(Boolean(existingSubmission), existingSubmission?.shopperId ?? null, nextShopperId)) {
      return {
        ok: false as const,
        status: 409,
        message: "This task already has a report and cannot be reassigned to another shopper.",
      };
    }
    if (existingSubmission && parsed.data.status !== undefined && parsed.data.status !== current.status) {
      return {
        ok: false as const,
        status: 409,
        message: "This task's status is controlled by its report and review workflow.",
      };
    }

    const {
      visitDate: requestedVisitDate,
      dueDate: requestedDueDate,
      ...updates
    } = parsed.data;
    const [updated] = await tx
      .update(tasksTable)
      .set({
        ...updates,
        ...(requestedVisitDate !== undefined ? { visitDate } : {}),
        ...(requestedDueDate !== undefined ? { dueDate } : {}),
      })
      .where(eq(tasksTable.id, current.id))
      .returning();
    return {
      ok: true as const,
      taskId: updated.id,
      notifyAssignment: shouldNotifyTaskAssignment({
        previousShopperId: current.shopperId ?? null,
        nextShopperId: updated.shopperId ?? null,
        previousStatus: current.status,
        nextStatus: updated.status,
      }),
    };
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }
  const updated = await getTaskRow(result.taskId);
  await recordActivity(
    "updated",
    "task",
    result.taskId,
    `Updated task #${result.taskId}`,
    req.authUser!.id,
  );
  if (result.notifyAssignment && updated) await sendAssignmentEmail(updated);
  res.json(UpdateTaskResponse.parse(updated));
});

export default router;
