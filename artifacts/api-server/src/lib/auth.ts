import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt, ne, sql } from "drizzle-orm";
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
import { normalizedRegionScope } from "./workflow";

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

export function isUserRole(value: string): value is UserRole {
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
  if (!row || !isUserRole(row.user.role)) return null;
  return {
    id: row.user.id,
    fullName: row.user.fullName,
    email: row.user.email,
    role: row.user.role,
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
  // Record activity only; the 14-day expiry remains fixed from login.
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

/** Regional accounts without an assigned region must never fall back to network-wide scope. */
export function requireAssignedRegion(req: Request, res: Response, next: NextFunction): void {
  const user = req.authUser;
  if (user?.role === "regional_executive" && !user.region?.trim()) {
    res.status(403).json({ error: "Your account is not assigned to a region." });
    return;
  }
  next();
}

export function isAdmin(user: AuthUser | undefined): boolean {
  return user?.role === "admin";
}

export function canReview(user: AuthUser | undefined): boolean {
  return user?.role === "admin" || user?.role === "reviewer";
}

/** The region a query must be scoped to, or null for unrestricted/unassigned roles. */
export function regionScopeFor(user: AuthUser): string | null {
  return normalizedRegionScope(user.role, user.region);
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
    .where(sql`lower(${usersTable.email}) = ${normalizeEmail(email)}`)
    .limit(1);
  return row ?? null;
}

export async function emailTaken(email: string, exceptUserId?: number): Promise<boolean> {
  const match = await findUserByEmail(email);
  return Boolean(match && match.id !== exceptUserId);
}

export async function shopperEmailTaken(email: string, exceptShopperId?: number): Promise<boolean> {
  const [match] = await db
    .select({ id: shoppersTable.id })
    .from(shoppersTable)
    .where(sql`lower(${shoppersTable.email}) = ${normalizeEmail(email)}`)
    .limit(1);
  return Boolean(match && match.id !== exceptShopperId);
}
