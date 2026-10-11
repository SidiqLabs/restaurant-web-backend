import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, serial, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { orders, restaurants, users } from "./schema.js";

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  customerId: uuid("customer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "restrict" }),
  orderId: uuid("order_id").notNull(),
  star: integer("star").notNull(),
  comment: varchar("comment", { length: 2000 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  foreignKey({ name: "reviews_order_restaurant_fk", columns: [t.orderId, t.restaurantId], foreignColumns: [orders.id, orders.restaurantId] }).onDelete("restrict"),
  uniqueIndex("reviews_order_unique").on(t.orderId),
  index("reviews_restaurant_created_idx").on(t.restaurantId, t.createdAt, t.id),
  index("reviews_customer_created_idx").on(t.customerId, t.createdAt, t.id),
  check("reviews_star_bounds", sql`${t.star} BETWEEN 1 AND 5`),
  check("reviews_comment_bounds", sql`length(btrim(${t.comment})) BETWEEN 1 AND 2000`),
  check("reviews_timestamps", sql`${t.updatedAt} >= ${t.createdAt} AND (${t.deletedAt} IS NULL OR ${t.deletedAt} >= ${t.createdAt})`),
]);
export const reviewMenus = pgTable("review_menus", {
  reviewId: integer("review_id").notNull().references(() => reviews.id, { onDelete: "restrict" }),
  menuId: integer("menu_id").notNull(),
}, (t) => [uniqueIndex("review_menus_review_menu_unique").on(t.reviewId, t.menuId)]);
