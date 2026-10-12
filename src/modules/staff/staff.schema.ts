import { z } from "zod";
import { idSchema as catalogIdSchema } from "../restaurants/restaurant.schema.js";

export const restaurantIdSchema = catalogIdSchema;
export const idSchema = z.uuid();
export const emptySchema = z.strictObject({});
export const membershipSchema = z.strictObject({ status: z.enum(["active", "revoked"]) });
export const assignmentSchema = z.strictObject({ staffId: idSchema, expectedStaffId: idSchema.nullable() });
export type AssignmentInput = z.infer<typeof assignmentSchema>;
