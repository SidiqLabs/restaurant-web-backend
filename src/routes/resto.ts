import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { catalogHandler } from "../modules/restaurants/restaurant.controller.js";

export const restoRouter = Router();
restoRouter.get("/", catalogHandler("list"));
restoRouter.post("/", authenticate, catalogHandler("create"));
restoRouter.get("/recommended", catalogHandler("recommended"));
restoRouter.get("/search", catalogHandler("search"));
restoRouter.get("/:restaurantId", catalogHandler("get"));
restoRouter.patch("/:restaurantId", authenticate, catalogHandler("update"));
restoRouter.get("/:restaurantId/menu", catalogHandler("menus"));
restoRouter.post("/:restaurantId/menu", authenticate, catalogHandler("createMenu"));
restoRouter.get("/:restaurantId/menu/:menuId", catalogHandler("menu"));
restoRouter.patch("/:restaurantId/menu/:menuId", authenticate, catalogHandler("updateMenu"));
