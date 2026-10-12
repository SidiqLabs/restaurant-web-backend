import { migrate } from "drizzle-orm/node-postgres/migrator";
import { installIsolatedDatabaseGuard } from "./isolated-database-guard.js";

const name = process.env.TEST_DATABASE_NAME;
if (!name || !/^foody_5c4_test_[0-9]{14}$/.test(name)) throw new Error("Explicit isolated TEST_DATABASE_NAME required");
const restore = installIsolatedDatabaseGuard();
const { db, closeDatabase } = await import("../src/db/client.js");
try {
  // Existing prerequisite migrations must already be applied. Never replay or
  // rewrite unrelated streams during this focused migration.
  await migrate(db, { migrationsFolder: "drizzle/staff", migrationsTable: "staff_migrations" });
} finally { await closeDatabase(); restore(); }
