import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { menus, orderItems, orders, orderStatus } from "../src/db/schema.js";

const migration = readFileSync(new URL("../drizzle/0002_orders_storage_foundation.sql", import.meta.url), "utf8");

describe("orders storage schema", () => {
  it("keeps fulfillment distinct from payment", () => {
    expect(orderStatus.enumValues).toEqual(["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"]);
    expect(Object.keys(orders)).not.toContain("paymentStatus");
    expect(orders.status.hasDefault).toBe(true);
  });

  it("requires integer money, quantity, purchase names and timezone timestamps", () => {
    for (const column of [orders.totalRupiah, orderItems.unitPriceRupiah, orderItems.quantity, orderItems.lineTotalRupiah]) {
      expect(column.getSQLType()).toBe("integer");
      expect(column.notNull).toBe(true);
    }
    expect(orderItems.menuName.notNull).toBe(true);
    expect(orders.createdAt.getSQLType()).toBe("timestamp with time zone");
    expect(orders.updatedAt.notNull).toBe(true);
  });

  it("enforces ownership references and same-restaurant item relationships", () => {
    const orderConfig = getTableConfig(orders);
    expect(orderConfig.foreignKeys).toHaveLength(2);
    for (const fk of orderConfig.foreignKeys) expect(fk.onDelete).toBe("restrict");
    const itemConfig = getTableConfig(orderItems);
    expect(itemConfig.foreignKeys.map((fk) => fk.reference().columns.map((c) => c.name)))
      .toEqual([["order_id", "restaurant_id"], ["menu_id", "restaurant_id"]]);
    for (const fk of itemConfig.foreignKeys) expect(fk.onDelete).toBe("restrict");
    expect(getTableConfig(menus).indexes.some((i) => i.config.name === "menus_id_restaurant_unique")).toBe(true);
  });

  it("ships checks, history indexes and database snapshot protection", () => {
    expect(getTableConfig(orderItems).checks.map((c) => c.name)).toEqual([
      "order_items_name_nonblank", "order_items_quantity_positive", "order_items_price_nonnegative",
      "order_items_total_nonnegative", "order_items_total_matches",
    ]);
    expect(getTableConfig(orders).indexes.map((i) => i.config.name)).toContain("orders_customer_created_idx");
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON "public"."order_items"');
    expect(migration).toContain('::bigint *');
    // PostgreSQL needs the referenced unique indexes before installing the FKs.
    expect(migration.indexOf('CREATE UNIQUE INDEX "orders_id_restaurant_unique"'))
      .toBeLessThan(migration.indexOf('ADD CONSTRAINT "order_items_order_restaurant_fk"'));
    expect(migration.indexOf('CREATE UNIQUE INDEX "menus_id_restaurant_unique"'))
      .toBeLessThan(migration.indexOf('ADD CONSTRAINT "order_items_menu_restaurant_fk"'));
    expect(migration).not.toMatch(/\b(?:INSERT INTO|TRUNCATE|DROP TABLE|DELETE FROM)\b/i);
  });

  it("registers the migration and links the generated snapshot to its predecessor", () => {
    const read = (name: string) => JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8")) as Record<string, unknown>;
    const previous = read("../drizzle/meta/0001_snapshot.json");
    const current = read("../drizzle/meta/0002_snapshot.json");
    expect(current.prevId).toBe(previous.id);
    expect(Object.keys(current.tables as object)).toContain("public.orders");
    expect(Object.keys(current.tables as object)).toContain("public.order_items");
    const journal = read("../drizzle/meta/_journal.json");
    expect((journal.entries as { tag: string }[]).at(-1)?.tag).toBe("0002_orders_storage_foundation");
  });
});
