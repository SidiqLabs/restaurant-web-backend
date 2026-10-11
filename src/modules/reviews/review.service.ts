import { listReviews, withReviewCustomer, type ReviewRecord } from "./review.repository.js";
import type { CreateInput, Pagination, UpdateInput } from "./review.schema.js";
export class ReviewError extends Error { constructor(public readonly status: number, message: string) { super(message); } }
function identity(id: unknown) { if (typeof id !== "string") throw new ReviewError(401, "Authentication required"); return id; }
export async function mutateReview(userId: unknown, action: "create" | "update" | "delete", input?: CreateInput | UpdateInput, id?: number) {
  const customerId = identity(userId);
  return withReviewCustomer(customerId, async (context) => {
    if (!context.actor) throw new ReviewError(401, "Authentication required");
    if (context.actor.role !== "CUSTOMER") throw new ReviewError(403, "Customer account required");
    if (action === "create") {
      const create = input as CreateInput;
      if (!await context.restaurant(create.restaurantId)) throw new ReviewError(404, "Restaurant not found");
      const order = await context.order(create.transactionId);
      if (!order || order.restaurantId !== create.restaurantId) throw new ReviewError(404, "Eligible order not found");
      if (order.status !== "COMPLETED") throw new ReviewError(409, "Completed order required");
      if (await context.existing(order.id)) throw new ReviewError(409, "Order has already been reviewed");
      const items = await context.items(order.id);
      if (!create.menuIds.every((menuId) => items.some((item) => item.menuId === menuId))) throw new ReviewError(400, "Review menus must belong to the purchased order");
      const review = await context.create({ customerId, restaurantId: order.restaurantId, orderId: order.id, star: create.star, comment: create.comment }, create.menuIds);
      return { review: presentReview(await context.details(review)) };
    }
    const review = await context.owned(id!);
    if (!review) throw new ReviewError(404, "Review not found");
    if (action === "delete") { await context.remove(review.id); return undefined; }
    return { review: presentReview(await context.details(await context.update(review.id, input as UpdateInput))) };
  });
}
export async function readReviews(userId: unknown, restaurantId: number | undefined, query: Pagination) {
  const result = await listReviews(restaurantId ? undefined : identity(userId), restaurantId, query);
  if (restaurantId && !result.restaurantExists) throw new ReviewError(404, "Restaurant not found");
  if (!restaurantId) {
    if (!result.actor) throw new ReviewError(401, "Authentication required");
    if (result.actor.role !== "CUSTOMER") throw new ReviewError(403, "Customer account required");
  }
  return { reviews: result.records.map((record) => presentReview(record, !!restaurantId)),
    pagination: { ...query, total: result.total, totalPages: Math.ceil(result.total / query.limit) },
    ...(restaurantId ? { summary: { reviewCount: result.total, averageRating: result.averageRating } } : {}) };
}
function presentReview(record: ReviewRecord, isPublic = false) {
  const { review, restaurant, items } = record;
  const base = { id: review.id, star: review.star, comment: review.comment, createdAt: review.createdAt.toISOString(), updatedAt: review.updatedAt.toISOString(),
    menus: items.map((item) => ({ menuId: item.menuId, menuName: item.menuName, price: item.unitPriceRupiah, quantity: item.quantity, type: "", image: "" })) };
  return isPublic ? { ...base, user: { name: record.name!, avatar: "" } } : { ...base, transactionId: review.orderId, restaurant: { ...restaurant, logo: "" } };
}
