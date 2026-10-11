import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { paymentHandler } from "../modules/payments/payment.controller.js";
export const paymentsRouter = Router();
paymentsRouter.post("/:orderId/payment/confirm", authenticate, paymentHandler("confirm"));
paymentsRouter.post("/:orderId/payment/refund", authenticate, paymentHandler("refund"));
paymentsRouter.post("/:orderId/cancel", authenticate, paymentHandler("cancel"));
