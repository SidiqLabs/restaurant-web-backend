import { z } from "zod";
import { orderStatus } from "../../db/schema.js";

export const orderIdSchema = z.uuid();
export const transitionSchema = z.strictObject({
  expectedStatus: z.enum(orderStatus.enumValues),
  status: z.enum(orderStatus.enumValues),
});
export const emptySchema = z.strictObject({});
export type TransitionInput = z.infer<typeof transitionSchema>;
export type OrderStatus = TransitionInput["status"];
