import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetOrganizationResponse,
  UpdateOrganizationBody,
  UpdateOrganizationResponse,
} from "@workspace/api-zod";
import {
  db,
  organizationSettingsTable,
  ORGANIZATION_SETTINGS_ID,
  DEFAULT_ORGANIZATION_NAME,
} from "@workspace/db";
import { normalizeEmail, requireAuth, requireRole } from "../lib/auth";
import { normalizeTextFields } from "../lib/validation";
import { iso, recordActivity } from "../lib/platform";

const router: IRouter = Router();

function shape(row: typeof organizationSettingsTable.$inferSelect) {
  return {
    name: row.name,
    contactEmail: row.contactEmail ?? null,
    phone: row.phone ?? null,
    address: row.address ?? null,
    website: row.website ?? null,
    updatedAt: iso(row.updatedAt) as string,
  };
}

async function loadSettings() {
  const [row] = await db
    .select()
    .from(organizationSettingsTable)
    .where(eq(organizationSettingsTable.id, ORGANIZATION_SETTINGS_ID));
  if (row) return row;
  const [created] = await db
    .insert(organizationSettingsTable)
    .values({ id: ORGANIZATION_SETTINGS_ID, name: DEFAULT_ORGANIZATION_NAME })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [existing] = await db
    .select()
    .from(organizationSettingsTable)
    .where(eq(organizationSettingsTable.id, ORGANIZATION_SETTINGS_ID));
  return existing;
}

router.get("/organization", requireAuth, async (_req, res): Promise<void> => {
  const row = await loadSettings();
  if (!row) {
    res.status(500).json({ error: "Organization settings could not be loaded." });
    return;
  }
  res.json(GetOrganizationResponse.parse(shape(row)));
});

router.put("/organization", requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = UpdateOrganizationBody.safeParse(
    normalizeTextFields(
      req.body,
      ["name", "contactEmail", "phone", "address", "website"],
      ["contactEmail", "phone", "address", "website"],
    ),
  );
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const cleaned = {
    name: input.name.trim(),
    contactEmail: input.contactEmail ? normalizeEmail(input.contactEmail) : null,
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
    website: input.website?.trim() || null,
  };
  await loadSettings();
  const [row] = await db
    .update(organizationSettingsTable)
    .set({ ...cleaned, updatedByUserId: req.authUser!.id })
    .where(eq(organizationSettingsTable.id, ORGANIZATION_SETTINGS_ID))
    .returning();
  await recordActivity(
    "updated",
    "organization",
    ORGANIZATION_SETTINGS_ID,
    "Updated organization settings",
    req.authUser!.id,
  );
  res.json(UpdateOrganizationResponse.parse(shape(row)));
});

export default router;
