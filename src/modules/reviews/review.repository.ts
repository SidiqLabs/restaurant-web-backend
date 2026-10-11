import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { reviews, reviewMenus } from "../../db/review-schema.js";
import { users, orders, orderItems, restaurants } from "../../db/schema.js";
import { orderCheckouts } from "../../db/checkout-schema.js";
import type { Pagination, UpdateInput } from "./review.schema.js";
export type Review = typeof reviews.$inferSelect;
export type ReviewRecord = { review: Review; restaurant: { id: number; name: string }; items: (typeof orderItems.$inferSelect)[]; name?: string };
export async function withReviewCustomer<T>(customerId: string, operation: (context: {
  actor: { role: string } | undefined;
  restaurant: (id: number) => Promise<boolean>;
  order: (id: string) => Promise<typeof orders.$inferSelect | undefined>;
  items: (id: string) => Promise<(typeof orderItems.$inferSelect)[]>;
  existing: (id: string) => Promise<Review | undefined>;
  owned: (id: number) => Promise<Review | undefined>;
  create: (input: typeof reviews.$inferInsert, menus: number[]) => Promise<Review>;
  update: (id: number, input: UpdateInput) => Promise<Review>;
  remove: (id: number) => Promise<void>;
  details: (review: Review) => Promise<ReviewRecord>;
}) => Promise<T>) {
  return db.transaction(async (tx) => {
    // Lock current role and serialize customer mutations, like Cart/Checkout.
    const [actor] = await tx.select({ role: users.role }).from(users).where(eq(users.id, customerId)).for("update");
    return operation({ actor,
      restaurant: async (id) => !!(await tx.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.id, id)).limit(1))[0],
      order: async (id) => (await tx.select({ order: orders }).from(orders).innerJoin(orderCheckouts, eq(orderCheckouts.orderId, orders.id))
        .where(and(eq(orders.id, id), eq(orders.customerId, customerId))).for("share", { of: orders }))[0]?.order,
      items: async (id) => tx.select().from(orderItems).where(eq(orderItems.orderId, id)),
      existing: async (id) => (await tx.select().from(reviews).where(eq(reviews.orderId, id)))[0],
      owned: async (id) => (await tx.select().from(reviews).where(and(eq(reviews.id, id), eq(reviews.customerId, customerId), isNull(reviews.deletedAt))).for("update"))[0],
      create: async (input, menus) => {
        const [review] = await tx.insert(reviews).values(input).returning();
        await tx.insert(reviewMenus).values(menus.map((menuId) => ({ reviewId: review!.id, menuId })));
        return review!;
      },
      update: async (id, input) => (await tx.update(reviews).set({ ...input, updatedAt: new Date() }).where(and(eq(reviews.id, id), eq(reviews.customerId, customerId), isNull(reviews.deletedAt))).returning())[0]!,
      remove: async (id) => { const now = new Date(); await tx.update(reviews).set({ deletedAt: now, updatedAt: now }).where(and(eq(reviews.id, id), eq(reviews.customerId, customerId), isNull(reviews.deletedAt))); },
      details: async (review) => {
        const [restaurant] = await tx.select({ id: restaurants.id, name: restaurants.name }).from(restaurants).where(eq(restaurants.id, review.restaurantId));
        const items = await tx.select({ item: orderItems }).from(reviewMenus).innerJoin(orderItems, and(eq(orderItems.menuId, reviewMenus.menuId), eq(orderItems.orderId, review.orderId))).where(eq(reviewMenus.reviewId, review.id)).orderBy(orderItems.menuId);
        return { review, restaurant: restaurant!, items: items.map((row) => row.item) };
      },
    });
  });
}
export async function listReviews(customerId: string | undefined, restaurantId: number | undefined, query: Pagination) {
  // One snapshot for aggregate, page and selected immutable purchase items.
  return db.transaction(async (tx) => {
    const actor = customerId ? (await tx.select({ role: users.role }).from(users).where(eq(users.id, customerId)))[0] : undefined;
    const restaurantExists = restaurantId ? !!(await tx.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.id, restaurantId)))[0] : undefined;
    const where = and(isNull(reviews.deletedAt), customerId ? eq(reviews.customerId, customerId) : eq(reviews.restaurantId, restaurantId!));
    const [aggregate] = await tx.select({ count: sql<number>`count(*)::int`, average: sql<string>`coalesce(round(avg(${reviews.star}),2),0)::text` }).from(reviews).where(where);
    const rows = await tx.select({ review: reviews, restaurant: { id: restaurants.id, name: restaurants.name }, name: users.name }).from(reviews)
      .innerJoin(restaurants, eq(restaurants.id, reviews.restaurantId)).innerJoin(users, eq(users.id, reviews.customerId)).where(where)
      .orderBy(desc(reviews.createdAt), desc(reviews.id)).limit(query.limit).offset((query.page - 1) * query.limit);
    const menuRows = rows.length ? await tx.select({ reviewId: reviewMenus.reviewId, item: orderItems }).from(reviewMenus).innerJoin(reviews, eq(reviews.id, reviewMenus.reviewId))
      .innerJoin(orderItems, and(eq(orderItems.orderId, reviews.orderId), eq(orderItems.menuId, reviewMenus.menuId))).where(inArray(reviewMenus.reviewId, rows.map((row) => row.review.id))).orderBy(orderItems.menuId) : [];
    return { actor, restaurantExists, records: rows.map((row) => ({ ...row, items: menuRows.filter((menu) => menu.reviewId === row.review.id).map((menu) => menu.item) })),
      total: aggregate!.count, averageRating: Number(aggregate!.average) };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
