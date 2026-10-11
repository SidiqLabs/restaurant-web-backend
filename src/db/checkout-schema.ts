import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { orders, users } from "./schema.js";

// Immutable placement facts, separate from mutable fulfillment/payment state.
export const orderCheckouts = pgTable("order_checkouts", {
  id: serial("id").primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  customerId: uuid("customer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
  requestHash: varchar("request_hash", { length: 64 }).notNull(),
  restaurantName: varchar("restaurant_name", { length: 100 }).notNull(),
  deliveryAddress: varchar("delivery_address", { length: 500 }).notNull(),
  phone: varchar("phone", { length: 30 }).notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }).notNull(),
  notes: varchar("notes", { length: 1000 }).notNull().default(""),
  itemCount: integer("item_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("order_checkouts_order_unique").on(table.orderId),
  uniqueIndex("order_checkouts_customer_key_unique").on(table.customerId, table.idempotencyKey),
  index("order_checkouts_customer_created_idx").on(table.customerId, table.createdAt),
  check("order_checkouts_key_valid", sql`${table.idempotencyKey} ~ '^[A-Za-z0-9_-]{16,128}$'`),
  check("order_checkouts_hash_valid", sql`${table.requestHash} ~ '^[a-f0-9]{64}$'`),
  check("order_checkouts_address_bounds", sql`length(btrim(${table.deliveryAddress})) BETWEEN 10 AND 500`),
  check("order_checkouts_phone_valid", sql`${table.phone} ~ '^[+0-9() -]{8,30}$' AND ${table.phone} ~ '[0-9]'`),
  check("order_checkouts_payment_method", sql`${table.paymentMethod} IN ('BNI Bank Negara Indonesia','BRI Bank Rakyat Indonesia','BCA Bank Central Asia','Mandiri')`),
  check("order_checkouts_item_count", sql`${table.itemCount} BETWEEN 1 AND 50`),
]);
