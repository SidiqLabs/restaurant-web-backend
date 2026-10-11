import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import pg from "pg";
import { app, createApp } from "../src/app.js";
import { closeDatabase, pool } from "../src/db/client.js";
import { createAccessToken } from "../src/modules/auth/token.js";
import { openApiDocument } from "../src/openapi.js";
import { MAX_CART_LINES, MAX_QUANTITY } from "../src/modules/cart/cart.schema.js";

type Item = { id: number; quantity: number; itemTotal: number; menu: { id: number; foodName: string; price: number; available: boolean; image: string; type: string } };
type CartData = { cart: { restaurant: { id: number; name: string; logo: string }; items: Item[]; subtotal: number }[]; summary: { totalItems: number; totalPrice: number; restaurantCount: number } };
const cartBody = (response: { body: unknown }) => (response.body as { data: CartData }).data;
const itemBody = (response: { body: unknown }): Item => {
  const item = (response.body as { data: { cartItem: Item } }).data.cartItem;
  return { id: item.id, quantity: item.quantity, itemTotal: item.itemTotal, menu: item.menu };
};
const actors: Record<string, string> = {};
const tokens: Record<string, string> = {};
const restaurantIds: number[] = [];
const menuIds: number[] = [];
const extraMenus: number[] = [];
const marker = randomUUID();
const add = (quantity = 1, role = "a", index = 0) => request(app).post("/api/cart").auth(tokens[role]!, { type: "bearer" })
  .send({ restaurantId: restaurantIds[index], menuId: menuIds[index], quantity });
const read = (role = "a") => request(app).get("/api/cart").auth(tokens[role]!, { type: "bearer" });
const update = (id: number, quantity: number, role = "a") => request(app).put(`/api/cart/${id}`).auth(tokens[role]!, { type: "bearer" }).send({ quantity });
const remove = (id: number, role = "a") => request(app).delete(`/api/cart/${id}`).auth(tokens[role]!, { type: "bearer" });
const clear = (role = "a") => request(app).delete("/api/cart").auth(tokens[role]!, { type: "bearer" });

