import { z } from "zod";
export const orderIdSchema = z.uuid();
export const confirmationSchema = z.strictObject({
  reference: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._:-]+$/),
});
export const emptySchema = z.strictObject({});
