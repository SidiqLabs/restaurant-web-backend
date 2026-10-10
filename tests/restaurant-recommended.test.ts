import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { app } from "../src/app.js";
import { closeDatabase, db, pool } from "../src/db/client.js";
import { restaurants, users } from "../src/db/schema.js";
import * as repository from "../src/modules/restaurants/restaurant.repository.js";
import { openApiDocument } from "../src/openapi.js";

let ownerId: string | undefined;
let fixtureId: number;
type RecommendationData = { recommendations: { id: number; name: string }[]; message: string };
const message = "Catalog suggestions ordered by restaurant ID; not personalized";

describe("public recommended restaurants", () => {
  beforeAll(async () => {
    const result = await pool.query<{ name: string }>("SELECT current_database() AS name");
    if (result.rows[0]?.name !== "restaurant_web_test") throw new Error("Recommendation tests require restaurant_web_test");
    const [owner] = await db.insert(users).values({ name: "Recommendation fixture", email: `recommended-${crypto.randomUUID()}@example.com`, passwordHash: "unused-test-hash", role: "RESTAURANT_OWNER" }).returning();
    ownerId = owner!.id;
    const rows = await db.insert(restaurants).values(Array.from({ length: 21 }, (_, index) => ({ ownerId: ownerId!, name: `Suggestion ${21 - index}`, address: "Bandung" }))).returning();
    fixtureId = rows[0]!.id;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    if (ownerId) {
      await db.delete(restaurants).where(eq(restaurants.ownerId, ownerId));
      await db.delete(users).where(eq(users.id, ownerId));
    }
    await closeDatabase();
  });
  it("returns a public bounded persisted catalog in deterministic ID order", async () => {
    const expected = await db.select().from(restaurants).orderBy(asc(restaurants.id)).limit(20);
    const response = await request(app).get("/api/resto/recommended").expect(200);
    expect(response.body).toEqual({ success: true, message: "Catalog request successful", data: { recommendations: JSON.parse(JSON.stringify(expected)) as unknown, message } });
    const data = (response.body as { data: RecommendationData }).data;
    expect(data.recommendations).toHaveLength(20);
    expect(data.recommendations.map((row) => row.id)).toEqual(expected.map((row) => row.id));
    expect(data.recommendations[0]).not.toHaveProperty("star");
    const repeat = await request(app).get("/api/resto/recommended").expect(200);
    expect(repeat.body).toEqual(response.body);
  });
  it("returns an empty array when the repository has no restaurants", async () => {
    // Simulate an empty catalog without deleting existing database rows.
    const empty = vi.spyOn(repository, "recommendedRestaurants").mockResolvedValueOnce([]);
    try {
      const response = await request(app).get("/api/resto/recommended").expect(200);
      expect(response.body).toEqual({ success: true, message: "Catalog request successful", data: { recommendations: [], message } });
      expect(empty).toHaveBeenCalledOnce();
    } finally { empty.mockRestore(); }
  });
  it("rejects all query input before database access", async () => {
    const query = vi.spyOn(repository, "recommendedRestaurants");
    try {
      for (const input of ["page=1", "limit=20", "limit=0", "limit=101", "q=food", "sort=rating", "extra=", "page=1&page=2", "limit[x]=1", "ownerId=forged"]) {
        const response = await request(app).get(`/api/resto/recommended?${input}`).expect(400);
        expect(response.body).toEqual({ success: false, message: "Invalid request" });
      }
      expect(query).not.toHaveBeenCalled();
    } finally { query.mockRestore(); }
  });
  it("preserves list, search, detail and menu routes", async () => {
    const list = await request(app).get("/api/resto?limit=1").expect(200);
    expect(Array.isArray((list.body as { data: unknown }).data)).toBe(true);
    const detail = await request(app).get(`/api/resto/${fixtureId}`).expect(200);
    expect((detail.body as { data: unknown }).data).toMatchObject({ id: fixtureId });
    const menu = await request(app).get(`/api/resto/${fixtureId}/menu`).expect(200);
    expect((menu.body as { data: unknown }).data).toEqual([]);
    await request(app).get("/api/resto/search?q=Suggestion").expect(200);
    await request(app).get("/api/resto/2147483647").expect(404);
  });
  it("documents the public response and fixed bound", () => {
    const operation = openApiDocument.paths["/api/resto/recommended"].get;
    expect(operation.security).toEqual([]);
    expect(operation.parameters).toEqual([]);
    expect(operation.responses["200"].content["application/json"].schema).toMatchObject({ properties: { data: { required: ["recommendations", "message"], properties: { recommendations: { maxItems: 20 } } } } });
    expect(operation.responses["400"]).toBeDefined();
  });
});
