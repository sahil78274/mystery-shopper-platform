/**
 * Idempotent bootstrap for a fresh database.
 *
 * Creates the first administrator account when no account exists yet, so a
 * brand new deployment can be signed into. Running it against a populated
 * database does nothing unless FORCE_SEED_ADMIN=1 is set.
 *
 *   pnpm --filter @workspace/scripts run seed
 *
 * Environment:
 *   DATABASE_URL           (required)
 *   SEED_ADMIN_EMAIL       default admin@ricoz.in
 *   SEED_ADMIN_PASSWORD    default: generated and printed once
 *   SEED_ADMIN_NAME        default "Platform Administrator"
 *   FORCE_SEED_ADMIN=1     reset the password of the first administrator
 */
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, hashPassword, usersTable } from "@workspace/db";

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@ricoz.in").trim().toLowerCase();
  const name = process.env.SEED_ADMIN_NAME ?? "Platform Administrator";

  const [existingAdmin] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  const [anyUser] = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
  if (anyUser && !existingAdmin && process.env.FORCE_SEED_ADMIN !== "1") {
    console.log("Accounts already exist — nothing to seed.");
    return;
  }

  if (existingAdmin && process.env.FORCE_SEED_ADMIN !== "1") {
    console.log(`Administrator ${email} already exists — nothing to seed.`);
    return;
  }

  const password = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(9).toString("base64url");
  const passwordHash = await hashPassword(password);

  if (existingAdmin) {
    await db
      .update(usersTable)
      .set({ passwordHash, accountStatus: "active", role: "admin" })
      .where(eq(usersTable.id, existingAdmin.id));
    console.log(`Updated administrator password for ${email}.`);
  } else {
    await db.insert(usersTable).values({
      fullName: name,
      email,
      passwordHash,
      role: "admin",
      accountStatus: "active",
    });
    console.log(`Created administrator ${email}.`);
  }
  console.log(`Password: ${password}`);
  console.log("Store this password somewhere safe — it is not recoverable from the database.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
