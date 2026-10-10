import { z } from "zod";

const name = z.string().trim().min(1).max(100);
const description = z.string().trim().max(2000);
export const idSchema = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(2147483647));
export const listSchema = z.strictObject({
  page: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(10000)).default(1),
  limit: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(100)).default(20),
});
export const restaurantSchema = z.strictObject({ name, description: description.default(""), address: z.string().trim().min(1).max(500) });
export const restaurantUpdateSchema = z.strictObject({ name: name.optional(), description: description.optional(), address: z.string().trim().min(1).max(500).optional() }).refine((value) => Object.keys(value).length > 0);
export const menuSchema = z.strictObject({ name, description: description.default(""), price: z.number().int().min(0).max(2147483647), available: z.boolean().default(true) });
export const menuUpdateSchema = z.strictObject({ name: name.optional(), description: description.optional(), price: z.number().int().min(0).max(2147483647).optional(), available: z.boolean().optional() }).refine((value) => Object.keys(value).length > 0);
export type RestaurantInput = z.infer<typeof restaurantSchema>;
export type MenuInput = z.infer<typeof menuSchema>;
export type Pagination = z.infer<typeof listSchema>;

export const searchSchema = listSchema.extend({ q: z.string().trim().min(1).max(200) });
export type RestaurantSearch = z.infer<typeof searchSchema>;
