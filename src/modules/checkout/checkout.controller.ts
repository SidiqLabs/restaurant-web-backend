import type { RequestHandler } from "express";
import { z } from "zod";
import { checkoutSchema, keySchema, listSchema, emptySchema } from "./checkout.schema.js";
import { checkout, CheckoutError, myOrders } from "./checkout.service.js";
import { logger } from "../../lib/logger.js";

export function orderHandler(action: "checkout" | "list"): RequestHandler {
  return async (req, res) => {
    try {
      if (action === "checkout") {
        emptySchema.parse(req.query);
        const transaction = await checkout(res.locals.authUserId, keySchema.parse(req.get("Idempotency-Key")), checkoutSchema.parse(req.body));
        // A replay returns the same status/body as the original placement.
        res.status(201).json({ success: true, message: "Order created; payment remains pending", data: { transaction } });
      } else {
        emptySchema.parse(req.body ?? {});
        const data = await myOrders(res.locals.authUserId, listSchema.parse(req.query));
        res.json({ success: true, data });
      }
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof CheckoutError) {
        res.status(error instanceof CheckoutError ? error.status : 400).json({ success: false, message: error instanceof CheckoutError ? error.message : "Invalid request" });
        return;
      }
      // Drizzle errors can include query parameters (delivery/contact data).
      // Keep these out of logs and development-mode public error details.
      const requestId = typeof res.locals.requestId === "string" ? res.locals.requestId : undefined;
      logger.error({ requestId, operation: action }, "Order operation failed");
      res.status(500).json({ success: false, message: "Internal server error", ...(requestId ? { requestId } : {}) });
    }
  };
}
