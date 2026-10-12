import { readFile } from "node:fs/promises";
import { describe, expect, it, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { closeDatabase } from "../src/db/client.js";
import { openApiDocument } from "../src/openapi.js";

const methods = new Set(["get", "post", "put", "patch", "delete"]);
describe("API integration contract coverage", () => {
  afterAll(closeDatabase);
  it("documents every mounted API/health route with the exact HTTP method and path", async () => {
    const source = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
    const imports = new Map([...source.matchAll(/import \{ (\w+) \} from "\.\/routes\/(\w+)\.js";/g)].map(m => [m[1], m[2]]));
    const mounted = [...source.matchAll(/app\.use\("([^"\n]+)", (\w+)\);/g)];
    const implemented: string[] = [];
    for (const mount of mounted) {
      const file = imports.get(mount[2]); if (!file) continue;
      const routeSource = await readFile(new URL(`../src/routes/${file}.ts`, import.meta.url), "utf8");
      for (const route of routeSource.matchAll(/\w+\.(get|post|put|patch|delete)\("([^"\n]+)"/g)) {
        const path = `${mount[1]}${route[2] === "/" ? "" : route[2]}`.replace(/:(\w+)/g, "{$1}");
        implemented.push(`${route[1]} ${path}`);
      }
    }
    const documented = Object.entries(openApiDocument.paths).flatMap(([path, operations]) =>
      Object.keys(operations).filter(method => methods.has(method)).map(method => `${method} ${path}`));
    expect(implemented.length).toBeGreaterThan(30);
    expect(new Set(documented)).toEqual(new Set(implemented));
    expect(documented).toHaveLength(implemented.length);
  });
  it("serves a serializable spec and all Swagger browser resources", async () => {
    const spec = await request(app).get("/api-docs.json").expect(200);
    expect(spec.body).toEqual(openApiDocument);
    await request(app).get("/api-docs/").expect(200);
    for (const file of ["swagger-ui.css", "swagger-ui-bundle.js", "swagger-ui-standalone-preset.js", "swagger-ui-init.js"]) {
      await request(app).get(`/api-docs/${file}`).expect(200);
    }
  });
  it("keeps manual financial operations explicitly ADMIN-only and documents their actual responses", async () => {
    for (const [path, entry] of Object.entries(openApiDocument.paths)) {
      if (!path.includes("/payment/") && !path.endsWith("/cancel")) continue;
      expect(entry).toHaveProperty("post");
      const operation = (entry as { post: { security: unknown; description: string; responses: Record<string, unknown> } }).post;
      expect(operation.security).toEqual([{ bearerAuth: [] }]); expect(operation.description).toContain("ADMIN");
      for (const status of ["200", "400", "401", "403", "404", "409", "500"]) expect(operation.responses).toHaveProperty(status);
      await request(app).post(path.replace("{orderId}", "11111111-1111-4111-8111-111111111111")).send({}).expect(401);
    }
    const confirm = openApiDocument.paths["/api/order/{orderId}/payment/confirm"].post;
    expect(confirm.description).toContain("A reference is not provider verification");
    expect(confirm.requestBody.required).toBe(true);
    expect(confirm.responses["200"].content["application/json"].schema.properties.data).toHaveProperty("properties.confirmedBy");
    expect(openApiDocument.paths["/api/order/{orderId}/cancel"].post.responses["200"].content["application/json"].schema.properties.data).toHaveProperty("properties.customerId");
  });
  it("keeps Best Seller public and accurately documents bigint-string quantity and pagination", async () => {
    const operation = openApiDocument.paths["/api/resto/best-seller"].get;
    expect(operation.security).toEqual([]);
    const quantity = operation.responses["200"].content["application/json"].schema.properties.data.properties.restaurants.items.allOf[1]!;
    expect(quantity).toMatchObject({ properties: { soldQuantity: { type: "string" } } });
    const result = await request(app).get("/api/resto/best-seller?page=1&limit=1").expect(200);
    const data = (result.body as { data: { restaurants: { soldQuantity: string }[]; pagination: { page: number; limit: number } } }).data;
    expect(data.pagination).toMatchObject({ page: 1, limit: 1 }); expect(data.restaurants.length).toBeLessThanOrEqual(1);
    for (const restaurant of data.restaurants) expect(restaurant.soldQuantity).toMatch(/^[0-9]+$/);
    await request(app).get("/api/resto/best-seller?limit=101").expect(400);
    await request(app).get("/api/resto/best-seller?ownerId=forged").expect(400);
  });
  it("keeps health public and reports process health without a database claim", async () => {
    expect(openApiDocument.paths["/health"].get.security).toEqual([]);
    await request(app).get("/health").expect(200, { success: true, message: "Service is healthy", data: { status: "ok" } });
  });
});
