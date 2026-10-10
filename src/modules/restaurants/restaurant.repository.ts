import { and, asc, count, eq, ilike, or } from "drizzle-orm";
import { db } from "../../db/client.js";
import { menus, restaurants } from "../../db/schema.js";
import type { MenuInput, Pagination, RestaurantInput, RestaurantSearch } from "./restaurant.schema.js";

export async function listRestaurants({ page, limit }: Pagination) {
  return db.select().from(restaurants).orderBy(asc(restaurants.id)).limit(limit).offset((page - 1) * limit);
}
export async function findRestaurant(id: number) {
  const [row] = await db.select().from(restaurants).where(eq(restaurants.id, id)).limit(1);
  return row;
}
export async function insertRestaurant(ownerId: string, input: RestaurantInput) {
  const [row] = await db.insert(restaurants).values({ ...input, ownerId }).returning();
  return row;
}
export async function updateRestaurant(id: number, input: { [K in keyof RestaurantInput]?: RestaurantInput[K] | undefined }) {
  const [row] = await db.update(restaurants).set({ ...input, updatedAt: new Date() }).where(eq(restaurants.id, id)).returning();
  return row;
}
export async function listMenus(restaurantId: number, { page, limit }: Pagination) {
  return db.select().from(menus).where(eq(menus.restaurantId, restaurantId)).orderBy(asc(menus.id)).limit(limit).offset((page - 1) * limit);
}
export async function findMenu(restaurantId: number, id: number) {
  const [row] = await db.select().from(menus).where(and(eq(menus.id, id), eq(menus.restaurantId, restaurantId))).limit(1);
  return row;
}
export async function insertMenu(restaurantId: number, input: MenuInput) {
  const [row] = await db.insert(menus).values({ ...input, restaurantId }).returning();
  return row;
}
export async function updateMenu(restaurantId: number, id: number, input: { [K in keyof MenuInput]?: MenuInput[K] | undefined }) {
  const [row] = await db.update(menus).set({ ...input, updatedAt: new Date() }).where(and(eq(menus.id, id), eq(menus.restaurantId, restaurantId))).returning();
  return row;
}

export async function searchRestaurants({ q, page, limit }: RestaurantSearch) {
  // Escape LIKE metacharacters so user input remains a literal substring.
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const matches = or(ilike(restaurants.name, pattern), ilike(restaurants.description, pattern));
  // Count and page share a snapshot, including when concurrent catalog writes occur.
  return db.transaction(async (tx) => {
    const [result] = await tx.select({ total: count() }).from(restaurants).where(matches);
    const rows = await tx.select().from(restaurants).where(matches)
      .orderBy(asc(restaurants.id)).limit(limit).offset((page - 1) * limit);
    const total = result!.total;
    return { restaurants: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }, searchQuery: q };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function recommendedRestaurants() {
  return db.select().from(restaurants).orderBy(asc(restaurants.id)).limit(20);
}
