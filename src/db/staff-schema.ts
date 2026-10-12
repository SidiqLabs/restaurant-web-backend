import { foreignKey, integer, pgTable, primaryKey, text, timestamp, uuid, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { orders, restaurants, users } from "./schema.js";

export const restaurantStaff = pgTable("restaurant_staff", {
  restaurantId: integer("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "restrict" }),
  staffId: uuid("staff_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  status: text("status").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.restaurantId, t.staffId] }), check("restaurant_staff_status", sql`${t.status} IN ('active', 'revoked')`)]);

export const orderStaff = pgTable("order_staff", {
  orderId: uuid("order_id").primaryKey(),
  restaurantId: integer("restaurant_id").notNull(),
  staffId: uuid("staff_id").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  foreignKey({ name: "order_staff_order_restaurant_fk", columns: [t.orderId, t.restaurantId], foreignColumns: [orders.id, orders.restaurantId] }).onDelete("restrict"),
  foreignKey({ name: "order_staff_membership_fk", columns: [t.restaurantId, t.staffId], foreignColumns: [restaurantStaff.restaurantId, restaurantStaff.staffId] }).onDelete("restrict"),
]);
