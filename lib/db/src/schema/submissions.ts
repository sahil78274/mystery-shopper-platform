import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { shoppersTable } from "./shoppers";
import { storesTable } from "./stores";
import { tasksTable } from "./tasks";
import { usersTable } from "./users";

export const SUBMISSION_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "needs_correction",
] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** Statuses that may still be edited by the shopper. */
export const EDITABLE_SUBMISSION_STATUSES: SubmissionStatus[] = ["draft", "needs_correction"];

/** Statuses a reviewer can act on. */
export const REVIEWABLE_SUBMISSION_STATUSES: SubmissionStatus[] = ["submitted", "under_review"];

/** Only approved submissions feed official scores and regional scorecards. */
export const SCORED_SUBMISSION_STATUS: SubmissionStatus = "approved";

/**
 * One mystery-shop report. A task can only ever have a single report, which
 * starts life as a draft the shopper fills in and then submits for review.
 */
export const submissionsTable = pgTable(
  "submissions",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .unique()
      .references(() => tasksTable.id, { onDelete: "cascade" }),
    shopperId: integer("shopper_id")
      .notNull()
      .references(() => shoppersTable.id, { onDelete: "restrict" }),
    storeId: integer("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("draft"),
    /** Percentage (0-100) derived from the scorable answers. Null when the
     *  questionnaire has no scorable questions. */
    score: real("score"),
    comment: text("comment"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewerUserId: integer("reviewer_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    reviewerComment: text("reviewer_comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("submissions_shopper_id_idx").on(table.shopperId),
    index("submissions_store_id_idx").on(table.storeId),
    index("submissions_status_idx").on(table.status),
  ],
);

export const insertSubmissionSchema = createInsertSchema(submissionsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type Submission = typeof submissionsTable.$inferSelect;
