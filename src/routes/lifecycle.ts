import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { transitionHandler } from "../modules/lifecycle/lifecycle.controller.js";
export const lifecycleRouter = Router();
lifecycleRouter.post("/:orderId/status", authenticate, transitionHandler);
