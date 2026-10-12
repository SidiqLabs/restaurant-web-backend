import type { RequestHandler } from "express";
import { z } from "zod";
import { logger } from "../../lib/logger.js";
import { assignmentSchema, emptySchema, idSchema, membershipSchema, restaurantIdSchema } from "./staff.schema.js";
import { assignStaff, getAssignment, setMembership, StaffError } from "./staff.service.js";

export function staffHandler(operation: "membership" | "assign" | "read"): RequestHandler {
  return async (req, res) => {
    try {
      emptySchema.parse(req.query);
      const actor: unknown = res.locals.authUserId;
      const data = operation === "membership"
        ? await setMembership(actor, restaurantIdSchema.parse(req.params.restaurantId), idSchema.parse(req.params.staffId), membershipSchema.parse(req.body).status)
        : operation === "assign"
          ? await assignStaff(actor, idSchema.parse(req.params.orderId), assignmentSchema.parse(req.body))
          : await getAssignment(actor, idSchema.parse(req.params.orderId));
      res.json({ success: true, data });
    } catch (error) {
      if (error instanceof StaffError || error instanceof z.ZodError) {
        res.status(error instanceof StaffError ? error.status : 400).json({ success: false, message: error instanceof StaffError ? error.message : "Invalid request" }); return;
      }
      const requestId = typeof res.locals.requestId === "string" ? res.locals.requestId : undefined;
      logger.error({ requestId, operation }, "Staff assignment operation failed");
      res.status(500).json({ success: false, message: "Internal server error", ...(requestId ? { requestId } : {}) });
    }
  };
}
