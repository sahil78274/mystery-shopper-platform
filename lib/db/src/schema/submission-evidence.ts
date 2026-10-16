import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { submissionsTable } from "./submissions";

/**
 * Photo evidence attached to a report.
 *
 * The bytes live in the database (base64) because this deployment has no
 * object-storage bucket wired up. Uploads are capped (see MAX_EVIDENCE_BYTES)
 * and are only ever readable by the shopper who uploaded them, reviewers,
 * admins, and the regional executive that owns the store's region.
 */
export const submissionEvidenceTable = pgTable(
  "submission_evidence",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    submissionId: integer("submission_id")
      .notNull()
      .references(() => submissionsTable.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    caption: text("caption"),
    /** Base64 encoded file contents. */
    data: text("data").notNull(),
    uploadedByUserId: integer("uploaded_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("submission_evidence_submission_id_idx").on(table.submissionId)],
);

export const insertSubmissionEvidenceSchema = createInsertSchema(submissionEvidenceTable).omit({
  createdAt: true,
});
export type InsertSubmissionEvidence = z.infer<typeof insertSubmissionEvidenceSchema>;
export type SubmissionEvidence = typeof submissionEvidenceTable.$inferSelect;

export const ALLOWED_EVIDENCE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024; // 5 MB per photo
export const MAX_EVIDENCE_PER_SUBMISSION = 8;
