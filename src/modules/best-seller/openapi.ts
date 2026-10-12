export const bestSellerPaths = {
  "/api/resto/best-seller": { get: {
    tags: ["Restaurant and Menu"], summary: "Read restaurants ranked by settled sold quantity", security: [],
    description: "Public bounded ranking from persisted PAID evidence and non-CANCELLED orders only. REFUNDED and unpaid orders contribute nothing. Sort: sold quantity descending, numeric restaurant ID ascending. Count/page use one repeatable-read snapshot. soldQuantity is a decimal string, not a floating-point financial amount. No fabricated sales or provider settlement is introduced.",
    parameters: [
      { name: "page", in: "query", schema: { type: "integer", minimum: 1, maximum: 10000, default: 1 } },
      { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
    ],
    responses: {
      "200": { description: "Ranked restaurants", content: { "application/json": { schema: {
        type: "object", required: ["success", "message", "data"], properties: {
          success: { type: "boolean", enum: [true] }, message: { type: "string", enum: ["Catalog request successful"] },
          data: { type: "object", required: ["restaurants", "pagination"], properties: {
            restaurants: { type: "array", maxItems: 100, items: { allOf: [
              { $ref: "#/components/schemas/Restaurant" },
              { type: "object", required: ["soldQuantity"], properties: { soldQuantity: { type: "string", pattern: "^[0-9]+$", example: "12" } } },
            ] } },
            pagination: { type: "object", required: ["page", "limit", "total", "totalPages"], properties: {
              page: { type: "integer", minimum: 1, maximum: 10000 }, limit: { type: "integer", minimum: 1, maximum: 100 },
              total: { type: "integer", minimum: 0 }, totalPages: { type: "integer", minimum: 0 },
            } },
          } },
        },
      }, example: { success: true, message: "Catalog request successful", data: { restaurants: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } } } } },
      "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
      "500": { description: "Internal server error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
    },
  } },
};
