import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { orderHandler } from "../modules/checkout/checkout.controller.js";

export const ordersRouter = Router();
ordersRouter.use(authenticate);
ordersRouter.post("/checkout", orderHandler("checkout"));
ordersRouter.get("/my-order", orderHandler("list"));
