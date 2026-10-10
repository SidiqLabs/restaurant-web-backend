import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
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
  index("menus_restaurant_idx").on(table.restaurantId),
  check("menus_price_nonnegative", sql`${table.price} >= 0`),
]);
