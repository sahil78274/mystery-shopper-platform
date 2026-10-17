import { and, desc, eq, gte, ilike, lte, ne, or } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import {
  AddSubmissionEvidenceBody,
  AddSubmissionEvidenceParams,
  AddSubmissionEvidenceResponse,
  CreateSubmissionBody,
  CreateSubmissionResponse,
  DeleteSubmissionEvidenceParams,
  DeleteSubmissionEvidenceResponse,
  GetMySubmissionsQueryParams,
  GetMySubmissionsResponse,
  GetSubmissionEvidenceFileParams,
  GetSubmissionParams,
  GetSubmissionResponse,
  GetSubmissionsQueryParams,
  GetSubmissionsResponse,
  SaveSubmissionDraftBody,
  SaveSubmissionDraftParams,
  SaveSubmissionDraftResponse,
  SubmitSubmissionBody,
  SubmitSubmissionParams,
  SubmitSubmissionResponse,
} from "@workspace/api-zod";
import {
  db,
  shoppersTable,
  storesTable,
  submissionEvidenceTable,
  submissionsTable,
  tasksTable,
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_PER_SUBMISSION,
  ALLOWED_EVIDENCE_MIME_TYPES,
  type SubmissionStatus,
} from "@workspace/db";
import { requireAuth, requireRole, type AuthUser } from "../lib/auth";
import { decodeImageEvidence } from "../lib/evidence";
import { normalizeTextFields, validDateRange } from "../lib/validation";
import { canAccessRegion, canResumeSubmission, canViewSubmissionStatus } from "../lib/workflow";
import { recordActivity } from "../lib/platform";
import {
  canEditSubmission,
  countEvidence,
  loadSubmissionDetail,
  loadSubmissionRow,
  saveAnswers,
  scopeConditions,
  syncAnswers,
  toSubmissionSummary,
  type AnswerInput,
} from "../lib/submissions";

const router: IRouter = Router();

/** Task statuses that a shopper is allowed to report on. */
const REPORTABLE_TASK_STATUSES = ["assigned", "in_progress", "needs_correction"];

function forbidden(res: { status: (code: number) => { json: (body: unknown) => void } }): void {
  res.status(403).json({ error: "You cannot access this report." });
}

router.get("/submissions", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetSubmissionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!validDateRange(parsed.data.from, parsed.data.to)) {
    res.status(400).json({ error: "Enter valid dates with the start date on or before the end date." });
    return;
  }
  const user = req.authUser!;
  const conditions = [...scopeConditions(user)];
  if (!canViewSubmissionStatus(user.role, "draft")) {
    conditions.push(ne(submissionsTable.status, "draft"));
  }
  if (parsed.data.status) conditions.push(eq(submissionsTable.status, parsed.data.status));
  if (parsed.data.storeId) conditions.push(eq(submissionsTable.storeId, parsed.data.storeId));
  if (parsed.data.search) {
    const term = `%${parsed.data.search}%`;
    conditions.push(
      or(
        ilike(storesTable.name, term),
        ilike(storesTable.code, term),
        ilike(shoppersTable.fullName, term),
      )!,
    );
  }
  if (parsed.data.from) conditions.push(gte(submissionsTable.submittedAt, new Date(parsed.data.from)));
  if (parsed.data.to) {
    const end = new Date(`${parsed.data.to}T23:59:59.999Z`);
    conditions.push(lte(submissionsTable.submittedAt, end));
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
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(submissionsTable.updatedAt));

  const summaries = await Promise.all(
    rows.map(async (row) => {
      const evidenceCount = await countEvidence(row.submission.id);
      return toSubmissionSummary({ ...row, reviewerName: null, evidenceCount }, user);
    }),
  );
  res.json(GetSubmissionsResponse.parse(summaries));
});

