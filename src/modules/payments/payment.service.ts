import { withLockedOrder } from "./payment.repository.js";
export class PaymentError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
export async function changePayment(userId: unknown, orderId: string, action: "confirm" | "refund" | "cancel", reference?: string) {
  if (typeof userId !== "string") throw new PaymentError(401, "Authentication required");
  try {
    return await withLockedOrder(userId, orderId, async ({ actor, order, payment, purchase, confirm, refund, cancel }) => {
      if (!actor) throw new PaymentError(401, "Authentication required");
      if (actor.role !== "ADMIN") throw new PaymentError(403, "Permission denied");
      if (!order) throw new PaymentError(404, "Order not found");
      if (action === "confirm") {
        if (payment || order.status === "CANCELLED") throw new PaymentError(409, "Payment confirmation is not allowed");
        if (!reference || BigInt(purchase.quantity) <= 0n || order.totalRupiah <= 0 || BigInt(purchase.total) !== BigInt(order.totalRupiah)) throw new PaymentError(409, "Order purchase facts are not eligible for payment");
        return confirm(reference);
      }
      if (action === "refund") {
        if (payment?.status !== "PAID") throw new PaymentError(409, "Refund is not allowed");
        return refund();
      }
      if (order.status === "CANCELLED" || order.status === "COMPLETED") throw new PaymentError(409, "Cancellation is not allowed");
      return cancel();
    });
  } catch (error) {
    // Drizzle wraps driver errors. Unique order/reference collisions are conflicts.
    const cause = error instanceof Error ? error.cause : undefined;
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "23505") throw new PaymentError(409, "Payment confirmation already exists");
    throw error;
  }
}
