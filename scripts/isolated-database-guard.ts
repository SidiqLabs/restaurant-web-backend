import pg from "pg";

// An explicit test identity is required when selecting an additional database.
// Keep the original Session 5C.4 database as the compatibility default.
export const isolatedDatabase = process.env.TEST_DATABASE_NAME ?? "foody_5c4_test_20261011131646";
if (!/^foody_5c4_test_[0-9]{14}$/.test(isolatedDatabase)) {
  throw new Error("Requires a Session 5C.4 test-specific database name");
}
export const isolatedUrl = process.env.DATABASE_URL ?? "";

function isAuthorizedDatabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ["postgresql:", "postgres:"].includes(url.protocol) &&
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      (url.port === "5432" || url.port === "") &&
      url.pathname === `/${isolatedDatabase}` &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

// Session verification tooling only; never imported by the application.
// Check on the same connection immediately before every operation, including
// SQL issued internally by Drizzle migrations and HTTP-driven transactions.
export function installIsolatedDatabaseGuard() {
  if (!isAuthorizedDatabaseUrl(process.env.DATABASE_URL ?? "")) {
    throw new Error("Session 5C.4 requires the exact authorized DATABASE_URL");
  }
  const original = pg.Client.prototype.query;
  const verified = new WeakSet<pg.Client>();
  Object.defineProperty(pg.Client.prototype, "query", {
    configurable: true,
    writable: true,
    value: function (this: pg.Client, ...args: unknown[]) {
      const callback = typeof args.at(-1) === "function" ? args.pop() as (error: unknown, result?: unknown) => void : undefined;
      const run = async () => {
        try {
          const identity = await Reflect.apply(original, this, ["SELECT current_database() AS name"]);
          if (identity.rows[0]?.name !== isolatedDatabase) {
            throw new Error("Database isolation check failed; operation refused");
          }
          verified.add(this);
        } catch (error) {
          // PostgreSQL cannot SELECT inside an aborted transaction. Permit only
          // rollback recovery on a connection whose identity was already proven;
          // rollback discards writes and cannot switch the connected database.
          const first = args[0];
          const query = typeof first === "string" ? first :
            first && typeof first === "object" && "text" in first && typeof first.text === "string" ? first.text : "";
          if (!verified.has(this) || !/^ROLLBACK(?:\s|$)/i.test(query) ||
              !(error && typeof error === "object" && "code" in error && error.code === "25P02")) throw error;
        }
        return Reflect.apply(original, this, args);
      };
      const result = run();
      if (callback) {
        void result.then((value) => callback(null, value), (error: unknown) => callback(error));
        return;
      }
      return result;
    },
  });
  return () => { pg.Client.prototype.query = original; };
}