router.post("/submissions", requireRole("mystery_shopper"), async (req, res): Promise<void> => {
  const parsed = CreateSubmissionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = req.authUser!;
  const shopperId = user.shopperId;
  if (shopperId == null) {
    res.status(403).json({ error: "Your account is not linked to a shopper profile." });
    return;
  }

  const result = await db.transaction(async (tx) => {
    // Lock the assignment before inspecting/creating its single report. Task
    // edits use the same lock, so reassignment cannot race report creation.
    const [task] = await tx
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.id, parsed.data.taskId))
      .for("update");
    if (!task) return { ok: false as const, status: 404, message: "Task not found." };
    const assignedShopperId = task.shopperId;
    if (assignedShopperId == null || assignedShopperId !== shopperId) {
      return { ok: false as const, status: 403, message: "This assignment belongs to another shopper." };
    }
    const [shopper] = await tx
      .select({ verificationStatus: shoppersTable.verificationStatus, accountStatus: shoppersTable.accountStatus })
      .from(shoppersTable)
      .where(eq(shoppersTable.id, shopperId));
    if (!shopper || shopper.verificationStatus !== "verified" || shopper.accountStatus !== "active") {
      return { ok: false as const, status: 403, message: "Only verified, active shoppers can submit reports." };
    }
    if (!REPORTABLE_TASK_STATUSES.includes(task.status)) {
      return {
        ok: false as const,
        status: 400,
        message: "This visit is not open for reporting. Ask an administrator to assign it to you.",
      };
    }

    const [existing] = await tx
      .select()
      .from(submissionsTable)
      .where(eq(submissionsTable.taskId, task.id))
      .for("update");
    if (existing) {
      if (!canResumeSubmission(shopperId, assignedShopperId, existing.shopperId)) {
        return {
          ok: false as const,
          status: 409,
          message: "This task already has a report from another shopper and cannot be reassigned.",
        };
      }
      if (!canEditSubmission(existing, user, existing.shopperId)) {
        return {
          ok: false as const,
          status: 409,
          message: "This report is no longer open for editing.",
        };
      }
      await syncAnswers(tx, existing.id, task.questionnaireId);
      return { ok: true as const, submissionId: existing.id, created: false };
    }

    const [created] = await tx
      .insert(submissionsTable)
      .values({
        taskId: task.id,
        shopperId,
        storeId: task.storeId,
        status: "draft",
      })
      .returning();
    await syncAnswers(tx, created.id, task.questionnaireId);
    await tx.update(tasksTable).set({ status: "in_progress" }).where(eq(tasksTable.id, task.id));
    return { ok: true as const, submissionId: created.id, created: true };
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }
  const detail = await loadSubmissionDetail(result.submissionId, user);
  if (!detail) {
    res.status(500).json({ error: "The report could not be loaded after it was started." });
    return;
  }
  if (result.created) {
    await recordActivity(
      "created",
      "submission",
      result.submissionId,
      `Started report for ${detail.storeName}`,
      user.id,
    );
  }
  res.status(201).json(CreateSubmissionResponse.parse(detail));
});

router.get("/submissions/mine", requireRole("mystery_shopper"), async (req, res): Promise<void> => {
  const parsed = GetMySubmissionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = req.authUser!;
  if (!user.shopperId) {
    res.json(GetMySubmissionsResponse.parse([]));
    return;
  }
  const conditions = [eq(submissionsTable.shopperId, user.shopperId)];
  if (parsed.data.status) conditions.push(eq(submissionsTable.status, parsed.data.status));
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
  const summaries = await Promise.all(
    rows.map(async (row) =>
      toSubmissionSummary(
        { ...row, reviewerName: null, evidenceCount: await countEvidence(row.submission.id) },
        user,
      ),
    ),
  );
  res.json(GetMySubmissionsResponse.parse(summaries));
});

async function loadForActor(submissionId: number, req: Request) {
  const row = await loadSubmissionRow(submissionId);
  if (!row) return null;
  const user = req.authUser!;
  if (!canViewSubmissionStatus(user.role, row.submission.status)) return null;
  if (user.role === "mystery_shopper" && row.submission.shopperId !== user.shopperId) return null;
  if (!canAccessRegion(user.role, user.region, row.storeRegion)) return null;
  return row;
}

