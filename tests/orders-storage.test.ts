import { isolatedDatabase } from "../scripts/isolated-database-guard.js";
import { describe, expect, it } from "vitest";
import pg from "pg";

// Opt-in only; never use the setup file's default DB or apply migrations here.
const url = process.env.ORDERS_TEST_DATABASE_URL;
describe.skipIf(!url)("orders PostgreSQL invariants (rollback only)", () => {
  it("preserves snapshots and rejects invalid money, relationships and deletion", async () => {
    const target = new URL(url!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
        target.pathname !== `/${isolatedDatabase}`) {
      throw new Error("Requires explicitly configured local isolated test database");
    }
    const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 });
    await client.connect();
    try {
      const identity = await client.query<{ name: string; recovery: boolean }>(
        "SELECT current_database() AS name, pg_is_in_recovery() AS recovery",
      );
      expect(identity.rows[0]).toEqual({ name: isolatedDatabase, recovery: false });
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '5s'");
      const reject = async (sql: string, values: unknown[], code: string) => {
        await client.query("SAVEPOINT invalid_write");
        try {
          await expect(client.query(sql, values)).rejects.toMatchObject({ code });
        } finally {
          await client.query("ROLLBACK TO SAVEPOINT invalid_write");
        }
      };
      const user = await client.query<{ id: string }>(
        "INSERT INTO users (name,email,password_hash) VALUES ('Orders fixture',$1,'unused') RETURNING id",
        [`orders-${crypto.randomUUID()}@example.com`],
      );
      const uid = user.rows[0]!.id;
      const restaurants = await client.query<{ id: number }>(
        "INSERT INTO restaurants (owner_id,name,address) VALUES ($1,'One','Test'),($1,'Two','Test') RETURNING id", [uid],
      );
      const rid = restaurants.rows[0]!.id;
      const other = restaurants.rows[1]!.id;
      const menu = await client.query<{ id: number }>(
        "INSERT INTO menus (restaurant_id,name,price) VALUES ($1,'Original',15000) RETURNING id", [rid],
      );
      const mid = menu.rows[0]!.id;
      const order = await client.query<{ id: string; status: string }>(
        "INSERT INTO orders (customer_id,restaurant_id,total_rupiah) VALUES ($1,$2,30000) RETURNING id,status", [uid, rid],
      );
      const oid = order.rows[0]!.id;
      expect(order.rows[0]!.status).toBe("PENDING");
      const insert = "INSERT INTO order_items (order_id,restaurant_id,menu_id,menu_name,unit_price_rupiah,quantity,line_total_rupiah) VALUES ($1,$2,$3,$4,$5,$6,$7)";
      await client.query(insert, [oid, rid, mid, "Original", 15000, 2, 30000]);
      for (const [price, quantity, total, name] of [
        [-1, 2, -2, "Original"], [15000, 0, 0, "Original"],
        [15000, 2, 1, "Original"], [15000, 2, 30000, " "],
        [2147483647, 2, 1, "Original"],
      ]) {
        await reject(insert, [oid, rid, mid, name, price, quantity, total], "23514");
      }
      await reject(insert, [oid, rid, mid, "Original", 1.5, 2, 3], "22P02");
      await reject(insert, [oid, other, mid, "Original", 15000, 2, 30000], "23503");
      await reject("INSERT INTO orders (customer_id,restaurant_id,total_rupiah) VALUES ($1,$2,-1)", [uid, rid], "23514");
      await reject("UPDATE orders SET status = 'PAID' WHERE id = $1", [oid], "22P02");
      await reject("UPDATE order_items SET quantity = 3 WHERE order_id = $1", [oid], "23514");
      await reject("DELETE FROM order_items WHERE order_id = $1", [oid], "23514");
      await reject("DELETE FROM orders WHERE id = $1", [oid], "23001");
      await reject("DELETE FROM users WHERE id = $1", [uid], "23001");
      await reject("DELETE FROM menus WHERE id = $1", [mid], "23001");
      await client.query("UPDATE menus SET name = 'Changed', price = 999 WHERE id = $1", [mid]);
      const snapshot = await client.query("SELECT menu_name,unit_price_rupiah,quantity,line_total_rupiah FROM order_items WHERE order_id = $1", [oid]);
      expect(snapshot.rows).toEqual([{ menu_name: "Original", unit_price_rupiah: 15000, quantity: 2, line_total_rupiah: 30000 }]);
    } finally {
      // Only uncommitted fixtures are discarded; existing data is never deleted.
      try { await client.query("ROLLBACK"); } finally { await client.end(); }
    }
  });
});
