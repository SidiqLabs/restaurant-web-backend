import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import pg from "pg";
import { app, createApp } from "../src/app.js";
import { pool, closeDatabase } from "../src/db/client.js";
import { createAccessToken } from "../src/modules/auth/token.js";
import { openApiDocument } from "../src/openapi.js";

interface Transaction {
  id: number; transactionId: string; status: string; paymentStatus: string; deliveryAddress: string; phone: string;
  pricing: { subtotal: number; serviceFee: number; deliveryFee: number; totalPrice: number };
  restaurants: { restaurant: { id: number; name: string; logo: string }; items: { menuId: number; menuName: string; price: number; quantity: number; itemTotal: number }[]; subtotal: number }[];
  createdAt: string; updatedAt: string;
}
interface OrderPage { orders: Transaction[]; pagination: { page: number; limit: number; total: number; totalPages: number }; filter: { status: string } }
const transaction = (response: { body: unknown }) => (response.body as { data: { transaction: Transaction } }).data.transaction;
const page = (response: { body: unknown }) => (response.body as { data: OrderPage }).data;
const actors: Record<string, string> = {};
const adminIds: string[] = [];
const tokens: Record<string, string> = {};
let restaurantIds: number[];
let menuIds: number[];
const payload = (items = [{ menuId: menuIds[0]!, quantity: 2 }]) => ({ restaurants: [{ restaurantId: restaurantIds[0], items }], deliveryAddress: "Jalan Test number 10", phone: "+628123456789", paymentMethod: "Mandiri", notes: "No chili" });
const submit = (key: string = randomUUID(), body: object = payload(), role = "a") => request(app).post("/api/order/checkout").auth(tokens[role]!, { type: "bearer" }).set("Idempotency-Key", key).send(body);
const list = (query = "status=all", role = "a") => request(app).get(`/api/order/my-order?${query}`).auth(tokens[role]!, { type: "bearer" });
const add = (menuId = menuIds[0]!, quantity = 2, role = "a", restaurantId = restaurantIds[0]!) => request(app).post("/api/cart").auth(tokens[role]!, { type: "bearer" }).send({ restaurantId, menuId, quantity });
const counts = async () => (await pool.query<{ orders: number; placements: number; items: number; payments: number }>("SELECT (SELECT count(*)::int FROM orders WHERE customer_id=$1) orders,(SELECT count(*)::int FROM order_checkouts WHERE customer_id=$1) placements,(SELECT count(*)::int FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.customer_id=$1) items,(SELECT count(*)::int FROM order_payments p JOIN orders o ON o.id=p.order_id WHERE o.customer_id=$1) payments", [actors.a])).rows[0]!;

