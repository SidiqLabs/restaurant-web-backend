const uuid = { type: "string", format: "uuid" };
const date = { type: "string", format: "date-time" };
const nullableUuid = { ...uuid, nullable: true };
const errorResponse = (description: string) => ({ description, content: {
  "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
} });
const payment = {
  type: "object", additionalProperties: false,
  required: ["orderId", "status", "reference", "confirmedBy", "confirmedAt", "refundedBy", "refundedAt"],
  properties: {
    orderId: uuid, status: { type: "string", enum: ["PAID", "REFUNDED"] },
    reference: { type: "string", minLength: 1, maxLength: 100 }, confirmedBy: uuid,
    confirmedAt: date, refundedBy: nullableUuid, refundedAt: { ...date, nullable: true },
  },
};
const cancelledOrder = {
  type: "object", additionalProperties: false,
  required: ["id", "customerId", "restaurantId", "status", "totalRupiah", "createdAt", "updatedAt"],
  properties: {
    id: uuid, customerId: uuid, restaurantId: { type: "integer", minimum: 1 },
    status: { type: "string", enum: ["CANCELLED"] }, totalRupiah: { type: "integer", minimum: 0, maximum: 2147483647 },
    createdAt: date, updatedAt: date,
  },
};
function operation(action: "confirm" | "refund" | "cancel") {
  const descriptions = {
    confirm: "Manual current-ADMIN attestation only. Independently verify actual settlement against order identity and server amount first. A reference is not provider verification. Requires non-cancelled order and positive matching immutable purchase facts; duplicate order/reference returns 409. Does not move money or advance fulfillment.",
    refund: "Manual current-ADMIN attestation of an independently verified refund only; does not transfer money. Requires current PAID evidence, changes it once to REFUNDED, and leaves fulfillment unchanged. Repeat returns 409.",
    cancel: "Current ADMIN only. Cancels non-COMPLETED/non-CANCELLED orders, preserving separate payment evidence. No automatic refund or money movement; repeat returns 409.",
  };
  return {
    tags: ["Manual Payment and Cancellation"], security: [{ bearerAuth: [] }],
    summary: action === "confirm" ? "Attest manually verified settlement" : action === "refund" ? "Attest manually verified refund" : "Cancel an order",
    description: descriptions[action],
    parameters: [{ name: "orderId", in: "path", required: true, schema: uuid }],
    requestBody: { required: action === "confirm", content: { "application/json": { schema: action === "confirm" ? {
      type: "object", additionalProperties: false, required: ["reference"],
      properties: { reference: { type: "string", minLength: 1, maxLength: 100, pattern: "^[A-Za-z0-9._:-]+$", description: "Trimmed reference to independently verified settlement evidence" } },
      example: { reference: "independently-verified-evidence-reference" },
    } : { type: "object", additionalProperties: false, example: {} } } } },
    responses: {
      "200": { description: "Order request successful", content: { "application/json": { schema: {
        type: "object", required: ["success", "message", "data"], properties: {
          success: { type: "boolean", enum: [true] }, message: { type: "string", enum: ["Order request successful"] },
          data: action === "cancel" ? cancelledOrder : payment,
        },
      } } } },
      "400": errorResponse("Invalid request"), "401": errorResponse("Authentication required"),
      "403": errorResponse("Permission denied"), "404": errorResponse("Order not found"),
      "409": errorResponse("Operation conflicts with current order/payment state"), "500": errorResponse("Internal server error"),
    },
  };
}
export const paymentPaths = {
  "/api/order/{orderId}/payment/confirm": { post: operation("confirm") },
  "/api/order/{orderId}/payment/refund": { post: operation("refund") },
  "/api/order/{orderId}/cancel": { post: operation("cancel") },
};
