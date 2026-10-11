import { eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { orders, orderItems, orderPayments, orderCancellations, users } from "../../db/schema.js";

export async function withLockedOrder<T>(userId: string, orderId: string,
  operation: (context: {
    actor: typeof users.$inferSelect | undefined;
    order: typeof orders.$inferSelect | undefined;
    payment: typeof orderPayments.$inferSelect | undefined;
    purchase: { quantity: string; total: string };
    confirm: (reference: string) => Promise<unknown>;
    refund: () => Promise<unknown>;
    cancel: () => Promise<unknown>;
  }) => Promise<T>) {
  return db.transaction(async (tx) => {
    // Lock the current role as well as the order, preventing concurrent revocation
    // or competing confirmation/refund/cancellation from racing this operation.
    const [actor] = await tx.select().from(users).where(eq(users.id, userId)).for("share");
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    const [payment] = await tx.select().from(orderPayments).where(eq(orderPayments.orderId, orderId));
    const [purchase] = await tx.select({ quantity: sql<string>`coalesce(sum(${orderItems.quantity}), 0)::text`, total: sql<string>`coalesce(sum(${orderItems.lineTotalRupiah}), 0)::text` }).from(orderItems).where(eq(orderItems.orderId, orderId));
    return operation({ actor, order, payment, purchase: purchase!,
      confirm: async (reference) => (await tx.insert(orderPayments).values({ orderId, confirmedBy: userId, reference }).returning())[0],
      refund: async () => (await tx.update(orderPayments).set({ status: "REFUNDED", refundedBy: userId, refundedAt: new Date() }).where(eq(orderPayments.orderId, orderId)).returning())[0],
      cancel: async () => {
        await tx.insert(orderCancellations).values({ orderId, cancelledBy: userId });
        return (await tx.update(orders).set({ status: "CANCELLED", updatedAt: new Date() }).where(eq(orders.id, orderId)).returning())[0];
      },
    });
  });
}
