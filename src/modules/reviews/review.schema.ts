import { z } from "zod";
const id = z.number().int().min(1).max(2147483647);
const content = { star: z.number().int().min(1).max(5), comment: z.string().trim().min(1).max(2000) };
export const createSchema = z.strictObject({ ...content, transactionId: z.uuid(), restaurantId: id,
  menuIds: z.array(id).min(1).max(50).refine((ids) => new Set(ids).size === ids.length) });
export const updateSchema = z.strictObject(content);
export const idSchema = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(id);
const page = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(10000));
export const listSchema = z.strictObject({ page: page.default(1), limit: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(100)).default(10) });
export const emptySchema = z.strictObject({});
export type CreateInput = z.infer<typeof createSchema>;
export type UpdateInput = z.infer<typeof updateSchema>;
export type Pagination = z.infer<typeof listSchema>;
