import { and, desc, eq, ilike, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateShopperBody,
  CreateShopperResponse,
  DecideShopperVerificationBody,
  DecideShopperVerificationParams,
  DecideShopperVerificationResponse,
  GetShopperParams,
  GetShopperResponse,
  GetShoppersQueryParams,
  GetShoppersResponse,
  UpdateShopperBody,
  UpdateShopperParams,
  UpdateShopperResponse,
} from "@workspace/api-zod";
import {
  activityLogsTable,
  db,
  shoppersTable,
  verificationDecisionsTable,
} from "@workspace/db";
import { normalizeEmail, requireAuth, requireRole, shopperEmailTaken } from "../lib/auth";
import { canAccessShopperDirectory, canAccessShopperProfile } from "../lib/workflow";
import { normalizeTextFields } from "../lib/validation";
import { iso, isUniqueViolation, recordActivity } from "../lib/platform";

const router: IRouter = Router();

function toShopper(row: typeof shoppersTable.$inferSelect) {
  return {
    ...row,
    decisionReason: row.decisionReason ?? null,
    decisionAt: iso(row.decisionAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

router.get("/shoppers", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetShoppersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = req.authUser!;
  if (!canAccessShopperDirectory(user.role)) {
    res.status(403).json({ error: "You do not have access to shopper profiles." });
    return;
  }
  const { search, verificationStatus, accountStatus } = parsed.data;
  const conditions = [];
  // Shoppers may only ever see their own profile record.
  if (user.role === "mystery_shopper") {
    if (!user.shopperId) {
      res.json(GetShoppersResponse.parse([]));
      return;
    }
    conditions.push(eq(shoppersTable.id, user.shopperId));
  }
  if (search) {
    conditions.push(
      or(
        ilike(shoppersTable.fullName, `%${search}%`),
        ilike(shoppersTable.email, `%${search}%`),
        ilike(shoppersTable.phone, `%${search}%`),
        ilike(shoppersTable.city, `%${search}%`),
      ),
    );
  }
  if (verificationStatus) {
    conditions.push(eq(shoppersTable.verificationStatus, verificationStatus));
  }
  if (accountStatus) {
    conditions.push(eq(shoppersTable.accountStatus, accountStatus));
  }
  const rows = await db
    .select()
    .from(shoppersTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(shoppersTable.createdAt));
  res.json(GetShoppersResponse.parse(rows.map(toShopper)));
});

router.post("/shoppers", requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateShopperBody.safeParse(normalizeTextFields(req.body, ["fullName", "email", "phone", "city"]));
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const {
    verificationStatus: _requestedVerificationStatus,
    accountStatus: _requestedAccountStatus,
    ...profile
  } = parsed.data;
  const normalizedProfile = {
    ...profile,
    email: normalizeEmail(profile.email),
  };
  if (await shopperEmailTaken(normalizedProfile.email)) {
    res.status(409).json({ error: "A shopper with this email already exists." });
    return;
  }
  try {
    const [row] = await db
      .insert(shoppersTable)
      .values({
        ...normalizedProfile,
        verificationStatus: "pending",
        accountStatus: "active",
      })
      .returning();
    await recordActivity(
      "registered",
      "shopper",
      row.id,
      `Registered shopper ${row.fullName}`,
      req.authUser!.id,
    );
    res.status(201).json(CreateShopperResponse.parse(toShopper(row)));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "A shopper with this email already exists." });
      return;
    }
    throw error;
  }
});

router.get("/shoppers/:shopperId", requireAuth, async (req, res): Promise<void> => {
  const params = GetShopperParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const user = req.authUser!;
  if (!canAccessShopperProfile(user.role, user.shopperId, params.data.shopperId)) {
    res.status(user.role === "mystery_shopper" ? 404 : 403).json({
      error: user.role === "mystery_shopper" ? "Shopper not found." : "You do not have access to shopper profiles.",
    });
    return;
  }
  const [row] = await db
    .select()
    .from(shoppersTable)
    .where(eq(shoppersTable.id, params.data.shopperId));
  if (!row) {
    res.status(404).json({ error: "Shopper not found." });
    return;
  }
  res.json(GetShopperResponse.parse(toShopper(row)));
});

router.patch("/shoppers/:shopperId", requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateShopperParams.safeParse(req.params);
  const parsed = UpdateShopperBody.safeParse(normalizeTextFields(req.body, ["fullName", "email", "phone", "city"]));
  if (!params.success || !parsed.success) {
    res.status(400).json({
      error: !params.success
        ? params.error.message
        : parsed.error?.message ?? "Invalid shopper data.",
    });
    return;
  }
  const updates = { ...parsed.data };
  if (updates.email !== undefined) {
    updates.email = normalizeEmail(updates.email);
    if (await shopperEmailTaken(updates.email, params.data.shopperId)) {
      res.status(409).json({ error: "A shopper with this email already exists." });
      return;
    }
  }
  try {
    const [row] = await db
      .update(shoppersTable)
      .set(updates)
      .where(eq(shoppersTable.id, params.data.shopperId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Shopper not found." });
      return;
    }
    await recordActivity(
      "updated",
      "shopper",
      row.id,
      `Updated shopper ${row.fullName}`,
      req.authUser!.id,
    );
    res.json(UpdateShopperResponse.parse(toShopper(row)));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "A shopper with this email already exists." });
      return;
    }
    throw error;
  }
});

router.post(
  "/shoppers/:shopperId/verification",
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const params = DecideShopperVerificationParams.safeParse(req.params);
    const parsed = DecideShopperVerificationBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: !params.success
          ? params.error.message
          : parsed.error?.message ?? "Invalid verification decision.",
      });
      return;
    }
    const [existing] = await db
      .select()
      .from(shoppersTable)
      .where(eq(shoppersTable.id, params.data.shopperId));
    if (!existing) {
      res.status(404).json({ error: "Shopper not found." });
      return;
    }
    const reason =
      parsed.data.verificationStatus === "rejected"
        ? parsed.data.reason?.trim() || null
        : null;
    const [row] = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(shoppersTable)
        .set({
          verificationStatus: parsed.data.verificationStatus,
          decisionReason: reason,
          decisionAt: new Date(),
        })
        .where(eq(shoppersTable.id, existing.id))
        .returning();
      await tx.insert(verificationDecisionsTable).values({
        shopperId: existing.id,
        verificationStatus: parsed.data.verificationStatus,
        reason,
      });
      await tx.insert(activityLogsTable).values({
        action: parsed.data.verificationStatus,
        entityType: "shopper",
        entityId: existing.id,
        description: `${parsed.data.verificationStatus === "verified" ? "Verified" : "Rejected"} shopper ${existing.fullName}`,
        actorUserId: req.authUser!.id,
      });
      return [updated];
    });
    res.json(
      DecideShopperVerificationResponse.parse(toShopper(row)),
    );
  },
);

export default router;
