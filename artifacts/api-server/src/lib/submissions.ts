import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@workspace/db/schema";
import {
  db,
  questionnaireQuestionsTable,
  questionnairesTable,
  shoppersTable,
  storesTable,
  submissionAnswersTable,
  submissionEvidenceTable,
  submissionsTable,
  tasksTable,
  usersTable,
  EDITABLE_SUBMISSION_STATUSES,
  type SubmissionStatus,
} from "@workspace/db";
import type { AuthUser } from "./auth";
import { calendarDate, iso, roundScore } from "./platform";
import { normalizedRegionScope } from "./workflow";

/** Accepts either the pooled database or an open transaction. */
export type DbClient =
  | NodePgDatabase<typeof dbSchema>
  | Parameters<Parameters<NodePgDatabase<typeof dbSchema>["transaction"]>[0]>[0];

export type SubmissionRow = {
  submission: typeof submissionsTable.$inferSelect;
  storeName: string;
  storeCode: string;
  storeRegion: string;
  storeCity: string;
  shopperName: string | null;
  reviewerName: string | null;
  task: typeof tasksTable.$inferSelect;
  evidenceCount: number;
};

export function submissionBaseSelect() {
  return {
    submission: submissionsTable,
    storeName: storesTable.name,
    storeCode: storesTable.code,
    storeRegion: storesTable.region,
    storeCity: storesTable.city,
    shopperName: shoppersTable.fullName,
    reviewerName: usersTable.fullName,
    task: tasksTable,
    evidenceCount: sql<number>`(
      select count(*)::int from ${submissionEvidenceTable}
      where ${submissionEvidenceTable.submissionId} = ${submissionsTable.id}
    )`,
  };
}

/**
 * Applies the visibility rules that every submission query must honour:
 *  - shoppers only ever see their own reports
 *  - regional executives only see stores inside their region
 *  - admins and reviewers see everything
 */
export function scopeConditions(user: AuthUser) {
  const conditions = [];
  if (user.role === "mystery_shopper") {
    if (!user.shopperId) conditions.push(sql`false`);
    else conditions.push(eq(submissionsTable.shopperId, user.shopperId));
  }
  if (user.role === "regional_executive") {
    const scopedRegion = normalizedRegionScope(user.role, user.region);
    if (!scopedRegion) conditions.push(sql`false`);
    else conditions.push(eq(storesTable.region, scopedRegion));
  }
  return conditions;
}

export function canEditSubmission(submission: { status: string }, user: AuthUser, shopperId: number): boolean {
  return (
    user.role === "mystery_shopper" &&
    user.shopperId === shopperId &&
    (EDITABLE_SUBMISSION_STATUSES as string[]).includes(submission.status)
  );
}

export function toSubmissionSummary(row: SubmissionRow, user: AuthUser) {
  const { submission, task } = row;
  return {
    id: submission.id,
    taskId: submission.taskId,
    shopperId: submission.shopperId,
    shopperName: row.shopperName ?? null,
    storeId: submission.storeId,
    storeName: row.storeName,
    storeCode: row.storeCode,
    storeRegion: row.storeRegion,
    storeCity: row.storeCity,
    visitDate: calendarDate(task.visitDate),
    dueDate: calendarDate(task.dueDate),
    status: submission.status,
    score: submission.score,
    comment: submission.comment ?? null,
    evidenceCount: Number(row.evidenceCount ?? 0),
    submittedAt: iso(submission.submittedAt),
    reviewedAt: iso(submission.reviewedAt),
    reviewerName: row.reviewerName ?? null,
    reviewerComment: submission.reviewerComment ?? null,
    canEdit: canEditSubmission(submission, user, submission.shopperId),
    createdAt: iso(submission.createdAt) as string,
    updatedAt: iso(submission.updatedAt) as string,
  };
}

export async function loadSubmissionRow(submissionId: number): Promise<SubmissionRow | null> {
  const [row] = await db
    .select(submissionBaseSelect())
    .from(submissionsTable)
    .innerJoin(storesTable, eq(submissionsTable.storeId, storesTable.id))
    .leftJoin(shoppersTable, eq(submissionsTable.shopperId, shoppersTable.id))
    .leftJoin(usersTable, eq(submissionsTable.reviewerUserId, usersTable.id))
    .innerJoin(tasksTable, eq(submissionsTable.taskId, tasksTable.id))
    .where(eq(submissionsTable.id, submissionId));
  return (row as SubmissionRow | undefined) ?? null;
}

