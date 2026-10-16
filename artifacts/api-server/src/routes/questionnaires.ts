import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateQuestionnaireBody,
  CreateQuestionnaireResponse,
  GetQuestionnaireParams,
  GetQuestionnaireResponse,
  GetQuestionnairesQueryParams,
  GetQuestionnairesResponse,
  UpdateQuestionnaireBody,
  UpdateQuestionnaireParams,
  UpdateQuestionnaireResponse,
} from "@workspace/api-zod";
import {
  db,
  questionnaireQuestionsTable,
  questionnairesTable,
  tasksTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../lib/auth";
import { iso, recordActivity } from "../lib/platform";

const router: IRouter = Router();

type QuestionValue = {
  prompt: string;
  type: string;
  required: boolean;
  position: number;
  options: string[];
};

function validQuestions(questions: QuestionValue[]): boolean {
  return questions.every((question) => {
    if (!question.prompt.trim()) return false;
    if (question.type === "single_choice") {
      return question.options.length >= 2;
    }
    return question.options.length === 0;
  });
}

async function getQuestionnaireRow(questionnaireId: number) {
  const [questionnaire] = await db
    .select()
    .from(questionnairesTable)
    .where(eq(questionnairesTable.id, questionnaireId));
  if (!questionnaire) return null;
  const questions = await db
    .select()
    .from(questionnaireQuestionsTable)
    .where(eq(questionnaireQuestionsTable.questionnaireId, questionnaireId))
    .orderBy(asc(questionnaireQuestionsTable.position));
  return {
    ...questionnaire,
    createdAt: iso(questionnaire.createdAt),
    updatedAt: iso(questionnaire.updatedAt),
    questions: questions.map((question) => ({
      ...question,
      options: question.options ?? [],
    })),
  };
}

router.get("/questionnaires", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetQuestionnairesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const conditions = [];
  if (parsed.data.search) {
    const search = `%${parsed.data.search}%`;
    conditions.push(
      or(
        ilike(questionnairesTable.title, search),
        ilike(questionnairesTable.description, search),
      ),
    );
  }
  if (parsed.data.status) {
    conditions.push(eq(questionnairesTable.status, parsed.data.status));
  }
  const rows = await db
    .select()
    .from(questionnairesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(questionnairesTable.createdAt));
  const results = await Promise.all(
    rows.map((row) => getQuestionnaireRow(row.id)),
  );
  res.json(GetQuestionnairesResponse.parse(results));
});

router.post("/questionnaires", requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateQuestionnaireBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!validQuestions(parsed.data.questions)) {
    res.status(400).json({
      error: "Every question needs a prompt. Single-choice questions need at least two options.",
    });
    return;
  }
  const questionnaire = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(questionnairesTable)
      .values({
        title: parsed.data.title.trim(),
        description: parsed.data.description,
        status: parsed.data.status,
      })
      .returning();
    if (parsed.data.questions.length) {
      await tx.insert(questionnaireQuestionsTable).values(
        parsed.data.questions.map((question, index) => ({
          questionnaireId: created.id,
          prompt: question.prompt.trim(),
          type: question.type,
          required: question.required,
          position: index,
          options: question.options,
        })),
      );
    }
    return created;
  });
  await recordActivity(
    "created",
    "questionnaire",
    questionnaire.id,
    `Created questionnaire ${questionnaire.title}`,
    req.authUser!.id,
  );
  const result = await getQuestionnaireRow(questionnaire.id);
  res.status(201).json(CreateQuestionnaireResponse.parse(result));
});

router.get(
  "/questionnaires/:questionnaireId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetQuestionnaireParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const user = req.authUser!;
    if (user.role === "mystery_shopper") {
      // A shopper may only read a questionnaire that one of their own visits uses.
      const owned = await db
        .select({ id: tasksTable.id })
        .from(tasksTable)
        .where(
          and(
            eq(tasksTable.questionnaireId, params.data.questionnaireId),
            user.shopperId ? eq(tasksTable.shopperId, user.shopperId) : sql`false`,
          ),
        )
        .limit(1);
      if (!owned.length) {
        res.status(403).json({ error: "You cannot access this questionnaire." });
        return;
      }
    }
    const result = await getQuestionnaireRow(params.data.questionnaireId);
    if (!result) {
      res.status(404).json({ error: "Questionnaire not found." });
      return;
    }
    res.json(GetQuestionnaireResponse.parse(result));
  },
);

router.patch(
  "/questionnaires/:questionnaireId",
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const params = UpdateQuestionnaireParams.safeParse(req.params);
    const parsed = UpdateQuestionnaireBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: !params.success
          ? params.error.message
          : parsed.error?.message ?? "Invalid questionnaire data.",
      });
      return;
    }
    const [existing] = await db
      .select()
      .from(questionnairesTable)
      .where(eq(questionnairesTable.id, params.data.questionnaireId));
    if (!existing) {
      res.status(404).json({ error: "Questionnaire not found." });
      return;
    }
    if (
      parsed.data.questions &&
      !validQuestions(parsed.data.questions)
    ) {
      res.status(400).json({
        error: "Every question needs a prompt. Single-choice questions need at least two options.",
      });
      return;
    }
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(questionnairesTable)
        .set({
          ...(parsed.data.title !== undefined
            ? { title: parsed.data.title.trim() }
            : {}),
          ...(parsed.data.description !== undefined
            ? { description: parsed.data.description }
            : {}),
          ...(parsed.data.status !== undefined
            ? { status: parsed.data.status }
            : {}),
        })
        .where(eq(questionnairesTable.id, existing.id))
        .returning();
      if (parsed.data.questions) {
        await tx
          .delete(questionnaireQuestionsTable)
          .where(
            eq(questionnaireQuestionsTable.questionnaireId, existing.id),
          );
        if (parsed.data.questions.length) {
          await tx.insert(questionnaireQuestionsTable).values(
            parsed.data.questions.map((question, index) => ({
              questionnaireId: existing.id,
              prompt: question.prompt.trim(),
              type: question.type,
              required: question.required,
              position: index,
              options: question.options,
            })),
          );
        }
      }
      return row;
    });
    await recordActivity(
      "updated",
      "questionnaire",
      updated.id,
      `Updated questionnaire ${updated.title}`,
      req.authUser!.id,
    );
    const result = await getQuestionnaireRow(updated.id);
    res.json(UpdateQuestionnaireResponse.parse(result));
  },
);

export default router;
