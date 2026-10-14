import { and, desc, eq, ilike, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateStoreBody,
  CreateStoreResponse,
  DeleteStoreParams,
  GetStoreParams,
  GetStoreResponse,
  GetStoresQueryParams,
  GetStoresResponse,
  UpdateStoreBody,
  UpdateStoreParams,
  UpdateStoreResponse,
} from "@workspace/api-zod";
import { db, storesTable, tasksTable } from "@workspace/db";
import { iso, isUniqueViolation, recordActivity } from "../lib/platform";

const router: IRouter = Router();

function toStore(row: typeof storesTable.$inferSelect) {
  return {
    ...row,
    contactPerson: row.contactPerson ?? null,
    contactPhone: row.contactPhone ?? null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

router.get("/stores", async (req, res): Promise<void> => {
  const parsed = GetStoresQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, region, status } = parsed.data;
  const conditions = [];
  if (search) {
    const term = `%${search}%`;
    conditions.push(
      or(
        ilike(storesTable.name, term),
        ilike(storesTable.code, term),
        ilike(storesTable.brandName, term),
        ilike(storesTable.city, term),
        ilike(storesTable.address, term),
      ),
    );
  }
  if (region) conditions.push(eq(storesTable.region, region));
  if (status) conditions.push(eq(storesTable.status, status));
  const rows = await db
    .select()
    .from(storesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(storesTable.createdAt));
  res.json(GetStoresResponse.parse(rows.map(toStore)));
});

router.post("/stores", async (req, res): Promise<void> => {
  const parsed = CreateStoreBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [row] = await db.insert(storesTable).values(parsed.data).returning();
    await recordActivity("created", "store", row.id, `Added store ${row.name}`);
    res.status(201).json(CreateStoreResponse.parse(toStore(row)));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "A store with this code already exists." });
      return;
    }
    throw error;
  }
});

router.get("/stores/:storeId", async (req, res): Promise<void> => {
  const params = GetStoreParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.id, params.data.storeId));
  if (!row) {
    res.status(404).json({ error: "Store not found." });
    return;
  }
  res.json(GetStoreResponse.parse(toStore(row)));
});

router.patch("/stores/:storeId", async (req, res): Promise<void> => {
  const params = UpdateStoreParams.safeParse(req.params);
  const parsed = UpdateStoreBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({
      error: !params.success
        ? params.error.message
        : parsed.error?.message ?? "Invalid store data.",
    });
    return;
  }
  try {
    const [row] = await db
      .update(storesTable)
      .set(parsed.data)
      .where(eq(storesTable.id, params.data.storeId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Store not found." });
      return;
    }
    await recordActivity("updated", "store", row.id, `Updated store ${row.name}`);
    res.json(UpdateStoreResponse.parse(toStore(row)));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "A store with this code already exists." });
      return;
    }
    throw error;
  }
});

router.delete("/stores/:storeId", async (req, res): Promise<void> => {
  const params = DeleteStoreParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.id, params.data.storeId));
  if (!row) {
    res.status(404).json({ error: "Store not found." });
    return;
  }
  const [assignedTask] = await db
    .select({ id: tasksTable.id })
    .from(tasksTable)
    .where(eq(tasksTable.storeId, row.id))
    .limit(1);
  if (assignedTask) {
    res.status(409).json({
      error: "This store has tasks. Cancel or reassign them before deleting it.",
    });
    return;
  }
  await db.delete(storesTable).where(eq(storesTable.id, row.id));
  await recordActivity("deleted", "store", row.id, `Deleted store ${row.name}`);
  res.sendStatus(204);
});

export default router;
