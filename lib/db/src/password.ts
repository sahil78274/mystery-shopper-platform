import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SCRYPT_COST = 16384;

export const PASSWORD_MIN_LENGTH = 8;

/**
 * Passwords are hashed with scrypt (16 byte random salt, 64 byte key).
 * scrypt ships with Node so no native build step is needed, and the cost
 * keeps offline cracking slow. The stored format is
 * `scrypt$<cost>$<salt-hex>$<key-hex>`.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${SCRYPT_COST}$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, cost, salt, digest] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !digest) return false;
  const expected = Buffer.from(digest, "hex");
  if (expected.length !== KEY_LENGTH) return false;
  let derived: Buffer;
  try {
    derived = await scrypt(password, salt, expected.length);
  } catch {
    return false;
  }
  // `cost` is recorded so the parameters can be raised later; verification
  // currently uses the Node defaults that produced the stored hash.
  void cost;
  return timingSafeEqual(derived, expected);
}
