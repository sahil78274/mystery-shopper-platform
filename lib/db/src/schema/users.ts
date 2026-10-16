import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const USER_ROLES = [
  "admin",
  "mystery_shopper",
  "reviewer",
  "regional_executive",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const usersTable = pgTable("users", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("admin"),
  accountStatus: text("account_status").notNull().default("active"),
  // Only used by regional executives: scopes every store/report query.
  region: text("region"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
