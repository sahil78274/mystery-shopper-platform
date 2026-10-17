import { eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  ChangePasswordBody,
  ChangePasswordResponse,
  GetAuthSessionResponse,
  LoginBody,
  LoginResponse,
  LogoutResponse,
  RegisterShopperBody,
  RegisterShopperResponse,
  UpdateAuthProfileBody,
  UpdateAuthProfileResponse,
} from "@workspace/api-zod";
import { db, shoppersTable, usersTable } from "@workspace/db";
import {
  createSession,
  emailTaken,
  hashPassword,
  isUserRole,
  normalizeEmail,
  PASSWORD_MIN_LENGTH,
  purgeExpiredSessions,
  revokeOtherSessions,
  revokeSession,
  requireAuth,
  shopperEmailTaken,
  verifyPassword,
  type AuthUser,
} from "../lib/auth";
import { normalizeTextFields } from "../lib/validation";
import { rateLimitByIp } from "../lib/rate-limit";
import { isUniqueViolation, iso, recordActivity } from "../lib/platform";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const loginRateLimit = rateLimitByIp(10, 15 * 60 * 1000, "Too many sign-in attempts. Try again in 15 minutes.");
const registrationRateLimit = rateLimitByIp(5, 60 * 60 * 1000, "Too many registration attempts. Try again later.");
const passwordRateLimit = rateLimitByIp(10, 15 * 60 * 1000, "Too many password-change attempts. Try again later.");

// Placeholder hash compared against when an email does not exist so that a
// missing account and a wrong password take a comparable amount of time.
const DUMMY_HASH_PROMISE = hashPassword("mystery-shopper-placeholder");

type AuthUserPayload = AuthUser & {
  verificationStatus: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toAuthUser(
  user: typeof usersTable.$inferSelect,
  shopperId: number | null,
  verificationStatus: string | null,
): AuthUserPayload {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role as AuthUser["role"],
    accountStatus: user.accountStatus,
    region: user.region ?? null,
    shopperId,
    verificationStatus,
    lastLoginAt: iso(user.lastLoginAt),
    createdAt: iso(user.createdAt) as string,
    updatedAt: iso(user.updatedAt) as string,
  };
}

async function loadAccount(userId: number) {
  const [row] = await db
    .select({
      user: usersTable,
      shopperId: shoppersTable.id,
      verificationStatus: shoppersTable.verificationStatus,
    })
    .from(usersTable)
    .leftJoin(shoppersTable, eq(shoppersTable.userId, usersTable.id))
    .where(eq(usersTable.id, userId));
  return row && isUserRole(row.user.role) ? row : null;
}

router.post("/auth/register", registrationRateLimit, async (req, res): Promise<void> => {
  const normalizedBody = normalizeTextFields(req.body, ["fullName", "email", "phone", "city"]);
  const parsed = RegisterShopperBody.safeParse(normalizedBody);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const email = normalizeEmail(input.email);
  if ((await emailTaken(email)) || (await shopperEmailTaken(email))) {
    res.status(409).json({ error: "An account with this email already exists." });
    return;
  }
  const passwordHash = await hashPassword(input.password);

  try {
    const created = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(usersTable)
        .values({
          fullName: input.fullName.trim(),
          email,
          passwordHash,
          // Public registration can only ever create a mystery shopper.
          role: "mystery_shopper",
          accountStatus: "active",
        })
        .returning();
      const [shopper] = await tx
        .insert(shoppersTable)
        .values({
          fullName: input.fullName.trim(),
          email,
          phone: input.phone.trim(),
          city: input.city.trim(),
          experience: input.experience ?? 0,
          verificationStatus: "pending",
          accountStatus: "active",
          userId: user.id,
        })
        .returning();
      return { user, shopper };
    });

    await recordActivity(
      "registered",
      "shopper",
      created.shopper.id,
      `Registered shopper ${created.shopper.fullName}`,
      created.user.id,
    );
    const session = await createSession(created.user.id);
    const account = await loadAccount(created.user.id);
    if (!account) {
      res.status(500).json({ error: "Account could not be loaded after registration." });
      return;
    }
    res.status(201).json(
      RegisterShopperResponse.parse({
        token: session.token,
        expiresAt: session.expiresAt.toISOString(),
        user: toAuthUser(account.user, account.shopperId, account.verificationStatus),
      }),
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "An account with this email already exists." });
      return;
    }
    throw error;
  }
});

