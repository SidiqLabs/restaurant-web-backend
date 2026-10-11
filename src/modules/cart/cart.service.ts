import { withCustomerCart, type CartRow } from "./cart.repository.js";
import { MAX_CART_LINES, MAX_QUANTITY, type AddInput } from "./cart.schema.js";

export class CartError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

function presentItem(row: CartRow) {
  const itemTotal = BigInt(row.menu.price) * BigInt(row.quantity);
  // Catalog prices are int32, quantity <=99, lines <=50: all cart sums fit the
  // JSON safe-integer range, including prices too large for a future order.
  if (itemTotal < 0n || itemTotal > BigInt(Number.MAX_SAFE_INTEGER)) throw new CartError(409, "Cart price is out of range");
  return {
    id: row.id, quantity: row.quantity, itemTotal: Number(itemTotal),
    menu: { id: row.menu.id, foodName: row.menu.name, price: row.menu.price, available: row.menu.available, image: "", type: "" },
  };
}

function presentCart(rows: CartRow[]) {
  const items = rows.map(presentItem);
  const totalPrice = items.reduce((sum, item) => sum + BigInt(item.itemTotal), 0n);
  if (totalPrice > BigInt(Number.MAX_SAFE_INTEGER)) throw new CartError(409, "Cart price is out of range");
  const restaurant = rows[0]?.restaurant;
  return {
    cart: restaurant ? [{ restaurant: { ...restaurant, logo: "" }, items, subtotal: Number(totalPrice) }] : [],
    summary: { totalItems: rows.reduce((sum, row) => sum + row.quantity, 0), totalPrice: Number(totalPrice), restaurantCount: restaurant ? 1 : 0 },
  };
}

export type CartAction = "get" | "add" | "update" | "remove" | "clear";
export async function operateCart(userId: unknown, action: CartAction, input?: AddInput | { quantity: number }, itemId?: number) {
  if (typeof userId !== "string") throw new CartError(401, "Authentication required");
  return withCustomerCart(userId, async (cart) => {
    if (!cart.actor) throw new CartError(401, "Authentication required");
    if (cart.actor.role !== "CUSTOMER") throw new CartError(403, "Customer account required");
    if (action === "clear") { await cart.clear(); return {}; }
    const rows = await cart.items();
    if (action === "get") return presentCart(rows);
    if (action === "remove" || action === "update") {
      const item = rows.find((row) => row.id === itemId);
      // Unknown and other-customer IDs deliberately have the same response.
      if (!item) throw new CartError(404, "Cart item not found");
      if (action === "remove") {
        await cart.remove(item.id);
        if (rows.length === 1) await cart.clear();
        return {};
      }
      if (!item.menu.available) throw new CartError(409, "Menu is unavailable");
      await cart.update(item.id, input!.quantity);
      return { cartItem: { ...presentItem({ ...item, quantity: input!.quantity }), restaurant: { ...item.restaurant, logo: "" } } };
    }
    const addition = input as AddInput;
    const menu = await cart.menu(addition.restaurantId, addition.menuId);
    if (!menu) throw new CartError(404, "Menu not found");
    if (!menu.available) throw new CartError(409, "Menu is unavailable");
    if (rows.some((row) => row.restaurantId !== menu.restaurantId)) throw new CartError(409, "Clear the cart before adding another restaurant");
    const duplicate = rows.find((row) => row.menuId === menu.id);
    const quantity = addition.quantity + (duplicate?.quantity ?? 0);
    if (quantity > MAX_QUANTITY) throw new CartError(409, "Cart quantity limit exceeded");
    let id: number;
    if (duplicate) { id = duplicate.id; await cart.update(id, quantity); }
    else {
      if (rows.length >= MAX_CART_LINES) throw new CartError(409, "Cart item limit exceeded");
      const slot = Array.from({ length: MAX_CART_LINES }, (_, i) => i + 1).find((value) => !rows.some((row) => row.slot === value))!;
      await cart.attachRestaurant(menu.restaurantId);
      id = await cart.insert(menu.restaurantId, menu.id, quantity, slot);
    }
    const current = (await cart.items()).find((row) => row.id === id)!;
    return { cartItem: { ...presentItem(current), restaurant: { ...current.restaurant, logo: "" } } };
  });
}