export async function loadSubmissionDetail(submissionId: number, user: AuthUser) {
  const row = await loadSubmissionRow(submissionId);
  if (!row) return null;
  const answers = await db
    .select()
    .from(submissionAnswersTable)
    .where(eq(submissionAnswersTable.submissionId, submissionId))
    .orderBy(asc(submissionAnswersTable.position), asc(submissionAnswersTable.id));
  const evidence = await db
    .select()
    .from(submissionEvidenceTable)
    .where(eq(submissionEvidenceTable.submissionId, submissionId))
    .orderBy(asc(submissionEvidenceTable.id));
  const [questionnaireTitle] = await db
    .select({ title: questionnairesTable.title })
    .from(tasksTable)
    .leftJoin(questionnairesTable, eq(tasksTable.questionnaireId, questionnairesTable.id))
    .where(eq(tasksTable.id, row.task.id));

  return {
    ...toSubmissionSummary(row, user),
    instructions: row.task.instructions,
    questionnaireId: row.task.questionnaireId ?? null,
    questionnaireTitle: questionnaireTitle?.title ?? null,
    questions: answers.map((answer) => ({
      id: answer.id,
      questionId: answer.questionId ?? null,
      prompt: answer.prompt,
      type: answer.type,
      required: answer.required,
      position: answer.position,
      options: answer.options ?? [],
      valueText: answer.valueText ?? null,
      valueNumber: answer.valueNumber ?? null,
      valueBoolean: answer.valueBoolean ?? null,
    })),
    evidence: evidence.map((item) => ({
      id: item.id,
      fileName: item.fileName,
      mimeType: item.mimeType,
      byteSize: item.byteSize,
      caption: item.caption ?? null,
      createdAt: iso(item.createdAt) as string,
      url: `/api/submissions/${submissionId}/evidence/${item.id}/file`,
    })),
  };
}

export type AnswerInput = {
  questionId: number;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
};

export type SaveAnswersResult = {
  answers: {
    id: number;
    prompt: string;
    type: string;
    required: boolean;
    position: number;
    valueText: string | null;
    valueNumber: number | null;
    valueBoolean: boolean | null;
  }[];
  missingRequired: string[];
  score: number | null;
};

/**
 * Writes the submitted answers onto the submission. The stored question list
 * is refreshed from the questionnaire every time so a report always reflects
 * the current questionnaire while keeping whatever the shopper typed.
 */
export async function saveAnswers(
  tx: DbClient,
  submissionId: number,
  questionnaireId: number | null,
  answers: AnswerInput[],
): Promise<SaveAnswersResult> {
  const questions = questionnaireId
    ? await tx
        .select()
        .from(questionnaireQuestionsTable)
        .where(eq(questionnaireQuestionsTable.questionnaireId, questionnaireId))
        .orderBy(asc(questionnaireQuestionsTable.position), asc(questionnaireQuestionsTable.id))
    : [];

  const existing = await tx
    .select()
    .from(submissionAnswersTable)
    .where(eq(submissionAnswersTable.submissionId, submissionId));
  const existingByQuestion = new Map(existing.map((row) => [row.questionId, row]));

  const answerByQuestion = new Map<number, AnswerInput>();
  for (const answer of answers) {
    answerByQuestion.set(answer.questionId, answer);
  }

  const stored: SaveAnswersResult["answers"] = [];
  const scorableValues: number[] = [];

  for (const [index, question] of questions.entries()) {
    const input = answerByQuestion.get(question.id);
    const prior = existingByQuestion.get(question.id);
    const valueText =
      question.type === "text" || question.type === "single_choice"
        ? input?.valueText?.trim() || prior?.valueText || null
        : prior?.valueText ?? null;
    const valueNumber =
      question.type === "rating" ? normalizeRating(input?.valueNumber ?? prior?.valueNumber) : null;
    const valueBoolean =
      question.type === "yes_no" ? (input?.valueBoolean ?? prior?.valueBoolean ?? null) : null;

    if (question.type === "rating" && valueNumber != null) {
      scorableValues.push((valueNumber / 5) * 100);
    }
    if (question.type === "yes_no" && valueBoolean != null) {
      scorableValues.push(valueBoolean ? 100 : 0);
    }

    if (prior) {
      const [updated] = await tx
        .update(submissionAnswersTable)
        .set({
          prompt: question.prompt,
          type: question.type,
          required: question.required,
          position: index,
          options: question.options ?? [],
          valueText,
          valueNumber,
          valueBoolean,
        })
        .where(eq(submissionAnswersTable.id, prior.id))
        .returning();
      stored.push(updated);
    } else {
      const [created] = await tx
        .insert(submissionAnswersTable)
        .values({
          submissionId,
          questionId: question.id,
          prompt: question.prompt,
          type: question.type,
          required: question.required,
          position: index,
          options: question.options ?? [],
          valueText,
          valueNumber,
          valueBoolean,
        })
        .returning();
      stored.push(created);
    }
  }

  // Answers belonging to questions that no longer exist are kept (they carry
  // the original prompt) but they are not scored or validated.
  const missingRequired = stored
    .filter((answer) => {
      if (!answer.required) return false;
      if (answer.type === "yes_no") return answer.valueBoolean == null;
      if (answer.type === "rating") return answer.valueNumber == null;
      return !answer.valueText || answer.valueText.trim() === "";
    })
    .map((answer) => answer.prompt);

  return {
    answers: stored,
    missingRequired,
    score: scorableValues.length ? roundScore(scorableValues.reduce((sum, value) => sum + value, 0) / scorableValues.length) : null,
  };
}

