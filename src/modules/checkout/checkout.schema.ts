import { z } from "zod";

const id = z.number().int().min(1).max(2147483647);
const items = z.array(z.strictObject({ menuId: id, quantity: z.number().int().min(1).max(99) })).min(1).max(50)
  .refine((rows) => new Set(rows.map((row) => row.menuId)).size === rows.length);
export const checkoutSchema = z.strictObject({
  restaurants: z.array(z.strictObject({ restaurantId: id, items })).length(1),
  deliveryAddress: z.string().trim().min(10).max(500),
  phone: z.string().trim().regex(/^[+0-9() -]{8,30}$/).regex(/[0-9]/),
  paymentMethod: z.enum(["BNI Bank Negara Indonesia", "BRI Bank Rakyat Indonesia", "BCA Bank Central Asia", "Mandiri"]),
  notes: z.string().trim().max(1000).default(""),
});
export const keySchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);
const page = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(10000));
export const listSchema = z.strictObject({
  status: z.enum(["all", "pending", "preparing", "on_the_way", "delivered", "done", "canceled"]).default("done"),
  page: page.default(1),
  limit: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(100)).default(10),
});
export const emptySchema = z.strictObject({});
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type ListInput = z.infer<typeof listSchema>;
