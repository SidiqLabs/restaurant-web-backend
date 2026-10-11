import { z } from "zod";

export const MAX_QUANTITY = 99;
export const MAX_CART_LINES = 50;
const identifier = z.number().int().min(1).max(2147483647);
const quantity = z.number().int().min(1).max(MAX_QUANTITY);
export const addSchema = z.strictObject({ restaurantId: identifier, menuId: identifier, quantity });
export const updateSchema = z.strictObject({ quantity });
export const emptySchema = z.strictObject({});
export const itemIdSchema = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(identifier);
export type AddInput = z.infer<typeof addSchema>;
