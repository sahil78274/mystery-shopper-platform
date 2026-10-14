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

router.get("/shoppers", async (req, res): Promise<void> => {
  const parsed = GetShoppersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, verificationStatus, accountStatus } = parsed.data;
  const conditions = [];
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

router.post("/shoppers", async (req, res): Promise<void> => {
  const parsed = CreateShopperBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const {
    verificationStatus: _requestedVerificationStatus,
    accountStatus: _requestedAccountStatus,
    ...profile
  } = parsed.data;
  try {
    const [row] = await db
      .insert(shoppersTable)
      .values({
        ...profile,
        verificationStatus: "pending",
        accountStatus: "active",
      })
      .returning();
    await recordActivity(
      "registered",
      "shopper",
      row.id,
      `Registered shopper ${row.fullName}`,
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

router.get("/shoppers/:shopperId", async (req, res): Promise<void> => {
  const params = GetShopperParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
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

router.patch("/shoppers/:shopperId", async (req, res): Promise<void> => {
  const params = UpdateShopperParams.safeParse(req.params);
  const parsed = UpdateShopperBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({
      error: !params.success
        ? params.error.message
        : parsed.error?.message ?? "Invalid shopper data.",
    });
    return;
  }
  try {
    const [row] = await db
      .update(shoppersTable)
      .set(parsed.data)
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
      });
      return [updated];
    });
    res.json(
      DecideShopperVerificationResponse.parse(toShopper(row)),
    );
  },
);

export default router;
