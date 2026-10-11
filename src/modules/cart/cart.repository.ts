import { and, asc, eq, getTableColumns } from "drizzle-orm";
import { db } from "../../db/client.js";
import { cartItems, carts } from "../../db/cart-schema.js";
import { menus, restaurants, users } from "../../db/schema.js";

export type CartRow = typeof cartItems.$inferSelect & {
  menu: typeof menus.$inferSelect;
  restaurant: { id: number; name: string };
};

export async function withCustomerCart<T>(customerId: string, operation: (context: {
  actor: { id: string; role: typeof users.$inferSelect.role } | undefined;
  items: () => Promise<CartRow[]>;
  menu: (restaurantId: number, menuId: number) => Promise<typeof menus.$inferSelect | undefined>;
  attachRestaurant: (restaurantId: number) => Promise<void>;
  insert: (restaurantId: number, menuId: number, quantity: number, slot: number) => Promise<number>;
  update: (id: number, quantity: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
  clear: () => Promise<void>;
}) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    // An existing customer row provides a stable lock even for empty carts.
    // Every Cart request uses this lock, serializing add/update/delete/clear and
    // preventing role revocation from racing customer-only authorization.
    const [actor] = await tx.select({ id: users.id, role: users.role }).from(users)
      .where(eq(users.id, customerId)).for("update");
    return operation({
      actor,
      items: () => tx.select({ ...getTableColumns(cartItems), menu: getTableColumns(menus), restaurant: { id: restaurants.id, name: restaurants.name } })
        .from(cartItems).innerJoin(menus, eq(menus.id, cartItems.menuId))
        .innerJoin(restaurants, eq(restaurants.id, cartItems.restaurantId))
        .where(eq(cartItems.customerId, customerId)).orderBy(asc(cartItems.id))
        .for("share", { of: [menus, restaurants] }),
      menu: async (restaurantId, menuId) => (await tx.select().from(menus)
        .where(and(eq(menus.id, menuId), eq(menus.restaurantId, restaurantId))).for("share"))[0],
      attachRestaurant: async (restaurantId) => {
        await tx.insert(carts).values({ customerId, restaurantId })
          .onConflictDoUpdate({ target: carts.customerId, set: { restaurantId } });
      },
      insert: async (restaurantId, menuId, quantity, slot) => {
        const [item] = await tx.insert(cartItems).values({ customerId, restaurantId, menuId, quantity, slot }).returning({ id: cartItems.id });
        return item!.id;
      },
      update: async (id, quantity) => {
        await tx.update(cartItems).set({ quantity, updatedAt: new Date() })
          .where(and(eq(cartItems.id, id), eq(cartItems.customerId, customerId)));
      },
      remove: async (id) => { await tx.delete(cartItems).where(and(eq(cartItems.id, id), eq(cartItems.customerId, customerId))); },
      clear: async () => { await tx.delete(carts).where(eq(carts.customerId, customerId)); },
    });
  });
}