router.post("/auth/login", loginRateLimit, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(normalizeTextFields(req.body, ["email"]));
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .select({
      user: usersTable,
      shopperId: shoppersTable.id,
      verificationStatus: shoppersTable.verificationStatus,
    })
    .from(usersTable)
    .leftJoin(shoppersTable, eq(shoppersTable.userId, usersTable.id))
    .where(sql`lower(${usersTable.email}) = ${normalizeEmail(parsed.data.email)}`)
    .limit(1);

  const valid = row
    ? await verifyPassword(parsed.data.password, row.user.passwordHash)
    : await verifyPassword(parsed.data.password, await DUMMY_HASH_PROMISE).then(() => false);

  if (!row || !valid || !isUserRole(row.user.role)) {
    res.status(401).json({ error: "Email or password is incorrect." });
    return;
  }
  if (row.user.accountStatus !== "active") {
    res.status(401).json({ error: "This account has been deactivated. Contact an administrator." });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, row.user.id))
    .returning();
  const session = await createSession(row.user.id);
  void purgeExpiredSessions().catch((error) => {
    logger.warn({ err: error }, "Failed to purge expired sessions");
  });
  res.json(
    LoginResponse.parse({
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      user: toAuthUser(updated, row.shopperId, row.verificationStatus),
    }),
  );
});

router.post("/auth/logout", requireAuth, async (req, res): Promise<void> => {
  await revokeSession(req.authToken);
  res.status(204).send(LogoutResponse.parse(undefined));
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const account = await loadAccount(req.authUser!.id);
  if (!account) {
    res.status(401).json({ error: "This account no longer exists." });
    return;
  }
  res.json(
    GetAuthSessionResponse.parse(
      toAuthUser(account.user, account.shopperId, account.verificationStatus),
    ),
  );
});

router.patch("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateAuthProfileBody.safeParse(normalizeTextFields(req.body, ["fullName", "email"]));
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = req.authUser!;
  const updates: { fullName?: string; email?: string } = {};
  if (parsed.data.fullName !== undefined) {
    const fullName = parsed.data.fullName.trim();
    if (!fullName) {
      res.status(400).json({ error: "Name cannot be empty." });
      return;
    }
    updates.fullName = fullName;
  }
  if (parsed.data.email !== undefined) {
    updates.email = normalizeEmail(parsed.data.email);
  }
  if (!Object.keys(updates).length) {
    res.status(400).json({ error: "Nothing to update." });
    return;
  }
  if (updates.email && (await emailTaken(updates.email, user.id))) {
    res.status(409).json({ error: "That email is already used by another account." });
    return;
  }

  try {
    const account = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(usersTable)
        .set(updates)
        .where(eq(usersTable.id, user.id))
        .returning();
      if ((updates.fullName || updates.email) && user.shopperId) {
        await tx
          .update(shoppersTable)
          .set({
            ...(updates.fullName ? { fullName: updates.fullName } : {}),
            ...(updates.email ? { email: updates.email } : {}),
          })
          .where(eq(shoppersTable.id, user.shopperId));
      }
      return updated;
    });
    const reloaded = await loadAccount(user.id);
    if (!reloaded) {
      res.status(404).json({ error: "Account not found." });
      return;
    }
    await recordActivity("updated", "user", user.id, `Updated profile for ${account.fullName}`, user.id);
    res.json(
      UpdateAuthProfileResponse.parse(
        toAuthUser(reloaded.user, reloaded.shopperId, reloaded.verificationStatus),
      ),
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "That email is already used by another account." });
      return;
    }
    throw error;
  }
});

router.post("/auth/password", requireAuth, passwordRateLimit, async (req, res): Promise<void> => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = req.authUser!;
  const [row] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  if (!row) {
    res.status(404).json({ error: "Account not found." });
    return;
  }
  if (!(await verifyPassword(parsed.data.currentPassword, row.passwordHash))) {
    res.status(400).json({ error: "Your current password is incorrect." });
    return;
  }
  if (parsed.data.newPassword.length < PASSWORD_MIN_LENGTH) {
    res.status(400).json({ error: `Use at least ${PASSWORD_MIN_LENGTH} characters for the new password.` });
    return;
  }
  if (parsed.data.newPassword === parsed.data.currentPassword) {
    res.status(400).json({ error: "Choose a password you have not used before." });
    return;
  }
  await db
    .update(usersTable)
    .set({ passwordHash: await hashPassword(parsed.data.newPassword) })
    .where(eq(usersTable.id, user.id));
  // Sign out every other device; the current session stays valid.
  await revokeOtherSessions(user.id, req.authToken);
  await recordActivity("updated", "user", user.id, "Changed account password", user.id);
  res.json(
    ChangePasswordResponse.parse({
      message: "Password updated. Other sessions were signed out.",
    }),
  );
});

export default router;
