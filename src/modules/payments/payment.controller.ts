import type { RequestHandler } from "express";
import { z } from "zod";
import { confirmationSchema, emptySchema, orderIdSchema } from "./payment.schema.js";
import { changePayment, PaymentError } from "./payment.service.js";
export function paymentHandler(action: "confirm" | "refund" | "cancel"): RequestHandler {
  return async (req, res) => {
    try {
      const id = orderIdSchema.parse(req.params.orderId);
      emptySchema.parse(req.query);
      const input = action === "confirm" ? confirmationSchema.parse(req.body) : emptySchema.parse(req.body ?? {});
      const data = await changePayment(res.locals.authUserId, id, action, "reference" in input ? input.reference : undefined);
      res.json({ success: true, message: "Order request successful", data });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof PaymentError) {
        res.status(error instanceof PaymentError ? error.status : 400).json({ success: false, message: error instanceof PaymentError ? error.message : "Invalid request" });
        return;
      }
      throw error;
    }
  };
}
