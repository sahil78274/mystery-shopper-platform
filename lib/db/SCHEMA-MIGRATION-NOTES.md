# Schema migration note: case-insensitive email uniqueness

The `users` and `shoppers` tables now declare unique indexes on `lower(email)`. This closes the race left by application-level lowercase checks and protects both registration and admin/profile updates. The linked user and shopper rows may still share the same email because the index is scoped to each table. The default role for newly inserted users is also least-privilege (`mystery_shopper`); trusted administrator creation paths continue to set `admin` explicitly.

Before applying the schema to any existing database, check for case-insensitive duplicates and resolve them with the account owners; do not automatically delete or merge account records:

```sql
SELECT lower(email) AS normalized_email, array_agg(id ORDER BY id) AS ids
FROM users
GROUP BY lower(email)
HAVING count(*) > 1;

SELECT lower(email) AS normalized_email, array_agg(id ORDER BY id) AS ids
FROM shoppers
GROUP BY lower(email)
HAVING count(*) > 1;
```

The unique-index creation will fail if either query returns rows. On a production database, schedule and review the DDL: index creation/drop can contend with writes, and the existing data must be reconciled first. This audit did not run `drizzle-kit push` or modify any database; no `DATABASE_URL` was configured.
