import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "../config/env.js";

// Keep one shared pool for the process. Creating pools per request would create
// unnecessary database connections and eventually exhaust PostgreSQL capacity.
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

export const db = drizzle({ client: pool });

// Closing the pool explicitly allows graceful process shutdown and test cleanup.
export async function closeDatabase(): Promise<void> {
  await pool.end();
}
