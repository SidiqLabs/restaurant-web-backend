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
const searchOperation = operation("Restaurant", "get", true, [
  { name: "q", in: "query", required: true, schema: { type: "string", minLength: 1, maxLength: 200 }, description: "Trimmed literal case-insensitive substring of name or description. Missing or blank input returns 400. %, _ and backslash are literal." },
]);
const searchResponse = {
  type: "object", required: ["success", "message", "data"],
  properties: {
    success: { type: "boolean", enum: [true] }, message: { type: "string" },
    data: {
      type: "object", required: ["restaurants", "pagination", "searchQuery"],
      properties: {
        restaurants: { type: "array", items: { $ref: "#/components/schemas/Restaurant" } },
        searchQuery: { type: "string" },
        pagination: { type: "object", required: ["page", "limit", "total", "totalPages"], properties: {
          page: { type: "integer", minimum: 1, maximum: 10000 },
          limit: { type: "integer", minimum: 1, maximum: 100 },
          total: { type: "integer", minimum: 0 }, totalPages: { type: "integer", minimum: 0 },
        } },
      },
    },
  },
};
const restaurantId = { name: "restaurantId", in: "path", required: true, schema: integerId };
const menuId = { name: "menuId", in: "path", required: true, schema: integerId };
export const catalogPaths = {
  "/api/resto/recommended": { get: {
    tags: ["Restaurant and Menu"], summary: "Recommended restaurant catalog suggestions",
    description: "Public non-personalized catalog fallback: at most 20 restaurants ordered by ascending ID. No query parameters accepted. Persisted restaurant fields only; no ratings, ranking scores or distances. Empty catalog returns an empty recommendations array.",
    security: [], parameters: [],
    responses: {
      "200": { description: "Catalog suggestions", content: { "application/json": { schema: {
        type: "object", required: ["success", "message", "data"], properties: {
          success: { type: "boolean", enum: [true] }, message: { type: "string", enum: ["Catalog request successful"] },
          data: { type: "object", required: ["recommendations", "message"], properties: {
            recommendations: { type: "array", maxItems: 20, items: { $ref: "#/components/schemas/Restaurant" } },
            message: { type: "string", enum: ["Catalog suggestions ordered by restaurant ID; not personalized"] },
          } },
        },
      } } } },
      "400": searchOperation.responses["400"],
    },
  } },
  "/api/resto/search": { get: {
    ...searchOperation, summary: "Search restaurants",
    description: "Public literal substring search ordered by ascending restaurant ID. Only q, page and limit are accepted, each once. No matches or a page beyond the results returns an empty restaurants array. Restaurant DTO has persisted fields only; frontend card metadata is not supplied.",
    responses: {
      "200": { description: "Search results", content: { "application/json": { schema: searchResponse } } },
      "400": searchOperation.responses["400"],
    },
  } },
  "/api/resto": { get: operation("Restaurant", "get", true), post: operation("Restaurant", "post") },
  "/api/resto/{restaurantId}": { get: operation("Restaurant", "get", false, [restaurantId]), patch: operation("Restaurant", "patch", false, [restaurantId]) },
  "/api/resto/{restaurantId}/menu": { get: operation("Menu", "get", true, [restaurantId]), post: operation("Menu", "post", false, [restaurantId]) },
  "/api/resto/{restaurantId}/menu/{menuId}": { get: operation("Menu", "get", false, [restaurantId, menuId]), patch: operation("Menu", "patch", false, [restaurantId, menuId]) },
};
