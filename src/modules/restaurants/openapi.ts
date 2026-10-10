const integerId = { type: "integer", minimum: 1, maximum: 2147483647 };
const restaurantProperties = {
  name: { type: "string", minLength: 1, maxLength: 100 },
  description: { type: "string", maxLength: 2000, default: "" },
  address: { type: "string", minLength: 1, maxLength: 500 },
};
const menuProperties = {
  name: restaurantProperties.name,
  description: restaurantProperties.description,
  price: { type: "integer", minimum: 0, maximum: 2147483647, description: "Integer Indonesian rupiah" },
  available: { type: "boolean", default: true },
};
export const catalogSchemas = {
  Restaurant: { type: "object", properties: { ...restaurantProperties, id: integerId, ownerId: { type: "string", format: "uuid" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } } },
  Menu: { type: "object", properties: { ...menuProperties, id: integerId, restaurantId: integerId, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } } },
};
function operation(resource: "Restaurant" | "Menu", method: "get" | "post" | "patch", list = false, parameters: unknown[] = []) {
  const writes = method !== "get";
  return {
    tags: ["Restaurant and Menu"],
    summary: `${method === "get" ? "Read" : method === "post" ? "Create" : "Update"} ${resource}${list ? " list" : ""}`,
    description: writes ? "Requires ADMIN or RESTAURANT_OWNER. Owners can update only their restaurants and menus. Creation derives ownerId from the authenticated user. Ownership is immutable." : "Public read. No recommendations, rankings, reviews or calculated distances are provided.",
    security: writes ? [{ bearerAuth: [] }] : [],
    parameters: [...parameters, ...(list ? [
      { name: "page", in: "query", schema: { type: "integer", minimum: 1, maximum: 10000, default: 1 } },
      { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
    ] : [])],
    ...(writes ? { requestBody: { required: true, content: { "application/json": { schema: { type: "object", additionalProperties: false, ...(method === "post" ? { required: resource === "Restaurant" ? ["name", "address"] : ["name", "price"] } : { minProperties: 1 }), properties: resource === "Restaurant" ? restaurantProperties : menuProperties } } } } } : {}),
    responses: {
      [method === "post" ? "201" : "200"]: { description: "Success", content: { "application/json": { schema: { type: "object", required: ["success", "message", "data"], properties: { success: { type: "boolean", enum: [true] }, message: { type: "string" }, data: list ? { type: "array", items: { $ref: `#/components/schemas/${resource}` } } : { $ref: `#/components/schemas/${resource}` } } } } } },
      ...Object.fromEntries((writes ? [400, 401, 403, 404] : [400, 404]).map((status) => [status, { description: ({ 400: "Invalid request", 401: "Authentication required", 403: "Permission denied", 404: "Resource not found" } as Record<number, string>)[status], content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }])),
    },
  };
}
const restaurantId = { name: "restaurantId", in: "path", required: true, schema: integerId };
const menuId = { name: "menuId", in: "path", required: true, schema: integerId };
export const catalogPaths = {
  "/api/resto": { get: operation("Restaurant", "get", true), post: operation("Restaurant", "post") },
  "/api/resto/{restaurantId}": { get: operation("Restaurant", "get", false, [restaurantId]), patch: operation("Restaurant", "patch", false, [restaurantId]) },
  "/api/resto/{restaurantId}/menu": { get: operation("Menu", "get", true, [restaurantId]), post: operation("Menu", "post", false, [restaurantId]) },
  "/api/resto/{restaurantId}/menu/{menuId}": { get: operation("Menu", "get", false, [restaurantId, menuId]), patch: operation("Menu", "patch", false, [restaurantId, menuId]) },
};
