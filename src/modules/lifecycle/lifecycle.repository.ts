import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { orders, orderPayments, restaurants, users } from "../../db/schema.js";
import type { OrderStatus } from "./lifecycle.schema.js";

export async function withLifecycleOrder<T>(actorId: string, orderId: string, operation: (context: {
  actor: { role: string } | undefined;
  order: typeof orders.$inferSelect | undefined;
  restaurant: { ownerId: string } | undefined;
  payment: { status: string } | undefined;
  transition: (expected: OrderStatus, target: OrderStatus) => Promise<typeof orders.$inferSelect | undefined>;
}) => Promise<T>) {
  return db.transaction(async (tx) => {
    // Match Payment's actor -> order lock order. Refund/cancel/confirmation and
    // fulfillment serialize on the same order, including after a lock wait.
    const [actor] = await tx.select({ role: users.role }).from(users).where(eq(users.id, actorId)).for("share");
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    const [restaurant] = order ? await tx.select({ ownerId: restaurants.ownerId }).from(restaurants)
      .where(eq(restaurants.id, order.restaurantId)).for("share") : [];
    const [payment] = await tx.select({ status: orderPayments.status }).from(orderPayments).where(eq(orderPayments.orderId, orderId));
    return operation({ actor, order, restaurant, payment,
      transition: async (expected, target) => (await tx.update(orders)
        .set({ status: target, updatedAt: sql`greatest(clock_timestamp(), ${orders.updatedAt})` })
        .where(and(eq(orders.id, orderId), eq(orders.status, expected))).returning())[0],
    });
  });
}
