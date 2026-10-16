import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, real, text } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { questionnaireQuestionsTable } from "./questionnaire-questions";
import { submissionsTable } from "./submissions";

/**
 * One answer per question per submission. The prompt/type/options are copied
 * onto the answer so a report keeps its original wording even if the
 * questionnaire is edited afterwards.
 */
export const submissionAnswersTable = pgTable("submission_answers", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  submissionId: integer("submission_id")
    .notNull()
    .references(() => submissionsTable.id, { onDelete: "cascade" }),
  questionId: integer("question_id").references(() => questionnaireQuestionsTable.id, {
    onDelete: "set null",
  }),
  prompt: text("prompt").notNull(),
  type: text("type").notNull(),
  required: boolean("required").notNull().default(true),
  position: integer("position").notNull().default(0),
  options: jsonb("options").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  valueText: text("value_text"),
  valueNumber: real("value_number"),
  valueBoolean: boolean("value_boolean"),
});

export const insertSubmissionAnswerSchema = createInsertSchema(submissionAnswersTable);
export type InsertSubmissionAnswer = z.infer<typeof insertSubmissionAnswerSchema>;
export type SubmissionAnswer = typeof submissionAnswersTable.$inferSelect;
