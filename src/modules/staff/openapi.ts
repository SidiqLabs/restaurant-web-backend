const errorResponse = (description: string) => ({ description, content: { "application/json": {
  schema: { $ref: "#/components/schemas/ErrorResponse" }, example: { success: false, message: description },
} } });
const errors = {
  "400": errorResponse("Invalid request"), "401": errorResponse("Authentication required"),
  "403": errorResponse("Permission denied"), "404": errorResponse("Resource not found"),
  "409": errorResponse("Staff is not eligible"), "500": errorResponse("Internal server error"),
};
const uuid = { type: "string", format: "uuid" } as const;
const assignment = { type: "object", additionalProperties: false, required: ["orderId", "restaurantId", "staffId", "updatedAt"], properties: {
  orderId: uuid, restaurantId: { type: "integer" }, staffId: uuid, updatedAt: { type: "string", format: "date-time" },
} } as const;
const membership = { type: "object", additionalProperties: false, required: ["restaurantId", "staffId", "status", "updatedAt"], properties: {
  restaurantId: { type: "integer" }, staffId: uuid, status: { type: "string", enum: ["active", "revoked"] }, updatedAt: { type: "string", format: "date-time" },
} } as const;
const json = (schema: object) => ({ "application/json": { schema } });
const success = (properties: object, required: string[]) => ({ description: "Success", content: json({ type: "object", required: ["success", "data"], properties: {
  success: { type: "boolean", enum: [true] }, data: { type: "object", required, properties },
} }) });
const orderParameters = [{ name: "orderId", in: "path", required: true, schema: uuid }];
export const staffPaths = {
  "/api/resto/{restaurantId}/staff/{staffId}": { put: {
    tags: ["Staff Assignment"], security: [{ bearerAuth: [] }], summary: "Set restaurant staff membership",
    description: "Current owning OWNER or global ADMIN only. Active requires an existing RESTAURANT_STAFF account. Revocation immediately denies staff assignment access; existing assignment records remain. No self-enrollment.",
    parameters: [{ name: "restaurantId", in: "path", required: true, schema: { type: "integer", minimum: 1, maximum: 2147483647 } }, { name: "staffId", in: "path", required: true, schema: uuid }],
    requestBody: { required: true, content: json({ type: "object", additionalProperties: false, required: ["status"], properties: { status: { type: "string", enum: ["active", "revoked"] } }, example: { status: "active" } }) },
    responses: { "200": success({ membership }, ["membership"]), ...errors },
  } },
  "/api/order/{orderId}/staff": {
    put: { tags: ["Staff Assignment"], security: [{ bearerAuth: [] }], summary: "Assign or reassign order staff",
      description: "Owning OWNER or ADMIN only; current STAFF role and active same-restaurant membership required. expectedStaffId is null for initial assignment, otherwise the previous UUID. Exact retries revalidate eligibility. Does not change lifecycle or payment and grants no staff transition permission.",
      parameters: orderParameters,
      requestBody: { required: true, content: json({ type: "object", additionalProperties: false, required: ["staffId", "expectedStaffId"], properties: { staffId: uuid, expectedStaffId: { ...uuid, nullable: true } }, example: { staffId: "11111111-1111-4111-8111-111111111111", expectedStaffId: null } }) },
      responses: { "200": success({ assignment, repeated: { type: "boolean" } }, ["assignment", "repeated"]), ...errors },
    },
    get: { tags: ["Staff Assignment"], security: [{ bearerAuth: [] }], summary: "Read minimal order assignment",
      description: "Owning OWNER/ADMIN, or the currently assigned STAFF with active membership. Revoked membership, changed role, foreign restaurant and unassigned staff cannot read it. No customer or payment details returned.",
      parameters: orderParameters, responses: { "200": success({ assignment: { ...assignment, nullable: true } }, ["assignment"]), ...errors },
    },
  },
};
