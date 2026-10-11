import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { carts, cartItems } from "../../db/cart-schema.js";
import { orderCheckouts } from "../../db/checkout-schema.js";
import { users, menus, restaurants, orders, orderItems, orderPayments } from "../../db/schema.js";
import type { ListInput } from "./checkout.schema.js";

export type Placement = typeof orderCheckouts.$inferSelect;
export type Purchase = { placement: Placement; order: typeof orders.$inferSelect; items: (typeof orderItems.$inferSelect)[]; paymentStatus: string };

export async function withCustomerCheckout<T>(customerId: string, operation: (context: {
  actor: { id: string; role: string } | undefined;
  previous: (key: string) => Promise<Purchase | undefined>;
  cart: () => Promise<{ id: number; quantity: number; menu: typeof menus.$inferSelect; restaurant: { id: number; name: string } }[]>;
  create: (input: {
    restaurantId: number; total: number; placement: Omit<typeof orderCheckouts.$inferInsert, "id" | "orderId" | "customerId" | "createdAt">;
    items: { menuId: number; menuName: string; unitPriceRupiah: number; quantity: number; lineTotalRupiah: number }[]; cartIds: number[];
  }) => Promise<Purchase>;
  list: (query: ListInput, statuses: (typeof orders.$inferSelect.status)[]) => Promise<{ purchases: Purchase[]; total: number }>;
}) => Promise<T>) {
  return db.transaction(async (tx) => {
    // Same lock as Cart: serialization spans empty-cart requests, mutations,
    // retries and role revocation. All checkout writes share this transaction.
    const [actor] = await tx.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, customerId)).for("update");
    const purchases = async (records: { placement: Placement; order: typeof orders.$inferSelect; paymentStatus: string | null }[]) => {
      if (!records.length) return [];
      const items = await tx.select().from(orderItems).where(inArray(orderItems.orderId, records.map((record) => record.order.id))).orderBy(orderItems.menuId);
      return records.map((record) => ({ ...record, paymentStatus: record.paymentStatus ?? "UNPAID", items: items.filter((item) => item.orderId === record.order.id) }));
    };
    const purchaseSelect = { placement: orderCheckouts, order: orders, paymentStatus: orderPayments.status };
    return operation({ actor,
      previous: async (key) => (await purchases(await tx.select(purchaseSelect).from(orderCheckouts)
        .innerJoin(orders, eq(orders.id, orderCheckouts.orderId)).leftJoin(orderPayments, eq(orderPayments.orderId, orders.id))
        .where(and(eq(orderCheckouts.customerId, customerId), eq(orderCheckouts.idempotencyKey, key)))))[0],
      cart: async () => tx.select({ id: cartItems.id, quantity: cartItems.quantity, menu: menus, restaurant: { id: restaurants.id, name: restaurants.name } })
        .from(cartItems).innerJoin(menus, eq(menus.id, cartItems.menuId)).innerJoin(restaurants, eq(restaurants.id, cartItems.restaurantId))
        .where(eq(cartItems.customerId, customerId)).orderBy(cartItems.menuId).for("share", { of: [menus, restaurants] }),
      create: async (input) => {
        const [order] = await tx.insert(orders).values({ customerId, restaurantId: input.restaurantId, totalRupiah: input.total }).returning();
        const items = await tx.insert(orderItems).values(input.items.map((item) => ({ ...item, orderId: order!.id, restaurantId: input.restaurantId }))).returning();
        const [placement] = await tx.insert(orderCheckouts).values({ ...input.placement, orderId: order!.id, customerId }).returning();
        await tx.delete(cartItems).where(and(eq(cartItems.customerId, customerId), inArray(cartItems.id, input.cartIds)));
        const remaining = await tx.select({ id: cartItems.id }).from(cartItems).where(eq(cartItems.customerId, customerId)).limit(1);
        if (!remaining.length) await tx.delete(carts).where(eq(carts.customerId, customerId));
        return { order: order!, placement: placement!, items, paymentStatus: "UNPAID" };
      },
      list: async (query, statuses) => {
        if (!statuses.length) return { purchases: [], total: 0 };
        const where = and(eq(orderCheckouts.customerId, customerId), inArray(orders.status, statuses));
        // One statement obtains page and count from one MVCC snapshot, even when
        // fulfillment updates run concurrently. A missing page retains count.
        const count = tx.select({ total: sql<number>`count(*)::int`.as("total") }).from(orderCheckouts).innerJoin(orders, eq(orders.id, orderCheckouts.orderId)).where(where).as("counts");
        const page = tx.select({ checkoutId: orderCheckouts.id }).from(orderCheckouts).innerJoin(orders, eq(orders.id, orderCheckouts.orderId)).where(where)
          .orderBy(desc(orderCheckouts.createdAt), desc(orderCheckouts.id)).limit(query.limit).offset((query.page - 1) * query.limit).as("page");
        const rows = await tx.select({ ...purchaseSelect, total: count.total }).from(count).leftJoin(page, sql`true`)
          .leftJoin(orderCheckouts, eq(orderCheckouts.id, page.checkoutId)).leftJoin(orders, eq(orders.id, orderCheckouts.orderId))
          .leftJoin(orderPayments, eq(orderPayments.orderId, orders.id)).orderBy(desc(orderCheckouts.createdAt), desc(orderCheckouts.id));
        const records = rows.flatMap((row) => row.placement && row.order ? [{ placement: row.placement, order: row.order, paymentStatus: row.paymentStatus }] : []);
        return { purchases: await purchases(records), total: rows[0]?.total ?? 0 };
      },
    });
  });
}
