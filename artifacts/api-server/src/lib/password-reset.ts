import { createHash, randomBytes } from "node:crypto";

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

export type PasswordResetCandidate = {
  expiresAt: Date | string;
  usedAt: Date | string | null;
};

export function createPasswordResetToken(now = Date.now()): {
  token: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashPasswordResetToken(token),
    expiresAt: new Date(now + PASSWORD_RESET_TTL_MS),
  };
}

/** The plaintext token is emailed once; only this hash is persisted. */
export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Keep the plaintext token in the browser fragment, not the HTTP request URL. */
export function passwordResetUrl(publicAppUrl: string, token: string): string {
  const resetUrl = new URL("/reset-password", publicAppUrl);
  resetUrl.hash = new URLSearchParams({ token }).toString();
  return resetUrl.toString();
}

export function isPasswordResetTokenUsable(
  candidate: PasswordResetCandidate,
  now = Date.now(),
): boolean {
  const expiresAt = candidate.expiresAt instanceof Date
    ? candidate.expiresAt.getTime()
    : new Date(candidate.expiresAt).getTime();
  return candidate.usedAt == null && Number.isFinite(expiresAt) && expiresAt > now;
}
