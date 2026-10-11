const id = { type: "integer", minimum: 1, maximum: 2147483647 };
const content = { star: { type: "integer", minimum: 1, maximum: 5 }, comment: { type: "string", minLength: 1, maxLength: 2000 } };
const menu = { type: "object", required: ["menuId", "menuName", "price", "quantity", "type", "image"], properties: { menuId: id, menuName: { type: "string" }, price: { type: "integer", minimum: 0 }, quantity: { type: "integer", minimum: 1, maximum: 99 }, type: { type: "string", enum: [""] }, image: { type: "string", enum: [""] } } };
const fields = { id, ...content, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" }, menus: { type: "array", minItems: 1, maxItems: 50, items: menu } };
export const reviewSchemas = {
  ReviewCreate: { type: "object", additionalProperties: false, required: ["transactionId", "restaurantId", "star", "comment", "menuIds"], properties: { ...content, transactionId: { type: "string", format: "uuid" }, restaurantId: id, menuIds: { type: "array", minItems: 1, maxItems: 50, uniqueItems: true, items: id } } },
  ReviewUpdate: { type: "object", additionalProperties: false, required: ["star", "comment"], properties: content },
  OwnedReview: { type: "object", required: [...Object.keys(fields), "transactionId", "restaurant"], properties: { ...fields, transactionId: { type: "string", format: "uuid" }, restaurant: { type: "object", required: ["id", "name", "logo"], properties: { id, name: { type: "string" }, logo: { type: "string", enum: [""] } } } } },
  PublicReview: { type: "object", required: [...Object.keys(fields), "user"], properties: { ...fields, user: { type: "object", required: ["name", "avatar"], properties: { name: { type: "string" }, avatar: { type: "string", enum: [""] } } } } },
};
function operation(action: "create" | "my" | "public" | "update" | "delete") {
  const listing = action === "my" || action === "public";
  const data = listing ? { type: "object", required: ["reviews", "pagination", ...(action === "public" ? ["summary"] : [])], properties: {
    reviews: { type: "array", maxItems: 100, items: { $ref: `#/components/schemas/${action === "public" ? "PublicReview" : "OwnedReview"}` } },
    pagination: { type: "object", required: ["page", "limit", "total", "totalPages"], properties: Object.fromEntries(["page", "limit", "total", "totalPages"].map((field) => [field, { type: "integer" }])) },
    ...(action === "public" ? { summary: { type: "object", required: ["reviewCount", "averageRating"], properties: { reviewCount: { type: "integer", minimum: 0 }, averageRating: { type: "number", minimum: 0, maximum: 5 } } } } : {}),
  } } : { type: "object", required: ["review"], properties: { review: { $ref: "#/components/schemas/OwnedReview" } } };
  return { tags: ["Reviews"], summary: `${action} restaurant reviews`, ...(action !== "public" ? { security: [{ bearerAuth: [] }] } : { security: [] }),
    description: "Current CUSTOMER required for private operations. Create requires owned COMPLETED checkout with purchased menu subset. One review per order, even after soft delete. Public omits customer/order identifiers. Active-only aggregates use the same snapshot as pagination; newest createdAt/id first. No fulfillment or payment changes.",
    parameters: [...(action === "public" ? [{ name: "restaurantId", in: "path", required: true, schema: id }] : action === "update" || action === "delete" ? [{ name: "id", in: "path", required: true, schema: id }] : []),
      ...(listing ? [{ name: "page", in: "query", schema: { type: "integer", minimum: 1, maximum: 10000, default: 1 } }, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 10 } }] : [])],
    ...(action === "create" || action === "update" ? { requestBody: { required: true, content: { "application/json": { schema: { $ref: `#/components/schemas/${action === "create" ? "ReviewCreate" : "ReviewUpdate"}` } } } } } : {}),
    responses: { [action === "create" ? "201" : "200"]: { description: "Success", content: { "application/json": { schema: { type: "object", required: ["success", ...(action !== "delete" ? ["data"] : ["message"])], properties: { success: { type: "boolean", enum: [true] }, message: { type: "string" }, ...(action !== "delete" ? { data } : {}) } } } } },
      ...Object.fromEntries([400,401,403,404,409,500].map((status) => [status, { description: ({400:"Invalid input or unpurchased menu",401:"Authentication required",403:"Customer account required",404:"Resource/owned eligible order not found",409:"Incomplete or already reviewed order",500:"Safe internal error; transaction rolled back"} as Record<number,string>)[status] }])) },
  };
}
export const reviewPaths = { "/api/review": { post: operation("create") }, "/api/review/my-reviews": { get: operation("my") }, "/api/review/restaurant/{restaurantId}": { get: operation("public") }, "/api/review/{id}": { put: operation("update"), delete: operation("delete") } };
