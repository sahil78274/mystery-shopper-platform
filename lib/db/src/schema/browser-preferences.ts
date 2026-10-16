import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const DEFAULT_BROWSER_PREFERENCES = {
  timezone: "UTC",
  dateFormat: "MMM d, yyyy",
  timeFormat: "12h",
} as const;

export const browserPreferencesTable = pgTable("browser_preferences", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  browserKeyHash: text("browser_key_hash").notNull().unique(),
  timezone: text("timezone").notNull().default(DEFAULT_BROWSER_PREFERENCES.timezone),
  dateFormat: text("date_format").notNull().default(DEFAULT_BROWSER_PREFERENCES.dateFormat),
  timeFormat: text("time_format").notNull().default(DEFAULT_BROWSER_PREFERENCES.timeFormat),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// `id` is generated always as identity, so drizzle-zod already excludes it from
// the insert schema; omitting it again throws "Unrecognized key: id".
export const insertBrowserPreferencesSchema = createInsertSchema(browserPreferencesTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertBrowserPreferences = typeof browserPreferencesTable.$inferInsert;
export type BrowserPreferences = typeof browserPreferencesTable.$inferSelect;
