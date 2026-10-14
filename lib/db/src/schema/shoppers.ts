import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const shoppersTable = pgTable("shoppers", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull(),
  city: text("city").notNull(),
  experience: integer("experience").notNull().default(0),
  verificationStatus: text("verification_status").notNull().default("pending"),
  accountStatus: text("account_status").notNull().default("active"),
  decisionReason: text("decision_reason"),
  decisionAt: timestamp("decision_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertShopperSchema = createInsertSchema(shoppersTable).omit({
  decisionReason: true,
  decisionAt: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertShopper = z.infer<typeof insertShopperSchema>;
export type Shopper = typeof shoppersTable.$inferSelect;
