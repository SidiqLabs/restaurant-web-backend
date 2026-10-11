import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  foreignKey,
  integer,
  serial,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", [
  "CUSTOMER",
  "RESTAURANT_OWNER",
  "RESTAURANT_STAFF",
  "ADMIN",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("CUSTOMER"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
  ],
);

export const restaurants = pgTable("restaurants", {
  id: serial("id").primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description").notNull().default(""),
  address: varchar("address", { length: 500 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("restaurants_owner_idx").on(table.ownerId)]);

export const menus = pgTable("menus", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description").notNull().default(""),
  price: integer("price").notNull(),
  available: boolean("available").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("menus_id_restaurant_unique").on(table.id, table.restaurantId),
  index("menus_restaurant_idx").on(table.restaurantId),
  check("menus_price_nonnegative", sql`${table.price} >= 0`),
]);

// Fulfillment state only: payment attempts and provider state are a separate domain.
export const orderStatus = pgEnum("order_status", [
  "PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED",
]);

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: uuid("customer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "restrict" }),
  status: orderStatus("status").notNull().default("PENDING"),
  totalRupiah: integer("total_rupiah").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("orders_id_restaurant_unique").on(table.id, table.restaurantId),
  index("orders_customer_created_idx").on(table.customerId, table.createdAt),
  index("orders_restaurant_status_created_idx").on(table.restaurantId, table.status, table.createdAt),
  check("orders_total_nonnegative", sql`${table.totalRupiah} >= 0`),
  check("orders_timestamps_ordered", sql`${table.updatedAt} >= ${table.createdAt}`),
]);

// Immutable purchase facts; migration 0002 also rejects UPDATE and DELETE.
export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull(),
  restaurantId: integer("restaurant_id").notNull(),
  menuId: integer("menu_id").notNull(),
  menuName: varchar("menu_name", { length: 100 }).notNull(),
  unitPriceRupiah: integer("unit_price_rupiah").notNull(),
  quantity: integer("quantity").notNull(),
  lineTotalRupiah: integer("line_total_rupiah").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({
    name: "order_items_order_restaurant_fk",
    columns: [table.orderId, table.restaurantId],
    foreignColumns: [orders.id, orders.restaurantId],
  }).onDelete("restrict"),
  foreignKey({
    name: "order_items_menu_restaurant_fk",
    columns: [table.menuId, table.restaurantId],
    foreignColumns: [menus.id, menus.restaurantId],
  }).onDelete("restrict"),
  index("order_items_order_idx").on(table.orderId, table.restaurantId),
  index("order_items_menu_idx").on(table.menuId, table.restaurantId),
  check("order_items_name_nonblank", sql`length(btrim(${table.menuName})) > 0`),
  check("order_items_quantity_positive", sql`${table.quantity} > 0`),
  check("order_items_price_nonnegative", sql`${table.unitPriceRupiah} >= 0`),
  check("order_items_total_nonnegative", sql`${table.lineTotalRupiah} >= 0`),
  check("order_items_total_matches", sql`${table.lineTotalRupiah}::bigint = ${table.unitPriceRupiah}::bigint * ${table.quantity}::bigint`),
]);

// Trusted manual settlement evidence; no fulfillment state implies payment.
export const paymentStatus = pgEnum("payment_status", ["PAID", "REFUNDED"]);
export const orderPayments = pgTable("order_payments", {
  orderId: uuid("order_id").primaryKey().references(() => orders.id, { onDelete: "restrict" }),
  status: paymentStatus("status").notNull().default("PAID"),
  reference: varchar("reference", { length: 100 }).notNull(),
  confirmedBy: uuid("confirmed_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow(),
  refundedBy: uuid("refunded_by").references(() => users.id, { onDelete: "restrict" }),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("order_payments_reference_unique").on(table.reference),
  check("order_payments_refund_state", sql`(${table.status} = 'PAID' AND ${table.refundedBy} IS NULL AND ${table.refundedAt} IS NULL) OR (${table.status} = 'REFUNDED' AND ${table.refundedBy} IS NOT NULL AND ${table.refundedAt} IS NOT NULL AND ${table.refundedAt} >= ${table.confirmedAt})`),
]);

export const orderCancellations = pgTable("order_cancellations", {
  orderId: uuid("order_id").primaryKey().references(() => orders.id, { onDelete: "restrict" }),
  cancelledBy: uuid("cancelled_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }).notNull().defaultNow(),
});
