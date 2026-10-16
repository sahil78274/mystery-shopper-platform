import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetPreferencesResponse,
  UpdatePreferencesBody,
  UpdatePreferencesResponse,
} from "@workspace/api-zod";
import { db, userPreferencesTable, DEFAULT_USER_PREFERENCES } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function shape(row: typeof userPreferencesTable.$inferSelect) {
  return {
    timezone: row.timezone,
    dateFormat: row.dateFormat as (typeof DEFAULT_USER_PREFERENCES)["dateFormat"],
    timeFormat: row.timeFormat as (typeof DEFAULT_USER_PREFERENCES)["timeFormat"],
    emailNotifications: row.emailNotifications,
    weeklyDigest: row.weeklyDigest,
  };
}

router.get("/me/preferences", requireAuth, async (req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, req.authUser!.id));
  res.json(GetPreferencesResponse.parse(row ? shape(row) : DEFAULT_USER_PREFERENCES));
});

router.put("/me/preferences", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdatePreferencesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!isIanaTimezone(parsed.data.timezone)) {
    res.status(400).json({ error: "Choose a valid IANA time zone." });
    return;
  }
  const [row] = await db
    .insert(userPreferencesTable)
    .values({ userId: req.authUser!.id, ...parsed.data })
    .onConflictDoUpdate({
      target: userPreferencesTable.userId,
      set: { ...parsed.data, updatedAt: new Date() },
    })
    .returning();
  res.json(UpdatePreferencesResponse.parse(shape(row)));
});

export default router;
