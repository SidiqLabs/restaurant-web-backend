import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, serial, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { menus, restaurants, users } from "./schema.js";

// Mutable shopping state only. Order/payment tables remain independent.
export const carts = pgTable("carts", {
  customerId: uuid("customer_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
}, (table) => [uniqueIndex("carts_customer_restaurant_unique").on(table.customerId, table.restaurantId)]);

export const cartItems = pgTable("cart_items", {
  id: serial("id").primaryKey(),
  customerId: uuid("customer_id").notNull(),
  restaurantId: integer("restaurant_id").notNull(),
  menuId: integer("menu_id").notNull(),
  quantity: integer("quantity").notNull(),
  // Finite unique slots enforce the 50-line bound even for direct SQL writers.
  slot: integer("slot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ name: "cart_items_cart_restaurant_fk", columns: [table.customerId, table.restaurantId], foreignColumns: [carts.customerId, carts.restaurantId] }).onDelete("cascade"),
  foreignKey({ name: "cart_items_menu_restaurant_fk", columns: [table.menuId, table.restaurantId], foreignColumns: [menus.id, menus.restaurantId] }).onDelete("cascade"),
  uniqueIndex("cart_items_customer_menu_unique").on(table.customerId, table.menuId),
  uniqueIndex("cart_items_customer_slot_unique").on(table.customerId, table.slot),
  index("cart_items_menu_restaurant_idx").on(table.menuId, table.restaurantId),
  check("cart_items_quantity_bounds", sql`${table.quantity} BETWEEN 1 AND 99`),
  check("cart_items_slot_bounds", sql`${table.slot} BETWEEN 1 AND 50`),
]);
