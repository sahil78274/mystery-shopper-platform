# Reviewed migration note: password reset tokens

The ZeptoMail password-recovery endpoints require a new `password_reset_tokens` table. The Drizzle schema is defined in `src/schema/password-reset-tokens.ts` and exported from `src/schema/index.ts`.

**No migration has been applied to any database by this change.** Before production deployment, a database owner must review this DDL, test it against a staging backup, take the normal backup/rollback precautions, and apply it using the repository's approved production migration process. The repository currently has no checked-in versioned SQL migration workflow; do not run `drizzle-kit push` against production without a separate review and explicit approval.

PostgreSQL DDL represented by the schema:

```sql
CREATE TABLE "password_reset_tokens" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "password_reset_tokens_hash_unique"
  ON "password_reset_tokens" ("token_hash");
CREATE INDEX "password_reset_tokens_user_id_idx"
  ON "password_reset_tokens" ("user_id");
CREATE INDEX "password_reset_tokens_expires_at_idx"
  ON "password_reset_tokens" ("expires_at");
```

The table stores only SHA-256 token hashes, never raw reset tokens. User deletion cascades its reset rows. Application rollout must follow the database migration; without this table, the password-recovery endpoints cannot complete. Existing sign-in and unrelated database workflows do not depend on the table.