describe("Checkout HTTP and isolated PostgreSQL invariants", () => {
  beforeAll(async () => {
    expect((await pool.query<{ name: string }>("SELECT current_database() name")).rows[0]!.name).toBe(process.env.TEST_DATABASE_NAME);
  });
  beforeEach(async () => {
    // Immutable purchase fixtures remain only in the explicitly guarded disposable
    // DB. Each test gets fresh customer/catalog identities; no trigger bypass.
    for (const [key, role] of [["a", "CUSTOMER"], ["b", "CUSTOMER"], ["owner", "RESTAURANT_OWNER"], ["staff", "RESTAURANT_STAFF"], ["admin", "ADMIN"]]) {
      actors[key!] = (await pool.query<{ id: string }>("INSERT INTO users(name,email,password_hash,role) VALUES('Checkout fixture',$1,'unused',$2) RETURNING id", [`checkout-${randomUUID()}@example.com`, role])).rows[0]!.id;
      tokens[key!] = await createAccessToken(actors[key!]!);
    }
    adminIds.push(actors.admin!);
    restaurantIds = []; menuIds = [];
    for (let i = 0; i < 2; i++) {
      const id = (await pool.query<{ id: number }>("INSERT INTO restaurants(owner_id,name,address) VALUES($1,'Snapshot Restaurant','Test') RETURNING id", [actors.owner])).rows[0]!.id;
      restaurantIds.push(id);
      menuIds.push((await pool.query<{ id: number }>("INSERT INTO menus(restaurant_id,name,price) VALUES($1,'Snapshot Nasi',100) RETURNING id", [id])).rows[0]!.id);
    }
    menuIds.push((await pool.query<{ id: number }>("INSERT INTO menus(restaurant_id,name,price) VALUES($1,'Second menu',50) RETURNING id", [restaurantIds[0]])).rows[0]!.id);
  });
  afterAll(async () => {
    try { await pool.query("UPDATE order_payments SET status='REFUNDED',refunded_by=confirmed_by,refunded_at=now() WHERE status='PAID' AND confirmed_by=ANY($1::uuid[])", [adminIds]); } finally { await closeDatabase(); }
  });

  it("requires authentication for checkout and order history", async () => {
    await request(app).post("/api/order/checkout").send(payload()).expect(401);
    await request(app).get("/api/order/my-order").expect(401);
    await request(app).post("/api/order/checkout").auth("invalid", { type: "bearer" }).send(payload()).expect(401);
  });
  it("checks current CUSTOMER role including revocation and missing identities", async () => {
    for (const role of ["owner", "staff", "admin"]) { await submit(randomUUID(), payload(), role).expect(403); await list("", role).expect(403); }
    await pool.query("UPDATE users SET role='ADMIN' WHERE id=$1", [actors.a]);
    await submit().expect(403);
    const token = await createAccessToken(randomUUID());
    await request(app).post("/api/order/checkout").auth(token, { type: "bearer" }).set("Idempotency-Key", randomUUID()).send(payload()).expect(401);
    await request(app).get("/api/order/my-order").auth(token, { type: "bearer" }).expect(401);
  });
  it("persists frontend response shape and atomically consumes cart without payment", async () => {
    await add().expect(201);
    const result = transaction(await submit().expect(201));
    expect(result.id).toBeTypeOf("number");
    expect(result.transactionId).toMatch(/^[a-f0-9-]{36}$/);
    expect(result).toMatchObject({ status: "pending", paymentStatus: "UNPAID", deliveryAddress: "Jalan Test number 10", phone: "+628123456789", pricing: { subtotal: 200, serviceFee: 0, deliveryFee: 0, totalPrice: 200 },
      restaurants: [{ restaurant: { id: restaurantIds[0], name: "Snapshot Restaurant", logo: "" }, items: [{ menuId: menuIds[0], menuName: "Snapshot Nasi", price: 100, quantity: 2, itemTotal: 200 }], subtotal: 200 }] });
    expect(await counts()).toEqual({ orders: 1, placements: 1, items: 1, payments: 0 });
    expect((await pool.query("SELECT * FROM carts WHERE customer_id=$1", [actors.a])).rowCount).toBe(0);
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL }); await client.connect();
    try { expect((await client.query("SELECT status,total_rupiah,customer_id FROM orders WHERE id=$1", [result.transactionId])).rows).toEqual([{ status: "PENDING", total_rupiah: 200, customer_id: actors.a }]); } finally { await client.end(); }
    const read = await request(createApp()).get("/api/order/my-order?status=pending").auth(tokens.a!, { type: "bearer" }).expect(200);
    expect(page(read).orders).toEqual([result]);
  });
  it("consumes only selected items and preserves other customers and lines", async () => {
    await add().expect(201); await add(menuIds[2], 3).expect(201); await add(menuIds[0], 4, "b").expect(201);
    await submit().expect(201);
    expect((await pool.query("SELECT menu_id,quantity FROM cart_items WHERE customer_id=$1", [actors.a])).rows).toEqual([{ menu_id: menuIds[2], quantity: 3 }]);
    expect((await pool.query("SELECT quantity FROM cart_items WHERE customer_id=$1", [actors.b])).rows).toEqual([{ quantity: 4 }]);
    expect((await pool.query("SELECT * FROM carts WHERE customer_id=$1", [actors.a])).rowCount).toBe(1);
  });
  it("rejects an empty cart and a deleted selected menu with no partial order", async () => {
    await submit().expect(409); await add().expect(201);
    await pool.query("DELETE FROM menus WHERE id=$1", [menuIds[0]]);
    await submit().expect(409); expect(await counts()).toEqual({ orders: 0, placements: 0, items: 0, payments: 0 });
  });
  it("rejects other-customer selections and mismatched restaurant/quantity", async () => {
    await add(menuIds[0], 2, "b").expect(201); await submit().expect(409);
    await add(menuIds[2], 1).expect(201); await submit().expect(409);
    await add().expect(201);
    await submit(randomUUID(), { ...payload(), restaurants: [{ restaurantId: restaurantIds[1], items: [{ menuId: menuIds[0], quantity: 2 }] }] }).expect(409);
    await submit(randomUUID(), payload([{ menuId: menuIds[0]!, quantity: 1 }])).expect(409);
    expect((await pool.query("SELECT count(*)::int n FROM cart_items WHERE customer_id=$1", [actors.a])).rows[0]).toEqual({ n: 2 });
    expect((await counts()).orders).toBe(0);
  });
  it("strictly rejects client money, identity, state and unknown fields", async () => {
    await add().expect(201);
    for (const extra of [{ totalPrice: 1 }, { pricing: { totalPrice: 1 } }, { customerId: actors.b }, { paymentSuccess: true }, { status: "PAID" }, { idempotencyKey: randomUUID() }]) await submit(randomUUID(), { ...payload(), ...extra }).expect(400);
    await submit(randomUUID(), payload([{ menuId: menuIds[0]!, quantity: 2, price: 1 } as { menuId: number; quantity: number }])).expect(400);
    await request(app).post("/api/order/checkout?customerId=other").auth(tokens.a!, { type: "bearer" }).set("Idempotency-Key", randomUUID()).send(payload()).expect(400);
    expect((await counts()).orders).toBe(0);
  });
  it("requires bounded idempotency keys and valid delivery/payment fields", async () => {
    await add().expect(201);
    await request(app).post("/api/order/checkout").auth(tokens.a!, { type: "bearer" }).send(payload()).expect(400);
    for (const key of ["short", "a".repeat(129), "invalid key value", "invalid/key/value"]) await submit(key).expect(400);
    for (const extra of [{ deliveryAddress: "tiny" }, { deliveryAddress: "x".repeat(501) }, { phone: "123" }, { phone: "abcdefghijk" }, { phone: "--------" }, { phone: "1".repeat(31) }, { paymentMethod: "PAID" }, { notes: "x".repeat(1001) }]) await submit(randomUUID(), { ...payload(), ...extra }).expect(400);
    expect((await counts()).orders).toBe(0);
  });
  it("rejects duplicate lines, multiple restaurants and invalid quantities/ids", async () => {
    await add().expect(201);
    await submit(randomUUID(), payload([{ menuId: menuIds[0]!, quantity: 2 }, { menuId: menuIds[0]!, quantity: 2 }])).expect(400);
    await submit(randomUUID(), { ...payload(), restaurants: [payload().restaurants[0], { restaurantId: restaurantIds[1], items: [{ menuId: menuIds[1], quantity: 1 }] }] }).expect(400);
    for (const quantity of [0, -1, 100, 1.5, "2", null]) await submit(randomUUID(), payload([{ menuId: menuIds[0]!, quantity: quantity as number }])).expect(400);
    for (const menuId of [0, -1, 2147483648, "1", 1.5]) await submit(randomUUID(), payload([{ menuId: menuId as number, quantity: 2 }])).expect(400);
    for (const restaurants of [[], [{ restaurantId: restaurantIds[0], items: [] }], [{ restaurantId: restaurantIds[0], items: Array.from({ length: 51 }, (_, i) => ({ menuId: i + 1, quantity: 1 })) }]]) await submit(randomUUID(), { ...payload(), restaurants }).expect(400);
  });
  it("uses changed server prices and freezes restaurant/menu snapshots", async () => {
    await add().expect(201);
    await pool.query("UPDATE menus SET price=135,name='Repriced Nasi' WHERE id=$1", [menuIds[0]]);
    const original = transaction(await submit().expect(201));
    expect(original.pricing.totalPrice).toBe(270);
    await pool.query("UPDATE menus SET price=1,name='New catalog name',available=false WHERE id=$1", [menuIds[0]]);
    await pool.query("UPDATE restaurants SET name='New restaurant' WHERE id=$1", [restaurantIds[0]]);
    expect(page(await list().expect(200)).orders).toEqual([original]);
    expect(original.restaurants[0]!.items[0]!.menuName).toBe("Repriced Nasi");
    await expect(pool.query("DELETE FROM menus WHERE id=$1", [menuIds[0]])).rejects.toMatchObject({ code: "23001" });
  });
  it("blocks unavailable selected items and retains all cart rows", async () => {
    await add().expect(201); await add(menuIds[2], 1).expect(201);
    await pool.query("UPDATE menus SET available=false WHERE id=$1", [menuIds[2]]);
    await submit(randomUUID(), payload([{ menuId: menuIds[0]!, quantity: 2 }, { menuId: menuIds[2]!, quantity: 1 }])).expect(409);
    expect((await counts()).orders).toBe(0);
    expect((await pool.query("SELECT count(*)::int n FROM cart_items WHERE customer_id=$1", [actors.a])).rows[0]).toEqual({ n: 2 });
    await submit().expect(201); // An unselected unavailable line is retained.
  });
  it("accepts zero price and quantity 99 without floating point totals", async () => {
    await pool.query("UPDATE menus SET price=0 WHERE id=$1", [menuIds[0]]);
    await add(menuIds[0], 99).expect(201);
    const result = transaction(await submit(randomUUID(), payload([{ menuId: menuIds[0]!, quantity: 99 }])).expect(201));
    expect(result.pricing.totalPrice).toBe(0); expect(result.restaurants[0]!.items[0]!.quantity).toBe(99);
  });
  it("rejects int32 line and aggregate overflow with no consumption", async () => {
    await pool.query("UPDATE menus SET price=2147483647 WHERE id=$1", [menuIds[0]]);
    await add().expect(201); await submit().expect(409);
    await request(app).put(`/api/cart/${(await pool.query<{ id: number }>("SELECT id FROM cart_items WHERE customer_id=$1", [actors.a])).rows[0]!.id}`).auth(tokens.a!, { type: "bearer" }).send({ quantity: 1 }).expect(200);
    await add(menuIds[2], 1).expect(201);
    await submit(randomUUID(), payload([{ menuId: menuIds[0]!, quantity: 1 }, { menuId: menuIds[2]!, quantity: 1 }])).expect(409);
    expect((await counts()).orders).toBe(0);
    const result = transaction(await submit(randomUUID(), payload([{ menuId: menuIds[0]!, quantity: 1 }])).expect(201));
    expect(result.pricing.totalPrice).toBe(2147483647);
  });
  it("replays persisted original response across app instances and later state changes", async () => {
    await add().expect(201); const key = randomUUID(); const original = await submit(key).expect(201);
    const result = transaction(original);
    await pool.query("UPDATE orders SET status='COMPLETED',updated_at=now() WHERE id=$1", [result.transactionId]);
    await pool.query("UPDATE menus SET price=999,available=false WHERE id=$1", [menuIds[0]]);
    const replay = await request(createApp()).post("/api/order/checkout").auth(tokens.a!, { type: "bearer" }).set("Idempotency-Key", key).send(payload()).expect(201);
    expect(replay.body).toEqual(original.body);
    expect(page(await list("status=done").expect(200)).orders[0]!.status).toBe("done");
    expect(await counts()).toEqual({ orders: 1, placements: 1, items: 1, payments: 0 });
  });
  it("rejects reused keys for different intent without touching a new cart", async () => {
    await add().expect(201); const key = randomUUID(); await submit(key).expect(201); await add().expect(201);
    await submit(key, { ...payload(), notes: "Different" }).expect(409);
    await submit(key, { ...payload(), deliveryAddress: "Other Address 123" }).expect(409);
    expect((await pool.query("SELECT quantity FROM cart_items WHERE customer_id=$1", [actors.a])).rows).toEqual([{ quantity: 2 }]);
    await submit(key).expect(201); // Replaying never consumes the new cart.
    expect((await pool.query("SELECT quantity FROM cart_items WHERE customer_id=$1", [actors.a])).rowCount).toBe(1);
    await submit(randomUUID()).expect(201); expect((await counts()).orders).toBe(2);
  });
  it("canonicalizes item ordering and normalized optional input for retries", async () => {
    await add().expect(201); await add(menuIds[2], 1).expect(201); const key = randomUUID();
    const body = payload([{ menuId: menuIds[2]!, quantity: 1 }, { menuId: menuIds[0]!, quantity: 2 }]);
    const original = await submit(key, { ...body, notes: "  No chili  ", deliveryAddress: "  Jalan Test number 10  " }).expect(201);
    const replay = await submit(key, payload([...body.restaurants[0]!.items].reverse())).expect(201);
    expect(replay.body).toEqual(original.body);
  });
  it("namespaces idempotency keys by customer and isolates order histories", async () => {
    const key = randomUUID(); await add().expect(201); await add(menuIds[0], 2, "b").expect(201);
    const a = transaction(await submit(key).expect(201)); const b = transaction(await submit(key, payload(), "b").expect(201));
    expect(a.transactionId).not.toBe(b.transactionId);
    expect(page(await list().expect(200)).orders.map((order) => order.transactionId)).toEqual([a.transactionId]);
    expect(page(await list("status=all", "b").expect(200)).orders.map((order) => order.transactionId)).toEqual([b.transactionId]);
    await list(`status=all&customerId=${actors.b}`).expect(400);
  });
  it("serializes concurrent identical submissions into one persisted order", async () => {
    await add().expect(201); const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 8 }, () => submit(key)));
    expect(results.map((result) => result.status)).toEqual(Array(8).fill(201));
    for (const response of results) expect(response.body).toEqual(results[0]!.body);
    expect(await counts()).toEqual({ orders: 1, placements: 1, items: 1, payments: 0 });
  });
  it("serializes different keys and concurrent conflicting intents", async () => {
    await add().expect(201);
    const differentKeys = await Promise.all([submit(), submit()]); expect(differentKeys.map((result) => result.status).sort()).toEqual([201, 409]);
    await add().expect(201); const key = randomUUID();
    const conflict = await Promise.all([submit(key), submit(key, { ...payload(), notes: "Other intent" })]);
    expect(conflict.map((result) => result.status).sort()).toEqual([201, 409]); expect((await counts()).orders).toBe(2);
  });
  it("serializes checkout against Cart clear without resurrecting rows", async () => {
    await add().expect(201);
    const results = await Promise.all([submit(), request(app).delete("/api/cart").auth(tokens.a!, { type: "bearer" })]);
    expect([201, 409]).toContain(results[0].status); expect(results[1].status).toBe(200);
    expect((await counts()).orders).toBe(results[0].status === 201 ? 1 : 0);
    expect((await pool.query("SELECT * FROM carts WHERE customer_id=$1", [actors.a])).rowCount).toBe(0);
  });
  it("observes committed price and availability changes when catalog locks wait", async () => {
    await add().expect(201); const client = await pool.connect(); let pending: Promise<request.Response> | undefined;
    try {
      await client.query("BEGIN"); await client.query("UPDATE menus SET price=200 WHERE id=$1", [menuIds[0]]);
      pending = submit().then((response) => response); await client.query("COMMIT");
      expect(transaction(await pending).pricing.totalPrice).toBe(400);
      await add().expect(201); await client.query("BEGIN"); await client.query("UPDATE menus SET available=false WHERE id=$1", [menuIds[0]]);
      pending = submit().then((response) => response); await client.query("COMMIT"); expect((await pending).status).toBe(409);
    } finally { await client.query("ROLLBACK"); client.release(); if (pending) await pending; }
  });
  it("rechecks role revocation queued behind the shared customer lock", async () => {
    await add().expect(201); const client = await pool.connect(); let pending: Promise<request.Response> | undefined;
    try { await client.query("BEGIN"); await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [actors.a]);
      pending = submit().then((response) => response); await client.query("UPDATE users SET role='ADMIN' WHERE id=$1", [actors.a]); await client.query("COMMIT"); expect((await pending).status).toBe(403);
    } finally { await client.query("ROLLBACK"); client.release(); if (pending) await pending; }
    expect((await counts()).orders).toBe(0);
  });
  it("rolls back snapshots, placement and cart deletion after late database failure", async () => {
    await add().expect(201); const key = randomUUID();
    // Failure injection exists only in the explicitly guarded disposable DB.
    await pool.query("CREATE FUNCTION checkout_test_fail_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Test rollback'; END; $$");
    await pool.query("CREATE TRIGGER checkout_test_fail_delete BEFORE DELETE ON cart_items FOR EACH ROW EXECUTE FUNCTION checkout_test_fail_delete()");
    try {
      const failed = await submit(key).expect(500); const text = JSON.stringify(failed.body);
      for (const secret of ["Test rollback", "INSERT", "DELETE", "password", "stack", "postgresql"]) expect(text).not.toContain(secret);
      expect(await counts()).toEqual({ orders: 0, placements: 0, items: 0, payments: 0 });
      expect((await pool.query("SELECT quantity FROM cart_items WHERE customer_id=$1", [actors.a])).rows).toEqual([{ quantity: 2 }]);
    } finally { await pool.query("DROP TRIGGER checkout_test_fail_delete ON cart_items"); await pool.query("DROP FUNCTION checkout_test_fail_delete()"); }
    await submit(key).expect(201); expect((await counts()).orders).toBe(1);
  });
  it("enforces immutable placement/order/item facts and database key uniqueness", async () => {
    await add().expect(201); const key = randomUUID(); const result = transaction(await submit(key).expect(201));
    for (const statement of ["UPDATE order_checkouts SET notes='changed' WHERE order_id=$1", "DELETE FROM order_checkouts WHERE order_id=$1", "UPDATE orders SET total_rupiah=1 WHERE id=$1", "UPDATE orders SET customer_id=gen_random_uuid() WHERE id=$1", "UPDATE order_items SET quantity=3 WHERE order_id=$1", "DELETE FROM order_items WHERE order_id=$1"]) await expect(pool.query(statement, [result.transactionId])).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query("INSERT INTO order_items(order_id,restaurant_id,menu_id,menu_name,unit_price_rupiah,quantity,line_total_rupiah) VALUES($1,$2,$3,'Extra',100,1,100)", [result.transactionId, restaurantIds[0], menuIds[0]])).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query("DELETE FROM orders WHERE id=$1", [result.transactionId])).rejects.toMatchObject({ code: "23001" });
    // A valid second order using the same key reaches the UNIQUE constraint.
    const client = await pool.connect();
    try { await client.query("BEGIN"); const id = (await client.query<{ id: string }>("INSERT INTO orders(customer_id,restaurant_id,total_rupiah) VALUES($1,$2,100) RETURNING id", [actors.a, restaurantIds[0]])).rows[0]!.id;
      await client.query("INSERT INTO order_items(order_id,restaurant_id,menu_id,menu_name,unit_price_rupiah,quantity,line_total_rupiah) VALUES($1,$2,$3,'Snapshot',100,1,100)", [id, restaurantIds[0], menuIds[0]]);
      await expect(client.query("INSERT INTO order_checkouts(order_id,customer_id,idempotency_key,request_hash,restaurant_name,delivery_address,phone,payment_method,item_count) VALUES($1,$2,$3,$4,'Snapshot','Test Address 123','12345678','Mandiri',1)", [id, actors.a, key, "a".repeat(64)])).rejects.toMatchObject({ code: "23505" });
    } finally { await client.query("ROLLBACK"); client.release(); }
  });
  it("rejects invalid direct-SQL placement totals, ownership and duplicate snapshots", async () => {
    const client = await pool.connect();
    for (const kind of ["total", "owner", "duplicate", "quantity"]) {
      try { await client.query("BEGIN"); const quantity = kind === "quantity" ? 100 : 1;
        const total = kind === "total" ? 1 : kind === "duplicate" ? 200 : quantity * 100;
        const id = (await client.query<{ id: string }>("INSERT INTO orders(customer_id,restaurant_id,total_rupiah) VALUES($1,$2,$3) RETURNING id", [actors.a, restaurantIds[0], total])).rows[0]!.id;
        const insert = "INSERT INTO order_items(order_id,restaurant_id,menu_id,menu_name,unit_price_rupiah,quantity,line_total_rupiah) VALUES($1,$2,$3,'Snapshot',100,$4,$5)";
        await client.query(insert, [id, restaurantIds[0], menuIds[0], quantity, quantity * 100]);
        if (kind === "duplicate") await client.query(insert, [id, restaurantIds[0], menuIds[0], 1, 100]);
        await expect(client.query("INSERT INTO order_checkouts(order_id,customer_id,idempotency_key,request_hash,restaurant_name,delivery_address,phone,payment_method,item_count) VALUES($1,$2,$3,$4,'Snapshot','Test Address 123','12345678','Mandiri',$5)", [id, kind === "owner" ? actors.b : actors.a, randomUUID(), "a".repeat(64), kind === "duplicate" ? 2 : 1])).rejects.toMatchObject({ code: "23514" });
      } finally { await client.query("ROLLBACK"); }
    }
    client.release();
  });
  it("paginates and maps fulfillment filters without exposing other customers", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) { await add().expect(201); ids.push(transaction(await submit().expect(201)).transactionId); }
    expect(page(await list("status=all&page=1&limit=2").expect(200)).pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect(page(await list("status=all&page=2&limit=2").expect(200)).orders).toHaveLength(1);
    expect(page(await list("status=all&page=99&limit=2").expect(200))).toMatchObject({ orders: [], pagination: { total: 3, totalPages: 2 } });
    expect(page(await list("").expect(200))).toMatchObject({ orders: [], filter: { status: "done" } });
    await pool.query("UPDATE orders SET status='READY',updated_at=now() WHERE id=$1", [ids[0]]);
    await pool.query("UPDATE orders SET status='COMPLETED',updated_at=now() WHERE id=$1", [ids[1]]);
    await pool.query("UPDATE orders SET status='CANCELLED',updated_at=now() WHERE id=$1", [ids[2]]);
    for (const status of ["preparing", "done", "canceled"]) expect(page(await list(`status=${status}`).expect(200)).orders[0]!.status).toBe(status);
    for (const status of ["pending", "on_the_way", "delivered"]) expect(page(await list(`status=${status}`).expect(200)).orders).toEqual([]);
    expect(page(await list("status=all", "b").expect(200)).orders).toEqual([]);
    for (const query of ["page=0", "page=01", "page=10001", "limit=101", "limit=-1", "status=PAID", "page=1&page=2", "unknown=true"]) await list(query).expect(400);
  });
  it("preserves existing manual-payment interoperability and separate states", async () => {
    await add().expect(201); const key = randomUUID(); const original = await submit(key).expect(201); const id = transaction(original).transactionId;
    await request(app).post(`/api/order/${id}/payment/confirm`).auth(tokens.admin!, { type: "bearer" }).send({ reference: `checkout-${randomUUID()}` }).expect(200);
    expect(page(await list("status=pending").expect(200)).orders[0]).toMatchObject({ status: "pending", paymentStatus: "PAID" });
    expect((await submit(key).expect(201)).body).toEqual(original.body);
    await request(app).post(`/api/order/${id}/payment/refund`).auth(tokens.admin!, { type: "bearer" }).send({}).expect(200);
    expect(page(await list().expect(200)).orders[0]!.paymentStatus).toBe("REFUNDED");
  });
  it("documents both frontend routes and records one additive checkout migration", async () => {
    expect(openApiDocument.paths["/api/order/checkout"].post.security).toEqual([{ bearerAuth: [] }]);
    expect(openApiDocument.paths["/api/order/my-order"].get.security).toEqual([{ bearerAuth: [] }]);
    expect((await pool.query("SELECT count(*)::int count FROM drizzle.checkout_migrations")).rows).toEqual([{ count: 1 }]);
  });
});