describe("Cart API with real isolated PostgreSQL", () => {
  beforeAll(async () => {
    const identity = await pool.query<{ name: string }>("SELECT current_database() AS name");
    expect(identity.rows[0]!.name).toBe(process.env.TEST_DATABASE_NAME);
    for (const [key, role] of [["a", "CUSTOMER"], ["b", "CUSTOMER"], ["owner", "RESTAURANT_OWNER"], ["staff", "RESTAURANT_STAFF"], ["admin", "ADMIN"]]) {
      const row = await pool.query<{ id: string }>("INSERT INTO users(name,email,password_hash,role) VALUES('Cart fixture',$1,'unused',$2) RETURNING id", [`cart-${key}-${marker}@example.com`, role]);
      actors[key!] = row.rows[0]!.id;
      tokens[key!] = await createAccessToken(actors[key!]!);
    }
    for (let i = 0; i < 2; i++) {
      const r = await pool.query<{ id: number }>("INSERT INTO restaurants(owner_id,name,address) VALUES($1,$2,'Test') RETURNING id", [actors.owner, `Cart-${marker}-${i}`]);
      restaurantIds.push(r.rows[0]!.id);
      const m = await pool.query<{ id: number }>("INSERT INTO menus(restaurant_id,name,price) VALUES($1,'Nasi',100) RETURNING id", [r.rows[0]!.id]);
      menuIds.push(m.rows[0]!.id);
    }
    const many = await pool.query<{ id: number }>("INSERT INTO menus(restaurant_id,name,price) SELECT $1,'Extra ' || n,1 FROM generate_series(1,50) n RETURNING id", [restaurantIds[0]]);
    extraMenus.push(...many.rows.map((row) => row.id));
  });
  beforeEach(async () => {
    await pool.query("DELETE FROM carts WHERE customer_id=ANY($1::uuid[])", [[actors.a, actors.b]]);
    await pool.query("UPDATE menus SET price=100,available=true,name='Nasi' WHERE id=ANY($1::int[])", [menuIds]);
  });
  afterAll(async () => {
    try {
      await pool.query("DELETE FROM carts WHERE customer_id=ANY($1::uuid[])", [Object.values(actors)]);
      await pool.query("DELETE FROM menus WHERE restaurant_id=ANY($1::int[])", [restaurantIds]);
      await pool.query("DELETE FROM restaurants WHERE id=ANY($1::int[])", [restaurantIds]);
      await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [Object.values(actors)]);
    } finally { await closeDatabase(); }
  });

  it("requires authentication on all five endpoints", async () => {
    for (const method of ["get", "post", "delete"] as const) await request(app)[method]("/api/cart").expect(401);
    for (const method of ["put", "delete"] as const) await request(app)[method]("/api/cart/1").expect(401);
    await request(app).get("/api/cart").auth("invalid", { type: "bearer" }).expect(401);
  });

  it("enforces current customer role and rejects missing identities", async () => {
    for (const role of ["owner", "staff", "admin"]) {
      await read(role).expect(403);
      await add(1, role).expect(403);
      await update(1, 1, role).expect(403);
      await remove(1, role).expect(403);
      await clear(role).expect(403);
    }
    const token = await createAccessToken(randomUUID());
    await request(app).get("/api/cart").auth(token, { type: "bearer" }).expect(401);
    await pool.query("UPDATE users SET role='ADMIN' WHERE id=$1", [actors.a]);
    try { await add().expect(403); } finally { await pool.query("UPDATE users SET role='CUSTOMER' WHERE id=$1", [actors.a]); }
  });

  it("returns the frontend empty-cart shape without creating shopping rows", async () => {
    const response = await read().expect(200);
    expect(cartBody(response)).toEqual({ cart: [], summary: { totalItems: 0, totalPrice: 0, restaurantCount: 0 } });
    expect((await pool.query("SELECT * FROM carts WHERE customer_id=$1", [actors.a])).rowCount).toBe(0);
  });

  it("persists frontend payloads and responses across app instances and connections", async () => {
    const added = await add(2).expect(201);
    expect((added.body as { data: { cartItem: { restaurant: unknown } } }).data.cartItem.restaurant)
      .toEqual({ id: restaurantIds[0], name: `Cart-${marker}-0`, logo: "" });
    const item = itemBody(added);
    expect(item.id).toBeTypeOf("number");
    expect(item).toMatchObject({ quantity: 2, itemTotal: 200, menu: { id: menuIds[0], foodName: "Nasi", price: 100, available: true, image: "", type: "" } });
    const response = await request(createApp()).get("/api/cart").auth(tokens.a!, { type: "bearer" }).expect(200);
    expect(cartBody(response)).toEqual({ cart: [{ restaurant: { id: restaurantIds[0], name: `Cart-${marker}-0`, logo: "" }, items: [item], subtotal: 200 }], summary: { totalItems: 2, totalPrice: 200, restaurantCount: 1 } });
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try { expect((await client.query("SELECT quantity FROM cart_items WHERE id=$1", [item.id])).rows).toEqual([{ quantity: 2 }]); }
    finally { await client.end(); }
  });

  it("rejects forged pricing, ownership, unknown fields and query inputs", async () => {
    const input = { restaurantId: restaurantIds[0], menuId: menuIds[0], quantity: 1 };
    for (const extra of [{ price: 1 }, { total: 1 }, { customerId: actors.b }, { available: true }, { status: "PAID" }])
      await request(app).post("/api/cart").auth(tokens.a!, { type: "bearer" }).send({ ...input, ...extra }).expect(400);
    await request(app).post("/api/cart").auth(tokens.a!, { type: "bearer" }).send({ ...input, menuId: String(menuIds[0]) }).expect(400);
    await request(app).get("/api/cart?customerId=someone").auth(tokens.a!, { type: "bearer" }).expect(400);
    await request(app).delete("/api/cart").auth(tokens.a!, { type: "bearer" }).send({ customerId: actors.b }).expect(400);
    expect(cartBody(await read())).toMatchObject({ summary: { totalItems: 0 } });
  });

  it("bounds quantity and identifiers strictly for POST and PUT", async () => {
    const item = itemBody(await add().expect(201));
    for (const quantity of [0, -1, MAX_QUANTITY + 1, 1.5, "2", null, 1e20]) {
      await request(app).post("/api/cart").auth(tokens.a!, { type: "bearer" }).send({ restaurantId: restaurantIds[0], menuId: menuIds[0], quantity }).expect(400);
      await request(app).put(`/api/cart/${item.id}`).auth(tokens.a!, { type: "bearer" }).send({ quantity }).expect(400);
    }
    for (const id of ["0", "-1", "1.5", "2147483648", "abc", "01"]) await request(app).put(`/api/cart/${id}`).auth(tokens.a!, { type: "bearer" }).send({ quantity: 1 }).expect(400);
    await request(app).put("/api/cart/01").auth(tokens.a!, { type: "bearer" }).send({ quantity: 1 }).expect(400);
    await update(item.id, MAX_QUANTITY).expect(200);
    expect(cartBody(await read()).summary.totalItems).toBe(MAX_QUANTITY);
  });

  it("increments duplicates, preserves item ID and replaces PUT quantity", async () => {
    const first = itemBody(await add(2).expect(201));
    const duplicate = itemBody(await add(3).expect(201));
    expect(duplicate).toMatchObject({ id: first.id, quantity: 5, itemTotal: 500 });
    expect(itemBody(await update(first.id, 4).expect(200))).toMatchObject({ id: first.id, quantity: 4 });
    expect((await pool.query("SELECT * FROM cart_items WHERE customer_id=$1", [actors.a])).rowCount).toBe(1);
  });

  it("hides cross-customer IDs and keeps clear scoped to the caller", async () => {
    const a = itemBody(await add().expect(201));
    const b = itemBody(await add(2, "b").expect(201));
    await update(a.id, 3, "b").expect(404);
    await remove(a.id, "b").expect(404);
    await update(2147483647, 3, "b").expect(404);
    await clear().expect(200);
    expect(cartBody(await read()).cart).toEqual([]);
    expect(cartBody(await read("b")).cart[0]!.items).toEqual([b]);
  });

  it("rejects another restaurant without mutation and allows it after emptying", async () => {
    const first = itemBody(await add().expect(201));
    await add(1, "a", 1).expect(409);
    expect(cartBody(await read()).summary.totalItems).toBe(1);
    await remove(first.id).expect(200);
    await add(1, "a", 1).expect(201);
    expect(cartBody(await read()).cart[0]!.restaurant.id).toBe(restaurantIds[1]);
    await clear().expect(200);
    await add().expect(201);
  });

  it("rejects missing or mismatched catalog IDs", async () => {
    for (const input of [{ restaurantId: restaurantIds[0], menuId: menuIds[1], quantity: 1 }, { restaurantId: 2147483647, menuId: menuIds[0], quantity: 1 }, { restaurantId: restaurantIds[0], menuId: 2147483647, quantity: 1 }])
      await request(app).post("/api/cart").auth(tokens.a!, { type: "bearer" }).send(input).expect(404);
  });

  it("recalculates catalog prices including values beyond int32 line totals", async () => {
    const item = itemBody(await add(MAX_QUANTITY).expect(201));
    await pool.query("UPDATE menus SET price=2147483647,name='Repriced' WHERE id=$1", [menuIds[0]]);
    const current = cartBody(await read().expect(200));
    expect(current.cart[0]!.items[0]).toMatchObject({ id: item.id, itemTotal: 212600881053, menu: { foodName: "Repriced", price: 2147483647 } });
    expect(current.summary.totalPrice).toBe(212600881053);
    expect(Number.isSafeInteger(current.summary.totalPrice)).toBe(true);
    await pool.query("UPDATE menus SET price=0,name='Nasi' WHERE id=$1", [menuIds[0]]);
    expect(itemBody(await update(item.id, 2).expect(200)).itemTotal).toBe(0);
  });

  it("keeps unavailable items visible/removable and blocks add/update", async () => {
    const item = itemBody(await add().expect(201));
    await pool.query("UPDATE menus SET available=false WHERE id=$1", [menuIds[0]]);
    expect(cartBody(await read()).cart[0]!.items[0]!.menu.available).toBe(false);
    await add().expect(409);
    await update(item.id, 2).expect(409);
    await remove(item.id).expect(200);
    await add().expect(409);
    await clear().expect(200);
  });

  it("removes deleted menus through FK cascade and releases restaurant affinity", async () => {
    const m = await pool.query<{ id: number }>("INSERT INTO menus(restaurant_id,name,price) VALUES($1,'Disposable',1) RETURNING id", [restaurantIds[0]]);
    const menuId = m.rows[0]!.id;
    const added = await request(app).post("/api/cart").auth(tokens.a!, { type: "bearer" }).send({ restaurantId: restaurantIds[0], menuId, quantity: 1 }).expect(201);
    await pool.query("DELETE FROM menus WHERE id=$1", [menuId]);
    expect(cartBody(await read()).cart).toEqual([]);
    await update(itemBody(added).id, 2).expect(404);
    await add(1, "a", 1).expect(201);
  });

  it("enforces the 50-line resource bound and reuses freed slots", async () => {
    const responses = await Promise.all(extraMenus.map((menuId) => request(app).post("/api/cart").auth(tokens.a!, { type: "bearer" }).send({ restaurantId: restaurantIds[0], menuId, quantity: 1 })));
    expect(responses.every((response) => response.status === 201)).toBe(true);
    expect(cartBody(await read()).cart[0]!.items).toHaveLength(MAX_CART_LINES);
    await add().expect(409);
    await remove(itemBody(responses[0]!).id).expect(200);
    await add().expect(201);
    expect(cartBody(await read()).cart[0]!.items).toHaveLength(MAX_CART_LINES);
  });

  it("serializes simultaneous duplicate adds with no lost increments", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => add()));
    expect(results.every((response) => response.status === 201)).toBe(true);
    expect(new Set(results.map((response) => itemBody(response).id)).size).toBe(1);
    expect(cartBody(await read()).summary).toEqual({ totalItems: 12, totalPrice: 1200, restaurantCount: 1 });
  });

  it("serializes quantity and restaurant conflicts without partial writes", async () => {
    await add(98).expect(201);
    const quantities = await Promise.all([add(), add()]);
    expect(quantities.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(cartBody(await read()).summary.totalItems).toBe(99);
    await clear().expect(200);
    const restaurants = await Promise.all([add(), add(1, "a", 1)]);
    expect(restaurants.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(cartBody(await read()).summary.restaurantCount).toBe(1);
  });

  it("does not resurrect deleted items during concurrent PUT and clear", async () => {
    const id = itemBody(await add().expect(201)).id;
    const results = await Promise.all([update(id, 5), clear()]);
    expect([200, 404]).toContain(results[0].status);
    expect(results[1].status).toBe(200);
    expect(cartBody(await read()).cart).toEqual([]);
    await clear().expect(200);
    await remove(id).expect(404);
  });

  it("checks committed role revocation while a cart operation is queued", async () => {
    const client = await pool.connect();
    let pending: Promise<request.Response> | undefined;
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [actors.a]);
      pending = add().then((response) => response);
      await client.query("UPDATE users SET role='ADMIN' WHERE id=$1", [actors.a]);
      await client.query("COMMIT");
      expect((await pending).status).toBe(403);
    } finally {
      await client.query("ROLLBACK");
      client.release();
      if (pending) await pending;
      await pool.query("UPDATE users SET role='CUSTOMER' WHERE id=$1", [actors.a]);
    }
    expect(cartBody(await read()).cart).toEqual([]);
  });

  it("observes committed catalog availability when add waits on a catalog writer", async () => {
    const client = await pool.connect();
    let pending: Promise<request.Response> | undefined;
    try {
      await client.query("BEGIN");
      await client.query("UPDATE menus SET available=false WHERE id=$1", [menuIds[0]]);
      pending = add().then((response) => response);
      await client.query("COMMIT");
      expect((await pending).status).toBe(409);
    } finally {
      await client.query("ROLLBACK");
      client.release();
      if (pending) await pending;
    }
    expect(cartBody(await read()).cart).toEqual([]);
  });

  it("enforces PostgreSQL quantity, duplicate, slot and restaurant constraints", async () => {
    const item = itemBody(await add().expect(201));
    for (const quantity of [0, -1, 100]) await expect(pool.query("UPDATE cart_items SET quantity=$1 WHERE id=$2", [quantity, item.id])).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query("UPDATE cart_items SET quantity=$1 WHERE id=$2", [1.5, item.id])).rejects.toMatchObject({ code: "22P02" });
    const insert = "INSERT INTO cart_items(customer_id,restaurant_id,menu_id,quantity,slot) VALUES($1,$2,$3,$4,$5)";
    await expect(pool.query(insert, [actors.a, restaurantIds[0], menuIds[0], 1, 2])).rejects.toMatchObject({ code: "23505" });
    await expect(pool.query(insert, [actors.a, restaurantIds[0], extraMenus[0], 1, 1])).rejects.toMatchObject({ code: "23505" });
    for (const slot of [0, 51]) await expect(pool.query(insert, [actors.a, restaurantIds[0], extraMenus[0], 1, slot])).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query(insert, [actors.a, restaurantIds[0], menuIds[1], 1, 2])).rejects.toMatchObject({ code: "23503" });
    await expect(pool.query(insert, [actors.b, restaurantIds[0], extraMenus[0], 1, 2])).rejects.toMatchObject({ code: "23503" });
    await expect(pool.query("UPDATE carts SET restaurant_id=$1 WHERE customer_id=$2", [restaurantIds[1], actors.a])).rejects.toMatchObject({ code: "23503" });
  });

  it("documents all five routes and records one additive cart migration", async () => {
    expect(Object.keys(openApiDocument.paths["/api/cart"])).toEqual(["get", "post", "delete"]);
    expect(Object.keys(openApiDocument.paths["/api/cart/{id}"])).toEqual(["put", "delete"]);
    expect(openApiDocument.paths["/api/cart"].get.security).toEqual([{ bearerAuth: [] }]);
    expect((await pool.query("SELECT count(*)::int AS count FROM drizzle.cart_migrations")).rows).toEqual([{ count: 1 }]);
  });

  it("never creates orders or payment records", async () => {
    const counts = async () => (await pool.query<{ orders: string; payments: string }>("SELECT (SELECT count(*) FROM orders) AS orders,(SELECT count(*) FROM order_payments) AS payments")).rows;
    const before = await counts();
    const item = itemBody(await add().expect(201));
    await update(item.id, 2).expect(200);
    await remove(item.id).expect(200);
    await add().expect(201);
    await clear().expect(200);
    expect(await counts()).toEqual(before);
  });
});
