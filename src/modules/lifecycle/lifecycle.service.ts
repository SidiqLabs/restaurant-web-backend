import { withLifecycleOrder } from "./lifecycle.repository.js";
import type { OrderStatus, TransitionInput } from "./lifecycle.schema.js";

// Cancellation remains the existing separately authorized ADMIN operation.
export const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDING: "CONFIRMED", CONFIRMED: "PREPARING", PREPARING: "READY", READY: "COMPLETED",
};
export class LifecycleError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
export async function transitionOrder(actorId: unknown, orderId: string, input: TransitionInput) {
  if (typeof actorId !== "string") throw new LifecycleError(401, "Authentication required");
  return withLifecycleOrder(actorId, orderId, async ({ actor, order, restaurant, payment, transition }) => {
    if (!actor) throw new LifecycleError(401, "Authentication required");
    if (actor.role !== "ADMIN" && actor.role !== "RESTAURANT_OWNER") throw new LifecycleError(403, "Permission denied");
    if (!order || !restaurant || (actor.role !== "ADMIN" && restaurant.ownerId !== actorId)) throw new LifecycleError(404, "Order not found");
    if (nextStatus[input.expectedStatus] !== input.status) throw new LifecycleError(409, "Illegal status transition");
    if (payment?.status !== "PAID") throw new LifecycleError(409, "Settled payment required");
    // Only an exact single-hop retry is idempotent; stale earlier targets never
    // rewind a progressed order. Repeats also recheck role/ownership/payment.
    const repeated = order.status === input.status;
    if (!repeated && order.status !== input.expectedStatus) throw new LifecycleError(409, "Order status has changed");
    const saved = repeated ? order : await transition(input.expectedStatus, input.status);
    if (!saved) throw new LifecycleError(409, "Order status has changed");
    return { order: { id: saved.id, restaurantId: saved.restaurantId, status: saved.status, paymentStatus: "PAID" as const, updatedAt: saved.updatedAt }, repeated };
  });
}
