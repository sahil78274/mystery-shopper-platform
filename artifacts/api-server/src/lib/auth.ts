import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt, ne } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import {
  db,
  sessionsTable,
  shoppersTable,
  usersTable,
  PASSWORD_MIN_LENGTH,
  SESSION_TTL_MS,
  USER_ROLES,
  hashPassword,
  verifyPassword,
  type UserRole,
} from "@workspace/db";

export { PASSWORD_MIN_LENGTH, hashPassword, verifyPassword };
import { logger } from "./logger";

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type AuthUser = {
  id: number;
  fullName: string;
  email: string;
  role: UserRole;
  accountStatus: string;
  region: string | null;
  /** Set when the account is a mystery shopper with a linked shopper profile. */
  shopperId: number | null;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      authToken?: string;
    }
  }
}

function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

async function loadAuthUser(userId: number): Promise<AuthUser | null> {
  const [row] = await db
    .select({
      user: usersTable,
      shopperId: shoppersTable.id,
    })
    .from(usersTable)
    .leftJoin(shoppersTable, eq(shoppersTable.userId, usersTable.id))
    .where(eq(usersTable.id, userId));
  if (!row) return null;
  return {
    id: row.user.id,
    fullName: row.user.fullName,
    email: row.user.email,
    role: isUserRole(row.user.role) ? row.user.role : "mystery_shopper",
    accountStatus: row.user.accountStatus,
    region: row.user.region,
    shopperId: row.shopperId ?? null,
  };
}

export async function createSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessionsTable).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });
  return { token, expiresAt };
}

export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(sessionsTable).where(eq(sessionsTable.tokenHash, hashToken(token)));
}

function bearerToken(req: Request): string | undefined {
  const header = req.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  // Cookie fallback keeps plain browser navigations (CSV downloads) working.
  const cookieToken = req.cookies?.["ms_session"];
  if (typeof cookieToken === "string" && cookieToken) return cookieToken;
  return undefined;
}

/** Resolves the bearer token (when present) and attaches the user to `req`. */
export async function attachUser(req: Request): Promise<void> {
  const token = bearerToken(req);
  if (!token) return;
  const [row] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) return;
  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, row.id));
    return;
  }
  const user = await loadAuthUser(row.userId);
  if (!user || user.accountStatus !== "active") return;
  req.authUser = user;
  req.authToken = token;
  // Sliding expiry: keep active sessions alive, but never extend past 14 days
  // from the original login.
  await db
    .update(sessionsTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(sessionsTable.id, row.id));
}

/** Signs out every session except the caller's own token. */
export async function revokeOtherSessions(userId: number, keepToken?: string): Promise<void> {
  const conditions = [eq(sessionsTable.userId, userId)];
  if (keepToken) conditions.push(ne(sessionsTable.tokenHash, hashToken(keepToken)));
  await db.delete(sessionsTable).where(and(...conditions));
}

export function purgeExpiredSessions(): Promise<unknown> {
  return db.delete(sessionsTable).where(lt(sessionsTable.expiresAt, new Date()));
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!roles.includes(req.authUser.role)) {
      res.status(403).json({ error: "You do not have access to this area." });
      return;
    }
    next();
  };
}

/** Role guard that also lets admins through. */
export function requireRoleOrAdmin(...roles: UserRole[]) {
  return requireRole("admin", ...roles);
}

export function isAdmin(user: AuthUser | undefined): boolean {
  return user?.role === "admin";
}

export function canReview(user: AuthUser | undefined): boolean {
  return user?.role === "admin" || user?.role === "reviewer";
}

/** The region a query must be scoped to, or null for unrestricted roles. */
export function regionScopeFor(user: AuthUser): string | null {
  return user.role === "regional_executive" ? user.region : null;
}

/** Shoppers may only ever touch their own shopper profile. */
export function shopperScopeFor(user: AuthUser): number | null {
  return user.role === "mystery_shopper" ? user.shopperId : null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(email: string) {
  const [row] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, normalizeEmail(email)));
  return row ?? null;
}

/** Used to stop the last administrator from locking themselves out. */
export async function countActiveAdmins(excludeUserId?: number): Promise<number> {
  const rows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.role, "admin"), eq(usersTable.accountStatus, "active")));
  if (!excludeUserId) return rows.length;
  return rows.filter((row) => row.id !== excludeUserId).length;
}
