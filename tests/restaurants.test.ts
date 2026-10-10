import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { app } from "../src/app.js";
import { db, closeDatabase } from "../src/db/client.js";
import { menus, restaurants, users } from "../src/db/schema.js";
import { createAccessToken } from "../src/modules/auth/token.js";
import { pool } from "../src/db/client.js";

// Run this integration file independently from auth's legacy global cleanup.
// Catalog fixtures are scoped to generated identities and cleaned individually.
vi.setConfig({ testTimeout: 15000 });
const ids: string[] = [];
const tokens: Record<string, string> = {};
let restaurantId: number;
let otherRestaurantId: number;
let menuId: number;

describe("restaurant and menu integration", () => {
  beforeAll(async () => {
    const result = await pool.query<{ name: string }>("SELECT current_database() AS name");
    if (result.rows[0]?.name !== "restaurant_web_test") throw new Error("Catalog tests require restaurant_web_test");
    for (const role of ["RESTAURANT_OWNER", "ADMIN", "CUSTOMER", "RESTAURANT_STAFF", "RESTAURANT_OWNER"] as const) {
      const key = role === "RESTAURANT_OWNER" && tokens[role] ? "other" : role;
      const [user] = await db.insert(users).values({ name: "Catalog fixture", email: `catalog-${crypto.randomUUID()}@example.com`, passwordHash: "unused-test-hash", role }).returning();
      if (!user) throw new Error("Missing fixture");
      ids.push(user.id);
      tokens[key] = await createAccessToken(user.id);
    }
  });
  afterAll(async () => {
    if (ids.length) {
      const rows = await db.select({ id: restaurants.id }).from(restaurants).where(inArray(restaurants.ownerId, ids));
      if (rows.length) {
        const restaurantIds = rows.map((row) => row.id);
        await db.delete(menus).where(inArray(menus.restaurantId, restaurantIds));
        await db.delete(restaurants).where(inArray(restaurants.id, restaurantIds));
      }
      await db.delete(users).where(inArray(users.id, ids));
    }
    await closeDatabase();
  });
  it("requires authentication and owner/admin roles", async () => {
    const body = { name: "Warung", address: "Bandung" };
    await request(app).post("/api/resto").send(body).expect(401);
    for (const role of ["CUSTOMER", "RESTAURANT_STAFF"]) {
      await request(app).post("/api/resto").auth(tokens[role]!, { type: "bearer" }).send(body).expect(403);
    }
  });
  it("creates numeric restaurants and derives ownership", async () => {
    const response = await request(app).post("/api/resto").auth(tokens.RESTAURANT_OWNER!, { type: "bearer" }).send({ name: " Warung ", address: " Bandung " }).expect(201);
    const data = (response.body as { data: unknown }).data as { id: number; ownerId: string; name: string };
    restaurantId = data.id;
    expect(Number.isInteger(data.id)).toBe(true);
    expect(data.ownerId).toBe(ids[0]);
    expect(data.name).toBe("Warung");
    await request(app).post("/api/resto").auth(tokens.RESTAURANT_OWNER!, { type: "bearer" }).send({ name: "Forged", address: "Bandung", ownerId: ids[1] }).expect(400);
    const other = await request(app).post("/api/resto").auth(tokens.other!, { type: "bearer" }).send({ name: "Other", address: "Jakarta" }).expect(201);
    otherRestaurantId = ((other.body as { data: unknown }).data as { id: number }).id;
  });
  it("supports public bounded reads and rejects invalid identifiers", async () => {
    await request(app).get(`/api/resto/${restaurantId}`).expect(200);
    const list = await request(app).get("/api/resto?limit=1&page=1").expect(200);
    expect(((list.body as { data: unknown }).data as unknown[]).length).toBeLessThanOrEqual(1);
    for (const path of ["/api/resto?limit=101", "/api/resto?page=0", "/api/resto?sort=rating", "/api/resto/1.5", "/api/resto/2147483648"]) await request(app).get(path).expect(400);
    await request(app).get("/api/resto/2147483647").expect(404);
  });
  it("enforces ownership and permits admin updates", async () => {
    await request(app).patch(`/api/resto/${restaurantId}`).auth(tokens.other!, { type: "bearer" }).send({ name: "Hijacked" }).expect(403);
    await request(app).patch(`/api/resto/${restaurantId}`).auth(tokens.RESTAURANT_OWNER!, { type: "bearer" }).send({ name: "Updated" }).expect(200);
    await request(app).patch(`/api/resto/${restaurantId}`).auth(tokens.ADMIN!, { type: "bearer" }).send({ address: "New address" }).expect(200);
    await request(app).patch(`/api/resto/${restaurantId}`).auth(tokens.ADMIN!, { type: "bearer" }).send({}).expect(400);
    await request(app).patch(`/api/resto/${restaurantId}`).auth(tokens.ADMIN!, { type: "bearer" }).send({ ownerId: ids[1] }).expect(400);
  });
  it("creates and reads menus with integer rupiah prices", async () => {
    const response = await request(app).post(`/api/resto/${restaurantId}/menu`).auth(tokens.RESTAURANT_OWNER!, { type: "bearer" }).send({ name: "Nasi", price: 15000 }).expect(201);
    const data = (response.body as { data: unknown }).data as { id: number; restaurantId: number; price: number; available: boolean };
    menuId = data.id;
    expect(data).toMatchObject({ restaurantId, price: 15000, available: true });
    expect(Number.isInteger(menuId)).toBe(true);
    await request(app).get(`/api/resto/${restaurantId}/menu`).expect(200);
    await request(app).get(`/api/resto/${restaurantId}/menu/${menuId}`).expect(200);
    await request(app).get(`/api/resto/${otherRestaurantId}/menu/${menuId}`).expect(404);
  });
  it("rejects invalid money and menu reparenting", async () => {
    for (const price of [-1, 1.5, "15000", 2147483648]) await request(app).post(`/api/resto/${restaurantId}/menu`).auth(tokens.RESTAURANT_OWNER!, { type: "bearer" }).send({ name: "Nasi", price }).expect(400);
    await request(app).patch(`/api/resto/${restaurantId}/menu/${menuId}`).auth(tokens.ADMIN!, { type: "bearer" }).send({ restaurantId: otherRestaurantId }).expect(400);
    await expect(db.insert(menus).values({ restaurantId, name: "Invalid", price: -1 })).rejects.toThrow();
  });
  it("enforces menu ownership and URL parentage on writes", async () => {
    await request(app).post(`/api/resto/${restaurantId}/menu`).auth(tokens.other!, { type: "bearer" }).send({ name: "Nasi", price: 1 }).expect(403);
    await request(app).patch(`/api/resto/${restaurantId}/menu/${menuId}`).auth(tokens.other!, { type: "bearer" }).send({ price: 1 }).expect(403);
    await request(app).patch(`/api/resto/${otherRestaurantId}/menu/${menuId}`).auth(tokens.ADMIN!, { type: "bearer" }).send({ price: 1 }).expect(404);
    await request(app).patch(`/api/resto/${restaurantId}/menu/${menuId}`).auth(tokens.ADMIN!, { type: "bearer" }).send({ price: 0, available: false }).expect(200);
    await request(app).patch(`/api/resto/${restaurantId}/menu/${menuId}`).auth(tokens.ADMIN!, { type: "bearer" }).send({ name: "Renamed" }).expect(200);
    await request(app).patch(`/api/resto/${restaurantId}/menu/${menuId}`).auth(tokens.ADMIN!, { type: "bearer" }).send({}).expect(400);
    const [row] = await db.select().from(menus).where(and(eq(menus.id, menuId), eq(menus.restaurantId, restaurantId)));
    expect(row).toMatchObject({ price: 0, available: false });
  });
  it("reads current roles rather than trusting previously issued tokens", async () => {
    await db.update(users).set({ role: "CUSTOMER" }).where(eq(users.id, ids[0]!));
    await request(app).patch(`/api/resto/${restaurantId}`).auth(tokens.RESTAURANT_OWNER!, { type: "bearer" }).send({ name: "Revoked" }).expect(403);
  });
  it("rejects tokens without a current database identity", async () => {
    const token = await createAccessToken(crypto.randomUUID());
    await request(app).post("/api/resto").auth(token, { type: "bearer" }).send({ name: "Missing", address: "Bandung" }).expect(401);
  });
  it("publishes catalog documentation", async () => {
    const response = await request(app).get("/api-docs.json").expect(200);
    expect((response.body as { paths: unknown }).paths).toHaveProperty("/api/resto/{restaurantId}/menu/{menuId}");
  });
});
