import { migrate } from "drizzle-orm/node-postgres/migrator";
import { installIsolatedDatabaseGuard } from "./isolated-database-guard.js";
const restore = installIsolatedDatabaseGuard();
const { db, closeDatabase } = await import("../src/db/client.js");
// Explicit operator entry point, never called at startup. Existing migration
// history stays intact; supplemental migrations have a separate tracking table.
try {
  await migrate(db, { migrationsFolder: "drizzle" });
  await migrate(db, { migrationsFolder: "drizzle/payments", migrationsTable: "payment_migrations" });
} finally { await closeDatabase(); restore(); }