function normalizeRating(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  const clamped = Math.min(5, Math.max(1, Math.round(value)));
  return clamped;
}

/**
 * Ensures the stored answer rows match the current questionnaire. Called when
 * a draft is opened so the shopper always answers every current question.
 */
export async function syncAnswers(
  tx: DbClient,
  submissionId: number,
  questionnaireId: number | null,
) {
  if (!questionnaireId) return;
  const questions = await tx
    .select()
    .from(questionnaireQuestionsTable)
    .where(eq(questionnaireQuestionsTable.questionnaireId, questionnaireId))
    .orderBy(asc(questionnaireQuestionsTable.position), asc(questionnaireQuestionsTable.id));
  const existing = await tx
    .select()
    .from(submissionAnswersTable)
    .where(eq(submissionAnswersTable.submissionId, submissionId));
  const existingByQuestion = new Map(existing.map((row) => [row.questionId, row]));
  for (const [index, question] of questions.entries()) {
    const prior = existingByQuestion.get(question.id);
    if (prior) {
      await tx
        .update(submissionAnswersTable)
        .set({
          prompt: question.prompt,
          type: question.type,
          required: question.required,
          position: index,
          options: question.options ?? [],
        })
        .where(eq(submissionAnswersTable.id, prior.id));
    } else {
      await tx.insert(submissionAnswersTable).values({
        submissionId,
        questionId: question.id,
        prompt: question.prompt,
        type: question.type,
        required: question.required,
        position: index,
        options: question.options ?? [],
      });
    }
  }
}

/** Every report belonging to one shopper, newest first. */
export async function listShopperSubmissions(user: AuthUser) {
  if (!user.shopperId) return [];
  const rows = await db
    .select({
      submission: submissionsTable,
      storeName: storesTable.name,
      storeCode: storesTable.code,
      storeRegion: storesTable.region,
      storeCity: storesTable.city,
      shopperName: shoppersTable.fullName,
      task: tasksTable,
    })
    .from(submissionsTable)
    .innerJoin(storesTable, eq(submissionsTable.storeId, storesTable.id))
    .leftJoin(shoppersTable, eq(submissionsTable.shopperId, shoppersTable.id))
    .innerJoin(tasksTable, eq(submissionsTable.taskId, tasksTable.id))
    .where(eq(submissionsTable.shopperId, user.shopperId))
    .orderBy(desc(submissionsTable.updatedAt));
  return Promise.all(
    rows.map(async (row) =>
      toSubmissionSummary(
        { ...row, reviewerName: null, evidenceCount: await countEvidence(row.submission.id) },
        user,
      ),
    ),
  );
}

export async function countEvidence(submissionId: number, client: DbClient = db): Promise<number> {
  const [row] = await client
    .select({ value: count() })
    .from(submissionEvidenceTable)
    .where(eq(submissionEvidenceTable.submissionId, submissionId));
  return Number(row?.value ?? 0);
}

export const submissionOrderBy = [desc(submissionsTable.updatedAt)];

export function statusFilter(statuses: SubmissionStatus[]) {
  return inArray(submissionsTable.status, statuses);
}
