import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const DEFAULT_ORGANIZATION_NAME = "Ricoz Innovation";

/** Single-row table holding the workspace's organisation profile. */
export const organizationSettingsTable = pgTable("organization_settings", {
  id: integer("id").primaryKey(),
  name: text("name").notNull().default(DEFAULT_ORGANIZATION_NAME),
  contactEmail: text("contact_email"),
  phone: text("phone"),
  address: text("address"),
  website: text("website"),
  updatedByUserId: integer("updated_by_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOrganizationSettingsSchema = createInsertSchema(organizationSettingsTable).omit({
  updatedAt: true,
});
export type InsertOrganizationSettings = z.infer<typeof insertOrganizationSettingsSchema>;
export type OrganizationSettings = typeof organizationSettingsTable.$inferSelect;

export const ORGANIZATION_SETTINGS_ID = 1;
