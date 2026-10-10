import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { app } from "../src/app.js";
import { closeDatabase, db, pool } from "../src/db/client.js";
import { restaurants, users } from "../src/db/schema.js";
import { openApiDocument } from "../src/openapi.js";

type SearchData = {
  restaurants: { id: number; name: string; description: string; address: string }[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  searchQuery: string;
};
const marker = crypto.randomUUID();
let ownerId: string | undefined;
let fixtureIds: number[] = [];
async function search(q: string, page = 1, limit = 20): Promise<SearchData> {
  const response = await request(app).get("/api/resto/search").query({ q, page, limit }).expect(200);
  expect(response.body).toMatchObject({ success: true, message: "Catalog request successful" });
  return (response.body as { data: SearchData }).data;
}

describe("public restaurant search with PostgreSQL", () => {
  beforeAll(async () => {
    const result = await pool.query<{ name: string }>("SELECT current_database() AS name");
    if (result.rows[0]?.name !== "restaurant_web_test") throw new Error("Search tests require restaurant_web_test");
    const [owner] = await db.insert(users).values({ name: "Search fixture", email: `search-${marker}@example.com`, passwordHash: "unused-test-hash", role: "RESTAURANT_OWNER" }).returning();
    ownerId = owner!.id;
    const rows = await db.insert(restaurants).values([
      { ownerId, name: `${marker} Alpha`, description: "Name match", address: "Bandung" },
      { ownerId, name: "Description match", description: `${marker} Spicy noodles`, address: "Jakarta" },
      { ownerId, name: `${marker} 100%_\\ literal`, description: "Literal metacharacters", address: "Bogor" },
      { ownerId, name: `${marker} ' OR 1=1 --`, description: "Literal SQL-like text", address: "Solo" },
    ]).returning();
    fixtureIds = rows.map((row) => row.id);
  });
  afterAll(async () => {
    if (ownerId) {
      await db.delete(restaurants).where(eq(restaurants.ownerId, ownerId));
      await db.delete(users).where(eq(users.id, ownerId));
    }
    await closeDatabase();
  });
  it("matches name, trims input, and returns persisted DTO fields", async () => {
    const data = await search(`  ${marker} Alpha  `);
    expect(data.searchQuery).toBe(`${marker} Alpha`);
    expect(data.restaurants).toHaveLength(1);
    expect(data.restaurants[0]).toMatchObject({ id: fixtureIds[0], name: `${marker} Alpha`, address: "Bandung" });
    expect(data.restaurants[0]).not.toHaveProperty("star");
  });
  it("matches descriptions and ignores case", async () => {
    expect((await search(`${marker} SPICY NOODLES`)).restaurants.map((row) => row.id)).toEqual([fixtureIds[1]]);
    expect((await search(`${marker.toUpperCase()} ALPHA`)).restaurants.map((row) => row.id)).toEqual([fixtureIds[0]]);
  });
  it("returns empty results and accurate pagination for no matches", async () => {
    expect(await search(`${marker} absent`)).toMatchObject({ restaurants: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  });
  it("rejects missing, empty, invalid, repeated and unknown parameters", async () => {
    const queries = ["", "q=", "q=%20%20", `q=${"x".repeat(201)}`, "q=x&extra=y", "q=x&q=y", "q=x&page=1&page=2", "q=x&limit=1&limit=2", "q=x&page=0", "q=x&page=10001", "q=x&page=1.5", "q=x&page=-1", "q=x&limit=0", "q=x&limit=101", "q=x&limit=no", "q=x&limit=", "q=x&page=01", "q[x]=y"];
    for (const query of queries) {
      const response = await request(app).get(`/api/resto/search?${query}`).expect(400);
      expect(response.body).toEqual({ success: false, message: "Invalid request" });
    }
  });
  it("applies defaults and deterministic bounded pagination", async () => {
    const response = await request(app).get("/api/resto/search").query({ q: marker }).expect(200);
    expect((response.body as { data: SearchData }).data.pagination).toEqual({ page: 1, limit: 20, total: 4, totalPages: 1 });
    const first = await search(marker, 1, 2);
    const second = await search(marker, 2, 2);
    expect(first.restaurants.map((row) => row.id)).toEqual(fixtureIds.slice(0, 2));
    expect(second.restaurants.map((row) => row.id)).toEqual(fixtureIds.slice(2));
    expect(first.pagination).toEqual({ page: 1, limit: 2, total: 4, totalPages: 2 });
    expect(await search(marker, 1, 2)).toEqual(first);
    expect(await search(marker, 3, 2)).toMatchObject({ restaurants: [], pagination: { total: 4, totalPages: 2 } });
    expect((await search(marker, 10000, 100)).restaurants).toEqual([]);
    await request(app).get("/api/resto/search").query({ q: "x".repeat(200) }).expect(200);
  });
  it("treats SQL-like text and LIKE metacharacters as literal data", async () => {
    expect((await search(`${marker} ' OR 1=1 --`)).restaurants.map((row) => row.id)).toEqual([fixtureIds[3]]);
    expect((await search(`${marker} 100%_\\`)).restaurants.map((row) => row.id)).toEqual([fixtureIds[2]]);
    expect((await search(`${marker}%`)).restaurants).toEqual([]);
    expect((await search(`${marker}_`)).restaurants).toEqual([]);
    expect((await search(`${marker}' UNION SELECT NULL --`)).restaurants).toEqual([]);
    expect((await search(marker)).pagination.total).toBe(4);
  });
  it("preserves list and detail contracts and documents the public search route", async () => {
    const list = await request(app).get("/api/resto?limit=1").expect(200);
    expect(Array.isArray((list.body as { data: unknown }).data)).toBe(true);
    const detail = await request(app).get(`/api/resto/${fixtureIds[0]}`).expect(200);
    expect((detail.body as { data: unknown }).data).toMatchObject({ id: fixtureIds[0] });
    await request(app).get("/api/resto/2147483647").expect(404);
    const operation = openApiDocument.paths["/api/resto/search"].get;
    expect(operation.security).toEqual([]);
    expect(operation.parameters).toContainEqual(expect.objectContaining({ name: "q", required: true }));
    expect(operation.responses["200"].content["application/json"].schema).toMatchObject({ properties: { data: { required: ["restaurants", "pagination", "searchQuery"] } } });
  });
});
