import { and, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
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
  const user = req.authUser!;
  const conditions = [...scopeConditions(user)];
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
  if (!user.shopperId) {
    res.status(403).json({ error: "Your account is not linked to a shopper profile." });
    return;
  }
  const [shopper] = await db
    .select()
    .from(shoppersTable)
    .where(eq(shoppersTable.id, user.shopperId));
  if (!shopper) {
    res.status(403).json({ error: "Your shopper profile could not be found." });
    return;
  }
  if (shopper.verificationStatus !== "verified" || shopper.accountStatus !== "active") {
    res.status(403).json({ error: "Only verified, active shoppers can submit reports." });
    return;
  }

  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, parsed.data.taskId));
  if (!task) {
    res.status(404).json({ error: "Task not found." });
    return;
  }
  if (task.shopperId !== user.shopperId) {
    res.status(403).json({ error: "This assignment belongs to another shopper." });
    return;
  }
  if (!REPORTABLE_TASK_STATUSES.includes(task.status)) {
    res.status(400).json({
      error: "This visit is not open for reporting. Ask an administrator to assign it to you.",
    });
    return;
  }

  const [existing] = await db
    .select()
    .from(submissionsTable)
    .where(eq(submissionsTable.taskId, task.id));
  if (existing) {
    await db.transaction(async (tx) => {
      await syncAnswers(tx, existing.id, task.questionnaireId);
    });
    const detail = await loadSubmissionDetail(existing.id, user);
    res.status(201).json(CreateSubmissionResponse.parse(detail));
    return;
  }

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(submissionsTable)
      .values({
        taskId: task.id,
        shopperId: user.shopperId!,
        storeId: task.storeId,
        status: "draft",
      })
      .returning();
    await syncAnswers(tx, row.id, task.questionnaireId);
    return row;
  });
  await db.update(tasksTable).set({ status: "in_progress" }).where(eq(tasksTable.id, task.id));
  const detail = await loadSubmissionDetail(created.id, user);
  await recordActivity(
    "created",
    "submission",
    created.id,
    `Started report for ${detail?.storeName ?? "store"}`,
    user.id,
  );
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
  if (user.role === "mystery_shopper" && row.submission.shopperId !== user.shopperId) return null;
  if (user.role === "regional_executive" && row.storeRegion !== user.region) return null;
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
  // Opening a draft re-syncs it with the current questionnaire.
  if (canEditSubmission(row.submission, req.authUser!, row.submission.shopperId)) {
    await db.transaction(async (tx) => {
      await syncAnswers(tx, row.submission.id, row.task.questionnaireId);
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
  const row = await loadSubmissionRow(submissionId);
  if (!row) return { ok: false, status: 404, message: "Report not found." };
  if (!canEditSubmission(row.submission, user, row.submission.shopperId)) {
    return { ok: false, status: 403, message: "This report can no longer be edited." };
  }

  const result = await db.transaction(async (tx) => {
    const saved = await saveAnswers(
      tx,
      submissionId,
      row.task.questionnaireId,
      body.answers ?? [],
    );
    const comment = body.comment?.trim() || null;
    const evidenceCount = await countEvidence(submissionId);
    let status = row.submission.status as SubmissionStatus;
    let submittedAt = row.submission.submittedAt;
    let score = row.submission.score;

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

    const [updated] = await tx
      .update(submissionsTable)
      .set({ comment, status, submittedAt, score })
      .where(eq(submissionsTable.id, submissionId))
      .returning();

    if (submit) {
      await tx
        .update(tasksTable)
        .set({ status: "submitted", submittedAt: new Date(), reviewerComment: null, reviewedAt: null })
        .where(eq(tasksTable.id, row.task.id));
    }
    return { ok: true as const, updated };
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
    const parsed = AddSubmissionEvidenceBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: !params.success
          ? params.error.message
          : parsed.error?.message ?? "Invalid evidence payload.",
      });
      return;
    }
    const user = req.authUser!;
    const row = await loadSubmissionRow(params.data.submissionId);
    if (!row) {
      res.status(404).json({ error: "Report not found." });
      return;
    }
    if (!canEditSubmission(row.submission, user, row.submission.shopperId)) {
      forbidden(res);
      return;
    }

    const input = parsed.data;
    const mimeType = input.mimeType.toLowerCase();
    if (!(ALLOWED_EVIDENCE_MIME_TYPES as readonly string[]).includes(mimeType)) {
      res.status(400).json({ error: "Upload a JPEG, PNG, WebP or HEIC photo." });
      return;
    }
    const base64 = input.data.includes(",") ? input.data.split(",").pop() ?? "" : input.data;
    if (!/^[A-Za-z0-9+/=\s]+$/.test(base64)) {
      res.status(400).json({ error: "The photo could not be read. Try uploading it again." });
      return;
    }
    const byteSize = Math.floor((base64.replace(/=+$/, "").length * 3) / 4);
    if (byteSize > MAX_EVIDENCE_BYTES) {
      res
        .status(400)
        .json({ error: `Photos must be ${Math.floor(MAX_EVIDENCE_BYTES / 1024 / 1024)} MB or smaller.` });
      return;
    }
    const current = await countEvidence(row.submission.id);
    if (current >= MAX_EVIDENCE_PER_SUBMISSION) {
      res
        .status(400)
        .json({ error: `A report can hold at most ${MAX_EVIDENCE_PER_SUBMISSION} photos.` });
      return;
    }

    await db.insert(submissionEvidenceTable).values({
      submissionId: row.submission.id,
      fileName: input.fileName.slice(0, 180),
      mimeType,
      byteSize,
      caption: input.caption?.trim() || null,
      data: base64,
      uploadedByUserId: user.id,
    });
    await recordActivity(
      "updated",
      "submission",
      row.submission.id,
      `Added evidence to report #${row.submission.id}`,
      user.id,
    );
    const detail = await loadSubmissionDetail(row.submission.id, user);
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
    const row = await loadSubmissionRow(params.data.submissionId);
    if (!row) {
      res.status(404).json({ error: "Report not found." });
      return;
    }
    if (!canEditSubmission(row.submission, user, row.submission.shopperId)) {
      forbidden(res);
      return;
    }
    const [deleted] = await db
      .delete(submissionEvidenceTable)
      .where(
        and(
          eq(submissionEvidenceTable.id, params.data.evidenceId),
          eq(submissionEvidenceTable.submissionId, params.data.submissionId),
        ),
      )
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Photo not found." });
      return;
    }
    const detail = await loadSubmissionDetail(row.submission.id, user);
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
    res.setHeader("Content-Type", evidence.mimeType);
    res.setHeader("Content-Length", String(evidence.byteSize));
    res.setHeader("Cache-Control", "private, max-age=60");
    res.setHeader("Content-Disposition", `inline; filename="${evidence.fileName.replaceAll('"', "")}"`);
    res.send(Buffer.from(evidence.data, "base64"));
  },
);

export default router;
