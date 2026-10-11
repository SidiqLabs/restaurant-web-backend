import { and, asc, desc, eq, ne, sql, getTableColumns } from "drizzle-orm";
import { db } from "../../db/client.js";
import { orderItems, orderPayments, orders, restaurants } from "../../db/schema.js";
import type { Pagination } from "../restaurants/restaurant.schema.js";
export async function rankedRestaurants({ page, limit }: Pagination) {
  const quantity = sql<string>`sum(${orderItems.quantity})::text`;
  const eligible = and(eq(orderPayments.status, "PAID"), ne(orders.status, "CANCELLED"));
  return db.transaction(async (tx) => {
    const [result] = await tx.select({ total: sql<number>`count(distinct ${orders.restaurantId})::integer` }).from(orders)
      .innerJoin(orderPayments, eq(orderPayments.orderId, orders.id))
      .innerJoin(orderItems, eq(orderItems.orderId, orders.id)).where(eligible);
    const rows = await tx.select({ ...getTableColumns(restaurants), soldQuantity: quantity }).from(restaurants)
      .innerJoin(orders, eq(orders.restaurantId, restaurants.id))
      .innerJoin(orderPayments, eq(orderPayments.orderId, orders.id))
      .innerJoin(orderItems, eq(orderItems.orderId, orders.id)).where(eligible)
      .groupBy(restaurants.id).orderBy(desc(sql`sum(${orderItems.quantity})`), asc(restaurants.id))
      .limit(limit).offset((page - 1) * limit);
    const total = result!.total;
    return { restaurants: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
