import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * Server-side sessions for the bearer tokens issued by /api/auth/login.
 * Only a SHA-256 hash of the token is stored, so a database leak does not
 * hand out usable credentials.
 */
export const sessionsTable = pgTable(
  "sessions",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({
  createdAt: true,
  lastUsedAt: true,
});
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
