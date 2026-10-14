import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { questionnairesTable } from "./questionnaires";

export const questionnaireQuestionsTable = pgTable("questionnaire_questions", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  questionnaireId: integer("questionnaire_id")
    .notNull()
    .references(() => questionnairesTable.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  type: text("type").notNull(),
  required: boolean("required").notNull().default(true),
  position: integer("position").notNull().default(0),
  options: jsonb("options").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
});

export const insertQuestionnaireQuestionSchema = createInsertSchema(
  questionnaireQuestionsTable,
);
export type InsertQuestionnaireQuestion = z.infer<
  typeof insertQuestionnaireQuestionSchema
>;
export type QuestionnaireQuestion =
  typeof questionnaireQuestionsTable.$inferSelect;
