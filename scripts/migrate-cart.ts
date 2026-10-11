import { migrate } from "drizzle-orm/node-postgres/migrator";
import { installIsolatedDatabaseGuard } from "./isolated-database-guard.js";

// Operator-only test entry point. Reuse the existing proven loopback identity
// guard; TEST_DATABASE_NAME must explicitly select this session's disposable DB.
const name = process.env.TEST_DATABASE_NAME;
if (!name || !/^foody_5c4_test_[0-9]{14}$/.test(name)) throw new Error("Explicit isolated TEST_DATABASE_NAME required");
const restore = installIsolatedDatabaseGuard();
const { db, closeDatabase } = await import("../src/db/client.js");
try {
  await migrate(db, { migrationsFolder: "drizzle" });
  await migrate(db, { migrationsFolder: "drizzle/payments", migrationsTable: "payment_migrations" });
  await migrate(db, { migrationsFolder: "drizzle/cart", migrationsTable: "cart_migrations" });
} finally { await closeDatabase(); restore(); }
