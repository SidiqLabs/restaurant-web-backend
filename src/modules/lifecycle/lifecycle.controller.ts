import type { RequestHandler } from "express";
import { z } from "zod";
import { logger } from "../../lib/logger.js";
import { emptySchema, orderIdSchema, transitionSchema } from "./lifecycle.schema.js";
import { LifecycleError, transitionOrder } from "./lifecycle.service.js";

export const transitionHandler: RequestHandler = async (req, res) => {
  try {
    emptySchema.parse(req.query);
    const data = await transitionOrder(res.locals.authUserId, orderIdSchema.parse(req.params.orderId), transitionSchema.parse(req.body));
    res.json({ success: true, data });
  } catch (error) {
    if (error instanceof LifecycleError || error instanceof z.ZodError) {
      res.status(error instanceof LifecycleError ? error.status : 400).json({ success: false, message: error instanceof LifecycleError ? error.message : "Invalid request" }); return;
    }
    const requestId = typeof res.locals.requestId === "string" ? res.locals.requestId : undefined;
    logger.error({ requestId, operation: "order-status-transition" }, "Order status transition failed");
    res.status(500).json({ success: false, message: "Internal server error", ...(requestId ? { requestId } : {}) });
  }
};
