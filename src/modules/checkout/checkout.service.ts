import { createHash } from "node:crypto";
import { withCustomerCheckout, type Purchase } from "./checkout.repository.js";
import type { CheckoutInput, ListInput } from "./checkout.schema.js";
import type { orders } from "../../db/schema.js";

export class CheckoutError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
function assertCustomer(actor: { role: string } | undefined) {
  if (!actor) throw new CheckoutError(401, "Authentication required");
  if (actor.role !== "CUSTOMER") throw new CheckoutError(403, "Customer account required");
}
function identity(userId: unknown): string {
  if (typeof userId !== "string") throw new CheckoutError(401, "Authentication required");
  return userId;
}
const statuses: Record<ListInput["status"], (typeof orders.$inferSelect.status)[]> = {
  all: ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"],
  pending: ["PENDING"], preparing: ["CONFIRMED", "PREPARING", "READY"], done: ["COMPLETED"], canceled: ["CANCELLED"], on_the_way: [], delivered: [],
};
function displayStatus(status: typeof orders.$inferSelect.status) {
  return status === "PENDING" ? "pending" : status === "COMPLETED" ? "done" : status === "CANCELLED" ? "canceled" : "preparing";
}
function present(purchase: Purchase, replay = false) {
  const { placement, order } = purchase;
  return {
    id: placement.id, transactionId: order.id, paymentMethod: placement.paymentMethod,
    status: replay ? "pending" : displayStatus(order.status), paymentStatus: replay ? "UNPAID" : purchase.paymentStatus,
    deliveryAddress: placement.deliveryAddress, phone: placement.phone, notes: placement.notes,
    pricing: { subtotal: order.totalRupiah, serviceFee: 0, deliveryFee: 0, totalPrice: order.totalRupiah },
    restaurants: [{ restaurant: { id: order.restaurantId, name: placement.restaurantName, logo: "" },
      items: [...purchase.items].sort((a, b) => a.menuId - b.menuId).map((item) => ({ menuId: item.menuId, menuName: item.menuName,
        price: item.unitPriceRupiah, image: "", quantity: item.quantity, itemTotal: item.lineTotalRupiah })), subtotal: order.totalRupiah }],
    createdAt: placement.createdAt.toISOString(), updatedAt: (replay ? order.createdAt : order.updatedAt).toISOString(),
  };
}

export async function checkout(userId: unknown, key: string, input: CheckoutInput) {
  const selection = input.restaurants[0]!;
  const selected = [...selection.items].sort((a, b) => a.menuId - b.menuId);
  const requestHash = createHash("sha256").update(JSON.stringify({ ...input, restaurants: [{ restaurantId: selection.restaurantId, items: selected }] })).digest("hex");
  return withCustomerCheckout(identity(userId), async (context) => {
    assertCustomer(context.actor);
    const previous = await context.previous(key);
    if (previous) {
      if (previous.placement.requestHash !== requestHash) throw new CheckoutError(409, "Idempotency key already used for another request");
      return present(previous, true);
    }
    const cart = await context.cart();
    if (!cart.length) throw new CheckoutError(409, "Cart is empty");
    const items = selected.map((requested) => {
      const row = cart.find((candidate) => candidate.menu.id === requested.menuId);
      if (!row || row.restaurant.id !== selection.restaurantId || row.quantity !== requested.quantity)
        throw new CheckoutError(409, "Cart selection changed; refresh the cart");
      if (!row.menu.available) throw new CheckoutError(409, "Menu is unavailable");
      return { row, line: BigInt(row.menu.price) * BigInt(row.quantity) };
    });
    if (cart.some((row) => row.restaurant.id !== selection.restaurantId)) throw new CheckoutError(409, "Only one restaurant is supported");
    const total = items.reduce((sum, item) => sum + item.line, 0n);
    if (total < 0n || total > 2147483647n) throw new CheckoutError(409, "Order total exceeds supported rupiah range");
    const purchase = await context.create({ restaurantId: selection.restaurantId, total: Number(total),
      placement: { idempotencyKey: key, requestHash, restaurantName: items[0]!.row.restaurant.name,
        deliveryAddress: input.deliveryAddress, phone: input.phone, paymentMethod: input.paymentMethod, notes: input.notes, itemCount: items.length },
      items: items.map(({ row, line }) => ({ menuId: row.menu.id, menuName: row.menu.name, unitPriceRupiah: row.menu.price, quantity: row.quantity, lineTotalRupiah: Number(line) })),
      cartIds: items.map(({ row }) => row.id),
    });
    return present(purchase);
  });
}
export async function myOrders(userId: unknown, query: ListInput) {
  return withCustomerCheckout(identity(userId), async (context) => {
    assertCustomer(context.actor);
    const result = await context.list(query, statuses[query.status]);
    return { orders: result.purchases.map((purchase) => present(purchase)),
      pagination: { page: query.page, limit: query.limit, total: result.total, totalPages: Math.ceil(result.total / query.limit) }, filter: { status: query.status } };
  });
}
