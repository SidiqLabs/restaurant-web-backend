const status = { type: "string", enum: ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"] };
export const lifecyclePaths = {
  "/api/order/{orderId}/status": { post: {
    tags: ["Orders"], summary: "Advance paid order fulfillment", operationId: "transitionOrderStatus",
    security: [{ bearerAuth: [] }],
    description: "Current restaurant OWNER or ADMIN only; unassigned STAFF denied. PENDING -> CONFIRMED -> PREPARING -> READY -> COMPLETED, single hop with expectedStatus. Current PAID required for every hop/retry. Exact retry returns repeated=true without mutation; stale/illegal requests conflict. Payment state, snapshots and existing ADMIN cancellation remain separate.",
    parameters: [{ name: "orderId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
    requestBody: { required: true, content: { "application/json": { schema: { type: "object", additionalProperties: false, required: ["expectedStatus", "status"], properties: { expectedStatus: status, status } } } } },
    responses: {
      "200": { description: "Advanced or exact idempotent repeat", content: { "application/json": { schema: { type: "object", required: ["success", "data"], properties: {
        success: { type: "boolean", enum: [true] }, data: { type: "object", required: ["order", "repeated"], properties: {
          repeated: { type: "boolean" }, order: { type: "object", required: ["id", "restaurantId", "status", "paymentStatus", "updatedAt"], properties: {
            id: { type: "string", format: "uuid" }, restaurantId: { type: "integer" }, status, paymentStatus: { type: "string", enum: ["PAID"] }, updatedAt: { type: "string", format: "date-time" },
          } },
        } },
      } } } } },
      ...Object.fromEntries(Object.entries({ 400: "Invalid/unknown input", 401: "Authentication required", 403: "Role denied", 404: "Missing or foreign restaurant order", 409: "Illegal/stale transition or unsettled payment", 500: "Safe internal error; transaction rolled back" }).map(([code, description]) => [code, { description, content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }])),
    },
  } },
};
