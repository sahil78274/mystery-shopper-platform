import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const shoppersTable = pgTable("shoppers", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  city: text("city").notNull(),
  experience: integer("experience").notNull().default(0),
  verificationStatus: text("verification_status").notNull().default("pending"),
  accountStatus: text("account_status").notNull().default("active"),
  decisionReason: text("decision_reason"),
  decisionAt: timestamp("decision_at", { withTimezone: true }),
  // Links a shopper profile to its login (set when the shopper self-registers
  // or when an admin creates the login for an existing profile).
  userId: integer("user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("shoppers_email_lower_unique").on(sql`lower(${table.email})`),
]);

export const insertShopperSchema = createInsertSchema(shoppersTable).omit({
  decisionReason: true,
  decisionAt: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertShopper = z.infer<typeof insertShopperSchema>;
export type Shopper = typeof shoppersTable.$inferSelect;
