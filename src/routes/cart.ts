import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { cartHandler } from "../modules/cart/cart.controller.js";

export const cartRouter = Router();
cartRouter.use(authenticate);
cartRouter.get("/", cartHandler("get"));
cartRouter.post("/", cartHandler("add"));
cartRouter.put("/:id", cartHandler("update"));
cartRouter.delete("/:id", cartHandler("remove"));
cartRouter.delete("/", cartHandler("clear"));
