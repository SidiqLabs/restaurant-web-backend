import { and, eq, inArray, asc, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { orders, restaurants, users } from "../../db/schema.js";
import { orderStaff, restaurantStaff } from "../../db/staff-schema.js";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function withStaffScope<T>(actorId: string, staffId: string | undefined,
  scope: { orderId: string } | { restaurantId: number }, readOnly: boolean,
  operation: (context: Awaited<ReturnType<typeof contextFor>>) => Promise<T> | T) {
  return db.transaction(async tx => operation(await contextFor(tx, actorId, staffId, scope, readOnly)));
}
async function contextFor(tx: Transaction, actorId: string, staffId: string | undefined,
  scope: { orderId: string } | { restaurantId: number }, readOnly: boolean) {
  // Stable user lock order avoids actor/target inversion. All membership and
  // assignment operations serialize on the restaurant; revocation is live.
  const people = await tx.select({ id: users.id, role: users.role }).from(users)
    .where(inArray(users.id, [...new Set([actorId, ...(staffId ? [staffId] : [])])])).orderBy(asc(users.id)).for("share");
  const actor = people.find(p => p.id === actorId), staff = people.find(p => p.id === staffId);
  const [order] = "orderId" in scope ? await tx.select({ id: orders.id, restaurantId: orders.restaurantId, status: orders.status })
    .from(orders).where(eq(orders.id, scope.orderId)).for(readOnly ? "share" : "update") : [];
  const restaurantId = "restaurantId" in scope ? scope.restaurantId : order?.restaurantId;
  const [restaurant] = restaurantId === undefined ? [] : await tx.select({ id: restaurants.id, ownerId: restaurants.ownerId })
    .from(restaurants).where(eq(restaurants.id, restaurantId)).for(readOnly ? "share" : "update");
  const [assignment] = order ? await tx.select().from(orderStaff).where(eq(orderStaff.orderId, order.id)) : [];
  const memberId = staffId ?? actorId;
  const [membership] = restaurant ? await tx.select().from(restaurantStaff)
    .where(and(eq(restaurantStaff.restaurantId, restaurant.id), eq(restaurantStaff.staffId, memberId))) : [];
  return { actor, staff, order, restaurant, assignment, membership,
    saveMembership: async (status: "active" | "revoked") => (await tx.insert(restaurantStaff)
      .values({ restaurantId: restaurant!.id, staffId: staffId!, status })
      .onConflictDoUpdate({ target: [restaurantStaff.restaurantId, restaurantStaff.staffId], set: { status, updatedAt: sql`clock_timestamp()` } }).returning())[0]!,
    saveAssignment: async () => (await tx.insert(orderStaff).values({ orderId: order!.id, restaurantId: restaurant!.id, staffId: staffId! })
      .onConflictDoUpdate({ target: orderStaff.orderId, set: { staffId: staffId!, updatedAt: sql`clock_timestamp()` } }).returning())[0]!,
  };
}
