import type { RequestHandler } from "express";
import { z } from "zod";
import { addSchema, emptySchema, itemIdSchema, updateSchema } from "./cart.schema.js";
import { CartError, operateCart, type CartAction } from "./cart.service.js";

export function cartHandler(action: CartAction): RequestHandler {
  return async (req, res) => {
    try {
      emptySchema.parse(req.query);
      const id = action === "update" || action === "remove" ? itemIdSchema.parse(req.params.id) : undefined;
      const input = action === "add" ? addSchema.parse(req.body) : action === "update" ? updateSchema.parse(req.body) : undefined;
      if (!input) emptySchema.parse(req.body ?? {});
      const data = await operateCart(res.locals.authUserId, action, input, id);
      res.status(action === "add" ? 201 : 200).json({ success: true, message: "Cart request successful", data });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof CartError) {
        res.status(error instanceof CartError ? error.status : 400).json({ success: false, message: error instanceof CartError ? error.message : "Invalid request" });
        return;
      }
      throw error;
    }
  };
}
