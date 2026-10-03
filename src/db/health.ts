import { sql } from "drizzle-orm";

import { db } from "./client.js";

// This probe verifies actual PostgreSQL connectivity without depending on any
// domain table, so it remains valid before application schemas are introduced.
export async function checkDatabaseConnection(): Promise<void> {
  await db.execute(sql`select 1`);
}
