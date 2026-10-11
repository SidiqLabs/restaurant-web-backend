import type { RequestHandler } from "express";
import { z } from "zod";
import { logger } from "../../lib/logger.js";
import { createSchema, updateSchema, idSchema, listSchema, emptySchema } from "./review.schema.js";
import { mutateReview, readReviews, ReviewError } from "./review.service.js";
export function reviewHandler(action: "create" | "update" | "delete" | "my" | "public"): RequestHandler {
  return async (req, res) => {
    try {
      if (action === "my" || action === "public") {
        emptySchema.parse(req.body ?? {});
        const data = await readReviews(res.locals.authUserId, action === "public" ? idSchema.parse(req.params.restaurantId) : undefined, listSchema.parse(req.query));
        res.json({ success: true, data }); return;
      }
      emptySchema.parse(req.query);
      const id = action === "create" ? undefined : idSchema.parse(req.params.id);
      const input = action === "create" ? createSchema.parse(req.body) : action === "update" ? updateSchema.parse(req.body) : undefined;
      if (action === "delete") emptySchema.parse(req.body ?? {});
      const data = await mutateReview(res.locals.authUserId, action, input, id);
      res.status(action === "create" ? 201 : 200).json({ success: true, ...(action !== "update" ? { message: action === "delete" ? "Review deleted" : "Review created" } : {}), ...(data ? { data } : {}) });
    } catch (error) {
      if (error instanceof ReviewError || error instanceof z.ZodError) { res.status(error instanceof ReviewError ? error.status : 400).json({ success: false, message: error instanceof ReviewError ? error.message : "Invalid request" }); return; }
      const requestId = typeof res.locals.requestId === "string" ? res.locals.requestId : undefined;
      logger.error({ requestId, operation: action }, "Review operation failed");
      res.status(500).json({ success: false, message: "Internal server error", ...(requestId ? { requestId } : {}) });
    }
  };
}