router.get("/submissions/:submissionId", requireAuth, async (req, res): Promise<void> => {
  const params = GetSubmissionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const row = await loadForActor(params.data.submissionId, req);
  if (!row) {
    res.status(404).json({ error: "Report not found." });
    return;
  }
  // Opening an editable draft re-syncs it with the questionnaire while holding
  // the same task/report locks as review and save operations.
  if (canEditSubmission(row.submission, req.authUser!, row.submission.shopperId)) {
    await db.transaction(async (tx) => {
      const [task] = await tx
        .select()
        .from(tasksTable)
        .where(eq(tasksTable.id, row.task.id))
        .for("update");
      if (!task) return;
      const [submission] = await tx
        .select()
        .from(submissionsTable)
        .where(eq(submissionsTable.id, row.submission.id))
        .for("update");
      if (!submission || !canEditSubmission(submission, req.authUser!, submission.shopperId)) return;
      await syncAnswers(tx, submission.id, task.questionnaireId);
    });
  }
  const detail = await loadSubmissionDetail(params.data.submissionId, req.authUser!);
  res.json(GetSubmissionResponse.parse(detail));
});

async function persistAnswers(
  submissionId: number,
  user: AuthUser,
  body: { comment?: string | null; answers: AnswerInput[] },
  submit: boolean,
): Promise<
  | { ok: true; detail: Awaited<ReturnType<typeof loadSubmissionDetail>> }
  | { ok: false; status: number; message: string }
> {
  const snapshot = await loadSubmissionRow(submissionId);
  if (!snapshot) return { ok: false, status: 404, message: "Report not found." };

  const result = await db.transaction(async (tx) => {
    // Lock task first to match review and reassignment lock order.
    const [task] = await tx
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.id, snapshot.task.id))
      .for("update");
    if (!task) return { ok: false as const, status: 404, message: "Report not found." };
    const [submission] = await tx
      .select()
      .from(submissionsTable)
      .where(eq(submissionsTable.id, submissionId))
      .for("update");
    if (!submission) return { ok: false as const, status: 404, message: "Report not found." };
    if (task.shopperId !== user.shopperId || !canEditSubmission(submission, user, submission.shopperId)) {
      return { ok: false as const, status: 403, message: "This report can no longer be edited." };
    }

    const saved = await saveAnswers(
      tx,
      submissionId,
      task.questionnaireId,
      body.answers ?? [],
    );
    const comment = body.comment?.trim() || null;
    const evidenceCount = await countEvidence(submissionId, tx);
    let status = submission.status as SubmissionStatus;
    let submittedAt = submission.submittedAt;
    let score = submission.score;

    if (submit) {
      if (saved.missingRequired.length) {
        return {
          ok: false as const,
          status: 400,
          message: `Answer the required question${saved.missingRequired.length > 1 ? "s" : ""}: ${saved.missingRequired.join("; ")}`,
        };
      }
      if (!comment) {
        return { ok: false as const, status: 400, message: "Add the visit comment before submitting." };
      }
      if (evidenceCount < 1) {
        return { ok: false as const, status: 400, message: "Attach at least one evidence photo before submitting." };
      }
      status = "submitted";
      submittedAt = new Date();
      score = saved.score;
    }

    await tx
      .update(submissionsTable)
      .set({ comment, status, submittedAt, score })
      .where(eq(submissionsTable.id, submissionId));

    if (submit) {
      await tx
        .update(tasksTable)
        .set({ status: "submitted", submittedAt: new Date(), reviewerComment: null, reviewedAt: null })
        .where(eq(tasksTable.id, task.id));
    }
    return { ok: true as const };
  });

  if (!result.ok) return { ok: false, status: result.status, message: result.message };

  await recordActivity(
    submit ? "submitted" : "updated",
    "submission",
    submissionId,
    submit ? `Submitted report #${submissionId}` : `Saved draft for report #${submissionId}`,
    user.id,
  );
  const detail = await loadSubmissionDetail(submissionId, user);
  return { ok: true, detail };
}

