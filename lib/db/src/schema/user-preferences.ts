import { createInsertSchema } from "drizzle-zod";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const DEFAULT_USER_PREFERENCES = {
  timezone: "UTC",
  dateFormat: "MMM d, yyyy",
  timeFormat: "12h",
  emailNotifications: true,
  weeklyDigest: false,
} as const;

/** Per-account display + notification preferences (settings page). */
export const userPreferencesTable = pgTable("user_preferences", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  timezone: text("timezone").notNull().default(DEFAULT_USER_PREFERENCES.timezone),
  dateFormat: text("date_format").notNull().default(DEFAULT_USER_PREFERENCES.dateFormat),
  timeFormat: text("time_format").notNull().default(DEFAULT_USER_PREFERENCES.timeFormat),
  emailNotifications: boolean("email_notifications").notNull().default(DEFAULT_USER_PREFERENCES.emailNotifications),
  weeklyDigest: boolean("weekly_digest").notNull().default(DEFAULT_USER_PREFERENCES.weeklyDigest),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserPreferencesSchema = createInsertSchema(userPreferencesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;
export type UserPreferences = typeof userPreferencesTable.$inferSelect;
