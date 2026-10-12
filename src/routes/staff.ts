import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { staffHandler } from "../modules/staff/staff.controller.js";

export const staffRouter = Router();
staffRouter.put("/resto/:restaurantId/staff/:staffId", authenticate, staffHandler("membership"));
staffRouter.put("/order/:orderId/staff", authenticate, staffHandler("assign"));
staffRouter.get("/order/:orderId/staff", authenticate, staffHandler("read"));
