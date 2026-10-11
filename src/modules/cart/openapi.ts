const id = { type: "integer", minimum: 1, maximum: 2147483647 };
const money = { type: "integer", minimum: 0, maximum: 10630044052650, description: "Integer rupiah, current catalog pricing" };
const quantity = { type: "integer", minimum: 1, maximum: 99 };
const restaurant = { type: "object", required: ["id", "name", "logo"], properties: { id, name: { type: "string" }, logo: { type: "string", description: "Empty until catalog media exists" } } };
const item = { type: "object", required: ["id", "menu", "quantity", "itemTotal"], properties: {
  id, quantity, itemTotal: money,
  menu: { type: "object", required: ["id", "foodName", "price", "available", "image", "type"], properties: {
    id, foodName: { type: "string" }, price: { ...money, maximum: 2147483647 }, available: { type: "boolean" },
    image: { type: "string", description: "Empty until catalog media exists" }, type: { type: "string", description: "Empty until menu taxonomy exists" },
  } },
} };
const data = { type: "object", required: ["cart", "summary"], properties: {
  cart: { type: "array", maxItems: 1, items: { type: "object", required: ["restaurant", "items", "subtotal"], properties: {
    restaurant, items: { type: "array", minItems: 1, maxItems: 50, items: item }, subtotal: money,
  } } },
  summary: { type: "object", required: ["totalItems", "totalPrice", "restaurantCount"], properties: {
    totalItems: { type: "integer", minimum: 0, maximum: 4950 }, totalPrice: money, restaurantCount: { type: "integer", minimum: 0, maximum: 1 },
  } },
} };
export const cartSchemas = {
  CartData: data,
  CartItemData: { type: "object", required: ["cartItem"], properties: { cartItem: { ...item, required: [...item.required, "restaurant"], properties: { ...item.properties, restaurant } } } },
};
function operation(action: "get" | "add" | "update" | "remove" | "clear") {
  const write = action === "add" || action === "update";
  return {
    tags: ["Cart"], summary: `${action} authenticated customer cart`, security: [{ bearerAuth: [] }],
    description: "Current CUSTOMER role required. One restaurant and <=50 menu lines. POST increments existing quantity; PUT replaces it. Unavailable menus stay visible, but cannot be added/updated. Prices are current catalog values. Other-customer item IDs return 404. No order/payment writes.",
    parameters: action === "update" || action === "remove" ? [{ name: "id", in: "path", required: true, schema: id }] : [],
    ...(write ? { requestBody: { required: true, content: { "application/json": { schema: {
      type: "object", additionalProperties: false,
      required: action === "add" ? ["restaurantId", "menuId", "quantity"] : ["quantity"],
      properties: action === "add" ? { restaurantId: id, menuId: id, quantity } : { quantity },
    } } } } } : {}),
    responses: {
      [action === "add" ? "201" : "200"]: { description: "Success", content: { "application/json": { schema: {
        type: "object", required: ["success", "message", "data"], properties: {
          success: { type: "boolean", enum: [true] }, message: { type: "string" },
          data: action === "get" ? { $ref: "#/components/schemas/CartData" } : write ? { $ref: "#/components/schemas/CartItemData" } : { type: "object" },
        },
      } } } },
      ...Object.fromEntries([400, 401, 403, 404, 409].map((status) => [status, {
        description: ({ 400: "Invalid input", 401: "Authentication required", 403: "Customer account required", 404: "Resource not found", 409: "Unavailable menu, quantity/item limit or another restaurant" } as Record<number, string>)[status],
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
      }])),
    },
  };
}
export const cartPaths = {
  "/api/cart": { get: operation("get"), post: operation("add"), delete: operation("clear") },
  "/api/cart/{id}": { put: operation("update"), delete: operation("remove") },
};