router.put("/submissions/:submissionId/draft", requireRole("mystery_shopper"), async (req, res): Promise<void> => {
  const params = SaveSubmissionDraftParams.safeParse(req.params);
  const parsed = SaveSubmissionDraftBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({
      error: !params.success ? params.error.message : parsed.error?.message ?? "Invalid report data.",
    });
    return;
  }
  const result = await persistAnswers(params.data.submissionId, req.authUser!, parsed.data, false);
  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }
  res.json(SaveSubmissionDraftResponse.parse(result.detail));
});

router.post("/submissions/:submissionId/submit", requireRole("mystery_shopper"), async (req, res): Promise<void> => {
  const params = SubmitSubmissionParams.safeParse(req.params);
  const parsed = SubmitSubmissionBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({
      error: !params.success ? params.error.message : parsed.error?.message ?? "Invalid report data.",
    });
    return;
  }
  const result = await persistAnswers(params.data.submissionId, req.authUser!, parsed.data, true);
  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }
  res.json(SubmitSubmissionResponse.parse(result.detail));
});

router.post(
  "/submissions/:submissionId/evidence",
  requireRole("mystery_shopper"),
  async (req, res): Promise<void> => {
    const params = AddSubmissionEvidenceParams.safeParse(req.params);
    const parsed = AddSubmissionEvidenceBody.safeParse(
      normalizeTextFields(req.body, ["fileName", "mimeType", "data", "caption"], ["caption"]),
    );
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: !params.success
          ? params.error.message
          : parsed.error?.message ?? "Invalid evidence payload.",
      });
      return;
    }

    const user = req.authUser!;
    const input = parsed.data;
    const mimeType = input.mimeType.toLowerCase();
    if (!(ALLOWED_EVIDENCE_MIME_TYPES as readonly string[]).includes(mimeType)) {
      res.status(400).json({ error: "Upload a JPEG, PNG, WebP or HEIC photo." });
      return;
    }
    const bytes = decodeImageEvidence(input.data, mimeType);
    if (!bytes) {
      res.status(400).json({ error: "The photo data is invalid or does not match its image type." });
      return;
    }
    const byteSize = bytes.byteLength;
    if (byteSize > MAX_EVIDENCE_BYTES) {
      res
        .status(400)
        .json({ error: `Photos must be ${Math.floor(MAX_EVIDENCE_BYTES / 1024 / 1024)} MB or smaller.` });
      return;
    }

    const snapshot = await loadSubmissionRow(params.data.submissionId);
    if (!snapshot) {
      res.status(404).json({ error: "Report not found." });
      return;
    }
    const fileName =
      input.fileName
        .split(/[\\/]/)
        .pop()
        ?.replace(/[\r\n"]/g, "_")
        .slice(0, 180) || "evidence";

    const result = await db.transaction(async (tx) => {
      const [task] = await tx
        .select()
        .from(tasksTable)
        .where(eq(tasksTable.id, snapshot.task.id))
        .for("update");
      if (!task) return { ok: false as const, status: 404, message: "Report not found." };
      const [submission] = await tx
        .select()
        .from(submissionsTable)
        .where(eq(submissionsTable.id, snapshot.submission.id))
        .for("update");
      if (!submission) return { ok: false as const, status: 404, message: "Report not found." };
      if (
        task.shopperId !== user.shopperId ||
        !canEditSubmission(submission, user, submission.shopperId)
      ) {
        return { ok: false as const, status: 403, message: "You cannot edit this report." };
      }

      const current = await countEvidence(submission.id, tx);
      if (current >= MAX_EVIDENCE_PER_SUBMISSION) {
        return {
          ok: false as const,
          status: 400,
          message: `A report can hold at most ${MAX_EVIDENCE_PER_SUBMISSION} photos.`,
        };
      }
      await tx.insert(submissionEvidenceTable).values({
        submissionId: submission.id,
        fileName,
        mimeType,
        byteSize,
        caption: input.caption?.trim() || null,
        data: bytes.toString("base64"),
        uploadedByUserId: user.id,
      });
      return { ok: true as const, submissionId: submission.id };
    });

    if (!result.ok) {
      res.status(result.status).json({ error: result.message });
      return;
    }
    await recordActivity(
      "updated",
      "submission",
      result.submissionId,
      `Added evidence to report #${result.submissionId}`,
      user.id,
    );
    const detail = await loadSubmissionDetail(result.submissionId, user);
    res.status(201).json(AddSubmissionEvidenceResponse.parse(detail));
  },
);

