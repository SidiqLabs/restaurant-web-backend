const id = { type: "integer", minimum: 1, maximum: 2147483647 };
const money = { type: "integer", minimum: 0, maximum: 2147483647, description: "Authoritative integer rupiah" };
const paymentMethod = { type: "string", enum: ["BNI Bank Negara Indonesia", "BRI Bank Rakyat Indonesia", "BCA Bank Central Asia", "Mandiri"] };
const selectedItem = { type: "object", additionalProperties: false, required: ["menuId", "quantity"], properties: { menuId: id, quantity: { type: "integer", minimum: 1, maximum: 99 } } };
const transaction = { type: "object", required: ["id", "transactionId", "status", "paymentStatus", "paymentMethod", "deliveryAddress", "phone", "notes", "pricing", "restaurants", "createdAt", "updatedAt"], properties: {
  id, transactionId: { type: "string", format: "uuid", description: "Persisted order UUID; numeric id identifies immutable checkout metadata" },
  status: { type: "string", enum: ["pending", "preparing", "done", "canceled"] }, paymentStatus: { type: "string", enum: ["UNPAID", "PAID", "REFUNDED"] },
  paymentMethod, deliveryAddress: { type: "string", minLength: 10, maxLength: 500 }, phone: { type: "string", minLength: 8, maxLength: 30 }, notes: { type: "string", maxLength: 1000 },
  pricing: { type: "object", required: ["subtotal", "serviceFee", "deliveryFee", "totalPrice"], properties: { subtotal: money, serviceFee: { type: "integer", enum: [0] }, deliveryFee: { type: "integer", enum: [0] }, totalPrice: money } },
  restaurants: { type: "array", minItems: 1, maxItems: 1, items: { type: "object", required: ["restaurant", "items", "subtotal"], properties: {
    restaurant: { type: "object", required: ["id", "name", "logo"], properties: { id, name: { type: "string" }, logo: { type: "string", enum: [""] } } },
    items: { type: "array", minItems: 1, maxItems: 50, items: { type: "object", required: ["menuId", "menuName", "price", "image", "quantity", "itemTotal"], properties: { menuId: id, menuName: { type: "string" }, price: money, image: { type: "string", enum: [""] }, quantity: { type: "integer", minimum: 1, maximum: 99 }, itemTotal: money } } }, subtotal: money,
  } } }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" },
} };
export const checkoutSchemas = {
  CheckoutRequest: { type: "object", additionalProperties: false, required: ["restaurants", "deliveryAddress", "phone", "paymentMethod"], properties: {
    restaurants: { type: "array", minItems: 1, maxItems: 1, items: { type: "object", additionalProperties: false, required: ["restaurantId", "items"], properties: { restaurantId: id, items: { type: "array", minItems: 1, maxItems: 50, items: selectedItem } } } },
    deliveryAddress: transaction.properties.deliveryAddress, phone: { ...transaction.properties.phone, pattern: "^[+0-9() -]{8,30}$", description: "Must include a digit" }, paymentMethod, notes: transaction.properties.notes,
  } }, OrderTransaction: transaction,
};
const errors = Object.fromEntries([400, 401, 403, 409, 500].map((status) => [status, { description: ({ 400: "Invalid input or missing idempotency key", 401: "Authentication required", 403: "Current CUSTOMER role required", 409: "Changed/empty/unavailable cart, overflow or reused key with different intent", 500: "Safe internal error; transaction rolled back" } as Record<number, string>)[status] }]));
export const checkoutPaths = {
  "/api/order/checkout": { post: {
    tags: ["Orders"], summary: "Place one customer order from selected owned Cart items", security: [{ bearerAuth: [] }],
    description: "Requires Idempotency-Key, reused for retries of one intent. Quantity must match current cart. Current server prices replace estimates; zero fees. Atomic snapshot creation and selected-cart consumption. Original 201/body replayed even after catalog, cart or fulfillment changes. Never confirms payment.",
    parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", pattern: "^[A-Za-z0-9_-]{16,128}$" } }],
    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CheckoutRequest" } } } },
    responses: { "201": { description: "Created or original placement replay", content: { "application/json": { schema: { type: "object", required: ["success", "message", "data"], properties: { success: { type: "boolean", enum: [true] }, message: { type: "string" }, data: { type: "object", required: ["transaction"], properties: { transaction: { $ref: "#/components/schemas/OrderTransaction" } } } } } } } }, ...errors },
  } },
  "/api/order/my-order": { get: {
    tags: ["Orders"], summary: "List only the caller's placed orders", security: [{ bearerAuth: [] }],
    description: "Current fulfillment/payment state with immutable purchase snapshots. Default status=done matches existing frontend; use pending/all for new unpaid orders. on_the_way/delivered return empty because these states are not modeled.",
    parameters: [{ name: "status", in: "query", schema: { type: "string", enum: ["all", "pending", "preparing", "on_the_way", "delivered", "done", "canceled"], default: "done" } },
      { name: "page", in: "query", schema: { type: "integer", minimum: 1, maximum: 10000, default: 1 } }, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 10 } }],
    responses: { "200": { description: "Owned order page", content: { "application/json": { schema: { type: "object", required: ["success", "data"], properties: { success: { type: "boolean", enum: [true] }, data: { type: "object", required: ["orders", "pagination", "filter"], properties: {
      orders: { type: "array", maxItems: 100, items: { $ref: "#/components/schemas/OrderTransaction" } },
      pagination: { type: "object", required: ["page", "limit", "total", "totalPages"], properties: { page: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" }, totalPages: { type: "integer" } } }, filter: { type: "object", required: ["status"], properties: { status: { type: "string" } } },
    } } } } } } }, ...errors },
  } },
};
