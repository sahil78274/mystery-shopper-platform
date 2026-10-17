import { and, desc, eq, ilike, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateUserBody,
  CreateUserResponse,
  DeleteUserParams,
  DeleteUserResponse,
  GetUsersQueryParams,
  GetUsersResponse,
  UpdateUserBody,
  UpdateUserParams,
  UpdateUserResponse,
} from "@workspace/api-zod";
import { db, shoppersTable, usersTable } from "@workspace/db";
import {
  countActiveAdmins,
  emailTaken,
  hashPassword,
  normalizeEmail,
  requireRole,
  revokeOtherSessions,
} from "../lib/auth";
import { normalizeTextFields } from "../lib/validation";
import { iso, isUniqueViolation, recordActivity } from "../lib/platform";

const router: IRouter = Router();

function toUser(
  row: typeof usersTable.$inferSelect,
  shopperId: number | null,
) {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    role: row.role,
    accountStatus: row.accountStatus,
    region: row.region ?? null,
    shopperId,
    lastLoginAt: iso(row.lastLoginAt),
    createdAt: iso(row.createdAt) as string,
    updatedAt: iso(row.updatedAt) as string,
  };
}

async function listUsers(query: {
  search?: string;
  role?: string;
  accountStatus?: string;
}) {
  const conditions = [];
  if (query.search) {
    const term = `%${query.search}%`;
    conditions.push(or(ilike(usersTable.fullName, term), ilike(usersTable.email, term)));
  }
  if (query.role) conditions.push(eq(usersTable.role, query.role));
  if (query.accountStatus) conditions.push(eq(usersTable.accountStatus, query.accountStatus));
  return db
    .select({ user: usersTable, shopperId: shoppersTable.id })
    .from(usersTable)
    .leftJoin(shoppersTable, eq(shoppersTable.userId, usersTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(usersTable.createdAt));
}

router.get("/users", requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = GetUsersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rows = await listUsers(parsed.data);
  res.json(GetUsersResponse.parse(rows.map((row) => toUser(row.user, row.shopperId))));
});

router.post("/users", requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(normalizeTextFields(req.body, ["fullName", "email", "region"]));
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  if (input.role === "mystery_shopper") {
    res.status(400).json({ error: "Mystery shopper accounts are created through public registration." });
    return;
  }
  if (input.role === "regional_executive" && !input.region?.trim()) {
    res.status(400).json({ error: "Assign a region to a regional brand executive." });
    return;
  }
  if (await emailTaken(input.email)) {
    res.status(409).json({ error: "An account with this email already exists." });
    return;
  }
  try {
    const [row] = await db
      .insert(usersTable)
      .values({
        fullName: input.fullName.trim(),
        email: normalizeEmail(input.email),
        passwordHash: await hashPassword(input.password),
        role: input.role,
        region: input.role === "regional_executive" ? input.region!.trim() : null,
        accountStatus: "active",
      })
      .returning();
    await recordActivity(
      "created",
      "user",
      row.id,
      `Created ${input.role.replaceAll("_", " ")} account for ${row.fullName}`,
      req.authUser!.id,
    );
    res.status(201).json(CreateUserResponse.parse(toUser(row, null)));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "An account with this email already exists." });
      return;
    }
    throw error;
  }
});

router.patch("/users/:userId", requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  const parsed = UpdateUserBody.safeParse(normalizeTextFields(req.body, ["fullName", "email", "region"]));
  if (!params.success || !parsed.success) {
    res.status(400).json({
      error: !params.success ? params.error.message : parsed.error?.message ?? "Invalid account data.",
    });
    return;
  }
  const [current] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.userId));
  if (!current) {
    res.status(404).json({ error: "Account not found." });
    return;
  }
  const input = parsed.data;
  const nextRole = input.role ?? current.role;
  const nextStatus = input.accountStatus ?? current.accountStatus;
  const nextRegion =
    input.region !== undefined
      ? input.region?.trim() || null
      : current.region;

  if (nextRole === "regional_executive" && !nextRegion) {
    res.status(400).json({ error: "A regional brand executive must be assigned to a region." });
    return;
  }
  if (current.role === "admin" && nextRole !== "admin" && (await countActiveAdmins(current.id)) === 0) {
    res.status(400).json({ error: "At least one active administrator must remain." });
    return;
  }
  if (current.role === "admin" && nextStatus !== "active" && (await countActiveAdmins(current.id)) === 0) {
    res.status(400).json({ error: "At least one active administrator must remain." });
    return;
  }
  if (input.email && (await emailTaken(input.email, current.id))) {
    res.status(409).json({ error: "That email is already used by another account." });
    return;
  }

  const updates: Partial<typeof usersTable.$inferInsert> = {
    ...(input.fullName !== undefined ? { fullName: input.fullName.trim() } : {}),
    ...(input.email !== undefined ? { email: normalizeEmail(input.email) } : {}),
    ...(input.role !== undefined ? { role: nextRole } : {}),
    ...(input.accountStatus !== undefined ? { accountStatus: nextStatus } : {}),
    ...(input.region !== undefined || input.role !== undefined
      ? { region: nextRole === "regional_executive" ? nextRegion : null }
      : {}),
    ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
  };

  try {
    const [row] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, current.id))
      .returning();
    if (input.password || nextStatus !== "active") {
      await revokeOtherSessions(row.id);
    }
    await recordActivity(
      "updated",
      "user",
      row.id,
      `Updated account for ${row.fullName}`,
      req.authUser!.id,
    );
    const [{ shopperId }] = await db
      .select({ shopperId: shoppersTable.id })
      .from(shoppersTable)
      .where(eq(shoppersTable.userId, row.id));
    res.json(UpdateUserResponse.parse(toUser(row, shopperId ?? null)));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "That email is already used by another account." });
      return;
    }
    throw error;
  }
});

router.delete("/users/:userId", requireRole("admin"), async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [current] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.userId));
  if (!current) {
    res.status(404).json({ error: "Account not found." });
    return;
  }
  if (current.role === "admin" && (await countActiveAdmins(current.id)) === 0) {
    res.status(400).json({ error: "The last active administrator cannot be deleted." });
    return;
  }
  await db.delete(usersTable).where(eq(usersTable.id, current.id));
  await recordActivity(
    "deleted",
    "user",
    current.id,
    `Deleted account for ${current.fullName}`,
    req.authUser!.id,
  );
  res.status(204).send(DeleteUserResponse.parse(undefined));
});

export default router;
