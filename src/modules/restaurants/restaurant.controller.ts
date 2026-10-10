import type { RequestHandler } from "express";
import { z } from "zod";
import * as schema from "./restaurant.schema.js";
import * as service from "./restaurant.service.js";

type Operation = "list" | "recommended" | "search" | "get" | "create" | "update" | "menus" | "menu" | "createMenu" | "updateMenu";
export function catalogHandler(operation: Operation): RequestHandler {
  return async (req, res) => {
    try {
      const userId: unknown = res.locals.authUserId;
      const id = ["list", "recommended", "search", "create"].includes(operation) ? 0 : schema.idSchema.parse(req.params.restaurantId);
      const menuId = ["menu", "updateMenu"].includes(operation) ? schema.idSchema.parse(req.params.menuId) : 0;
      let data: unknown;
      switch (operation) {
        case "recommended": schema.recommendedSchema.parse(req.query); data = await service.recommendedRestaurants(); break;
        case "search": data = await service.searchRestaurants(schema.searchSchema.parse(req.query)); break;
        case "list": data = await service.listRestaurants(schema.listSchema.parse(req.query)); break;
        case "get": data = await service.getRestaurant(id); break;
        case "create": data = await service.createRestaurant(userId, schema.restaurantSchema.parse(req.body)); break;
        case "update": data = await service.editRestaurant(userId, id, schema.restaurantUpdateSchema.parse(req.body)); break;
        case "menus": data = await service.listMenus(id, schema.listSchema.parse(req.query)); break;
        case "menu": data = await service.getMenu(id, menuId); break;
        case "createMenu": data = await service.createMenu(userId, id, schema.menuSchema.parse(req.body)); break;
        case "updateMenu": data = await service.editMenu(userId, id, menuId, schema.menuUpdateSchema.parse(req.body)); break;
      }
      res.status(operation === "create" || operation === "createMenu" ? 201 : 200).json({ success: true, message: "Catalog request successful", data });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof service.CatalogError) {
        res.status(error instanceof service.CatalogError ? error.status : 400).json({ success: false, message: error instanceof service.CatalogError ? error.message : "Invalid request" });
        return;
      }
      throw error;
    }
  };
}
