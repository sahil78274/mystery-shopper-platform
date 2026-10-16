import { and, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  DecideReviewBody,
  DecideReviewParams,
  DecideReviewResponse,
  GetReviewHistoryQueryParams,
  GetReviewHistoryResponse,
  GetReviewOverviewResponse,
  GetReviewQueueQueryParams,
  GetReviewQueueResponse,
} from "@workspace/api-zod";
import {
  db,
  questionnairesTable,
  shoppersTable,
  storesTable,
  submissionsTable,
  tasksTable,
  type SubmissionStatus,
} from "@workspace/db";
import { requireRoleOrAdmin, type AuthUser } from "../lib/auth";
import { recordActivity, roundScore } from "../lib/platform";
import {
  countEvidence,
  loadSubmissionDetail,
  loadSubmissionRow,
  scopeConditions,
  toSubmissionSummary,
} from "../lib/submissions";

const router: IRouter = Router();

const REVIEW_DECISIONS: SubmissionStatus[] = ["approved", "rejected", "needs_correction"];

async function listSubmissions(
  user: AuthUser,
  statuses: SubmissionStatus[],
  query: {
    search?: string;
    status?: SubmissionStatus;
    from?: string | Date;
    to?: string | Date;
  } = {},
) {
  const conditions = [...scopeConditions(user)];
  const wanted = query.status ? [query.status] : statuses;
  if (wanted.length) conditions.push(or(...wanted.map((status) => eq(submissionsTable.status, status)))!);
  if (query.search) {
    const term = `%${query.search}%`;
    conditions.push(
      or(
        ilike(storesTable.name, term),
        ilike(storesTable.code, term),
        ilike(shoppersTable.fullName, term),
      )!,
    );
  }
  if (query.from) conditions.push(gte(submissionsTable.reviewedAt, new Date(query.from)));
  if (query.to) {
    const end = query.to instanceof Date ? query.to : new Date(`${query.to}T23:59:59.999Z`);
    if (!(query.to instanceof Date)) end.setUTCHours(23, 59, 59, 999);
    conditions.push(lte(submissionsTable.reviewedAt, end));
  }

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
    .where(and(...conditions))
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

router.get("/reviews/overview", requireRoleOrAdmin("reviewer"), async (req, res): Promise<void> => {
  const user = req.authUser!;
  const rows = await listSubmissions(user, ["submitted", "under_review", "approved", "rejected", "needs_correction"]);
  const approved = rows.filter((row) => row.status === "approved");
  const scores = approved.map((row) => row.score).filter((score): score is number => score != null);
  res.json(
    GetReviewOverviewResponse.parse({
      awaitingReview: rows.filter((row) => row.status === "submitted").length,
      inReview: rows.filter((row) => row.status === "under_review").length,
      approved: approved.length,
      rejected: rows.filter((row) => row.status === "rejected").length,
      needsCorrection: rows.filter((row) => row.status === "needs_correction").length,
      averageScore: scores.length ? roundScore(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null,
      recentDecisions: rows
        .filter((row) => row.reviewedAt)
        .sort((a, b) => String(b.reviewedAt).localeCompare(String(a.reviewedAt)))
        .slice(0, 6),
    }),
  );
});

router.get("/reviews/queue", requireRoleOrAdmin("reviewer"), async (req, res): Promise<void> => {
  const parsed = GetReviewQueueQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rows = await listSubmissions(req.authUser!, ["submitted", "under_review"], parsed.data);
  res.json(GetReviewQueueResponse.parse(rows));
});

router.get("/reviews/history", requireRoleOrAdmin("reviewer"), async (req, res): Promise<void> => {
  const parsed = GetReviewHistoryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rows = await listSubmissions(req.authUser!, REVIEW_DECISIONS, parsed.data);
  res.json(GetReviewHistoryResponse.parse(rows));
});

router.post("/reviews/:submissionId", requireRoleOrAdmin("reviewer"), async (req, res): Promise<void> => {
  const params = DecideReviewParams.safeParse(req.params);
  const parsed = DecideReviewBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({
      error: !params.success
        ? params.error.message
        : parsed.error?.message ?? "Invalid review decision.",
    });
    return;
  }
  const user = req.authUser!;
  const row = await loadSubmissionRow(params.data.submissionId);
  if (!row) {
    res.status(404).json({ error: "Report not found." });
    return;
  }
  const comment = parsed.data.comment?.trim() || null;
  if (
    (parsed.data.status === "rejected" || parsed.data.status === "needs_correction") &&
    !comment
  ) {
    res.status(400).json({ error: "Add a reviewer comment explaining this outcome." });
    return;
  }
  if (!["submitted", "under_review"].includes(row.submission.status) && parsed.data.status === "under_review") {
    res.status(400).json({ error: "This report has already received a decision." });
    return;
  }

  const now = new Date();
  const decided = REVIEW_DECISIONS.includes(parsed.data.status as SubmissionStatus);
  await db
    .update(submissionsTable)
    .set({
      status: parsed.data.status,
      reviewerComment: comment,
      reviewerUserId: user.id,
      reviewedAt: decided ? now : null,
    })
    .where(eq(submissionsTable.id, row.submission.id));

  await db
    .update(tasksTable)
    .set({
      status: parsed.data.status === "approved" ? "approved" : parsed.data.status,
      reviewerComment: comment,
      reviewedAt: decided ? now : null,
    })
    .where(eq(tasksTable.id, row.task.id));

  await recordActivity(
    parsed.data.status,
    "submission",
    row.submission.id,
    `${parsed.data.status.replaceAll("_", " ")} report #${row.submission.id}`,
    user.id,
  );

  const detail = await loadSubmissionDetail(row.submission.id, user);
  res.json(DecideReviewResponse.parse(detail));
});

export default router;
