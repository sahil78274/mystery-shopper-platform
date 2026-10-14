import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { shoppersTable } from "./shoppers";
import { usersTable } from "./users";

export const verificationDecisionsTable = pgTable("verification_decisions", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  shopperId: integer("shopper_id")
    .notNull()
    .references(() => shoppersTable.id, { onDelete: "cascade" }),
  decidedByUserId: integer("decided_by_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  verificationStatus: text("verification_status").notNull(),
  reason: text("reason"),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVerificationDecisionSchema = createInsertSchema(
  verificationDecisionsTable,
).omit({ decidedAt: true });
export type InsertVerificationDecision = z.infer<
  typeof insertVerificationDecisionSchema
>;
export type VerificationDecision =
  typeof verificationDecisionsTable.$inferSelect;