router.delete(
  "/submissions/:submissionId/evidence/:evidenceId",
  requireRole("mystery_shopper"),
  async (req, res): Promise<void> => {
    const params = DeleteSubmissionEvidenceParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const user = req.authUser!;
    const snapshot = await loadSubmissionRow(params.data.submissionId);
    if (!snapshot) {
      res.status(404).json({ error: "Report not found." });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [task] = await tx
        .select()
        .from(tasksTable)
        .where(eq(tasksTable.id, snapshot.task.id))
        .for("update");
      if (!task) return { ok: false as const, status: 404, message: "Report not found." };
      const [submission] = await tx
        .select()
        .from(submissionsTable)
        .where(eq(submissionsTable.id, snapshot.submission.id))
        .for("update");
      if (!submission) return { ok: false as const, status: 404, message: "Report not found." };
      if (
        task.shopperId !== user.shopperId ||
        !canEditSubmission(submission, user, submission.shopperId)
      ) {
        return { ok: false as const, status: 403, message: "You cannot edit this report." };
      }
      const [deleted] = await tx
        .delete(submissionEvidenceTable)
        .where(
          and(
            eq(submissionEvidenceTable.id, params.data.evidenceId),
            eq(submissionEvidenceTable.submissionId, params.data.submissionId),
          ),
        )
        .returning({ id: submissionEvidenceTable.id });
      if (!deleted) return { ok: false as const, status: 404, message: "Photo not found." };
      return { ok: true as const, submissionId: submission.id };
    });

    if (!result.ok) {
      res.status(result.status).json({ error: result.message });
      return;
    }
    const detail = await loadSubmissionDetail(result.submissionId, user);
    res.json(DeleteSubmissionEvidenceResponse.parse(detail));
  },
);

router.get(
  "/submissions/:submissionId/evidence/:evidenceId/file",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetSubmissionEvidenceFileParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const row = await loadForActor(params.data.submissionId, req);
    if (!row) {
      res.status(404).json({ error: "Photo not found." });
      return;
    }
    const [evidence] = await db
      .select()
      .from(submissionEvidenceTable)
      .where(
        and(
          eq(submissionEvidenceTable.id, params.data.evidenceId),
          eq(submissionEvidenceTable.submissionId, params.data.submissionId),
        ),
      );
    if (!evidence) {
      res.status(404).json({ error: "Photo not found." });
      return;
    }
    const mimeType = evidence.mimeType.toLowerCase();
    const verifiedImage = (ALLOWED_EVIDENCE_MIME_TYPES as readonly string[]).includes(mimeType)
      ? decodeImageEvidence(evidence.data, mimeType)
      : null;
    const bytes = verifiedImage ?? Buffer.from(evidence.data, "base64");
    if (!bytes.length) {
      res.status(404).json({ error: "Photo unavailable." });
      return;
    }
    const fileName =
      evidence.fileName
        .split(/[\\/]/)
        .pop()
        ?.replace(/[\u0000-\u001f\u007f"]/g, "_")
        .slice(0, 180) || "evidence";
    const safeInlineImage = Boolean(verifiedImage && verifiedImage.byteLength <= MAX_EVIDENCE_BYTES);
    res.setHeader("Content-Type", safeInlineImage ? mimeType : "application/octet-stream");
    res.setHeader("Content-Length", String(bytes.byteLength));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=60");
    res.setHeader(
      "Content-Disposition",
      `${safeInlineImage ? "inline" : "attachment"}; filename="${fileName}"`,
    );
    res.send(bytes);
  },
);

export default router;
