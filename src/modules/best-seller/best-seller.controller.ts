import type { RequestHandler } from "express";
import { z } from "zod";
import { listSchema } from "../restaurants/restaurant.schema.js";
import { bestSellerRestaurants } from "./best-seller.service.js";
export const bestSellerHandler: RequestHandler = async (req, res) => {
  try {
    const data = await bestSellerRestaurants(listSchema.parse(req.query));
    res.json({ success: true, message: "Catalog request successful", data });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ success: false, message: "Invalid request" }); return; }
    throw error;
  }
};
