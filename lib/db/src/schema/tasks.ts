import { createInsertSchema } from "drizzle-zod";
import { date, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { questionnairesTable } from "./questionnaires";
import { shoppersTable } from "./shoppers";
import { storesTable } from "./stores";

export const tasksTable = pgTable("tasks", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  storeId: integer("store_id")
    .notNull()
    .references(() => storesTable.id, { onDelete: "restrict" }),
  shopperId: integer("shopper_id").references(() => shoppersTable.id, {
    onDelete: "set null",
  }),
  questionnaireId: integer("questionnaire_id").references(
    () => questionnairesTable.id,
    { onDelete: "set null" },
  ),
  visitDate: date("visit_date", { mode: "string" }).notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  instructions: text("instructions").notNull().default(""),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
