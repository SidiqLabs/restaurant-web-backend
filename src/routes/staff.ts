import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { staffHandler } from "../modules/staff/staff.controller.js";

export const staffRouter = Router();
staffRouter.use(authenticate);
staffRouter.put("/resto/:restaurantId/staff/:staffId", staffHandler("membership"));
staffRouter.put("/order/:orderId/staff", staffHandler("assign"));
staffRouter.get("/order/:orderId/staff", staffHandler("read"));
