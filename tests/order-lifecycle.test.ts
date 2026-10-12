import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, createApp } from "../src/app.js";
import { pool, closeDatabase } from "../src/db/client.js";
import { createAccessToken } from "../src/modules/auth/token.js";
import { nextStatus, transitionOrder } from "../src/modules/lifecycle/lifecycle.service.js";
import type { OrderStatus } from "../src/modules/lifecycle/lifecycle.schema.js";
import { openApiDocument } from "../src/openapi.js";

const actors: Record<string, string> = {}, tokens: Record<string, string> = {};
const settlements: { id: string; token: string }[] = [];
let restaurantId: number, menuId: number, orderId: string;
const move = (expectedStatus: OrderStatus = "PENDING", status: OrderStatus = "CONFIRMED", role = "owner", id = orderId) =>
  request(app).post(`/api/order/${id}/status`).auth(tokens[role]!, { type: "bearer" }).send({ expectedStatus, status });
const state = async () => (await pool.query<{ status: OrderStatus; updated_at: Date }>("SELECT status,updated_at FROM orders WHERE id=$1", [orderId])).rows[0]!;
async function settle() {
  await request(app).post(`/api/order/${orderId}/payment/confirm`).auth(tokens.admin!, { type: "bearer" }).send({ reference: `lifecycle-${randomUUID()}` }).expect(200);
  settlements.push({ id: orderId, token: tokens.admin! });
}
async function complete() {
  for (const [from, to] of Object.entries(nextStatus)) await move(from as OrderStatus, to).expect(200);
}
async function waitForBlocker(pid: number) {
  for (let i = 0; i < 100; i++) {
    const result = await pool.query<{ waiting: boolean }>("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) waiting", [pid]);
    if (result.rows[0]!.waiting) return;
    await delay(10);
  }
  throw new Error("Expected lifecycle request to wait on fixture transaction");
}
describe("Order lifecycle HTTP and isolated PostgreSQL", () => {
  beforeAll(async () => {
    expect((await pool.query<{ name: string }>("SELECT current_database() name")).rows[0]!.name).toBe(process.env.TEST_DATABASE_NAME);
  });
  beforeEach(async () => {
    for (const [key, role] of [["customer", "CUSTOMER"], ["other", "CUSTOMER"], ["owner", "RESTAURANT_OWNER"], ["foreign", "RESTAURANT_OWNER"], ["staff", "RESTAURANT_STAFF"], ["admin", "ADMIN"]]) {
      actors[key!] = (await pool.query<{ id: string }>("INSERT INTO users(name,email,password_hash,role) VALUES('Lifecycle Actor',$1,'unused',$2) RETURNING id", [`lifecycle-${randomUUID()}@example.com`, role])).rows[0]!.id;
      tokens[key!] = await createAccessToken(actors[key!]!);
    }
    restaurantId = (await pool.query<{ id: number }>("INSERT INTO restaurants(owner_id,name,address) VALUES($1,'Lifecycle Restaurant','Test') RETURNING id", [actors.owner])).rows[0]!.id;
    menuId = (await pool.query<{ id: number }>("INSERT INTO menus(restaurant_id,name,price) VALUES($1,'Snapshot Meal',100) RETURNING id", [restaurantId])).rows[0]!.id;
    await request(app).post("/api/cart").auth(tokens.customer!, { type: "bearer" }).send({ restaurantId, menuId, quantity: 2 }).expect(201);
    const placed = await request(app).post("/api/order/checkout").auth(tokens.customer!, { type: "bearer" }).set("Idempotency-Key", randomUUID())
      .send({ restaurants: [{ restaurantId, items: [{ menuId, quantity: 2 }] }], deliveryAddress: "Test address number 10", phone: "1234567890", paymentMethod: "Mandiri" }).expect(201);
    orderId = (placed.body as { data: { transaction: { transactionId: string } } }).data.transaction.transactionId;
  });
  afterAll(async () => {
    // Remove these legitimate synthetic PAID fixtures from best-seller rankings
    // through the existing refund API, never by deleting immutable evidence.
    try {
      for (const { id, token } of settlements) {
        const payment = (await pool.query<{ status: string }>("SELECT status FROM order_payments WHERE order_id=$1", [id])).rows[0];
        if (payment?.status === "PAID") await request(app).post(`/api/order/${id}/payment/refund`).auth(token, { type: "bearer" }).expect(200);
      }
    } finally { await closeDatabase(); }
  });
  it("defines only the existing single-hop fulfillment graph", () => {
    expect(nextStatus).toEqual({ PENDING: "CONFIRMED", CONFIRMED: "PREPARING", PREPARING: "READY", READY: "COMPLETED" });
    expect(nextStatus.COMPLETED).toBeUndefined(); expect(nextStatus.CANCELLED).toBeUndefined();
  });
  it("requires authentication and a current existing actor", async () => {
    await request(app).post(`/api/order/${orderId}/status`).send({ expectedStatus: "PENDING", status: "CONFIRMED" }).expect(401);
    await request(app).post(`/api/order/${orderId}/status`).auth("invalid", { type: "bearer" }).expect(401);
    const token = await createAccessToken(randomUUID());
    await request(app).post(`/api/order/${orderId}/status`).auth(token, { type: "bearer" }).send({ expectedStatus: "PENDING", status: "CONFIRMED" }).expect(401);
    await expect(transitionOrder(undefined, orderId, { expectedStatus: "PENDING", status: "CONFIRMED" })).rejects.toMatchObject({ status: 401 });
  });
  it("denies customers and staff without restaurant assignments", async () => {
    await settle(); for (const role of ["customer", "other", "staff"]) await move(undefined, undefined, role).expect(403);
    expect((await state()).status).toBe("PENDING");
  });
  it("hides foreign restaurant orders from owners and handles missing orders", async () => {
    await settle(); await move(undefined, undefined, "foreign").expect(404);
    for (const role of ["owner", "admin"]) await move(undefined, undefined, role, randomUUID()).expect(404);
  });
  it("validates UUID, exact existing status enums and required expectedStatus", async () => {
    for (const id of ["1", "invalid"]) await request(app).post(`/api/order/${id}/status`).auth(tokens.owner!, { type: "bearer" }).send({ expectedStatus: "PENDING", status: "CONFIRMED" }).expect(400);
    // Nil is a syntactically valid UUID in Zod, but no such order exists.
    await move(undefined, undefined, "owner", "00000000-0000-0000-0000-000000000000").expect(404);
    for (const body of [{}, { status: "CONFIRMED" }, { expectedStatus: "PENDING" }, { expectedStatus: "PENDING", status: "paid" }, { expectedStatus: 1, status: "CONFIRMED" }, { expectedStatus: "pending", status: "CONFIRMED" }]) await request(app).post(`/api/order/${orderId}/status`).auth(tokens.owner!, { type: "bearer" }).send(body).expect(400);
  });
  it("rejects forged ownership, role, settlement, totals and internal fields", async () => {
    for (const extra of [{ role: "ADMIN" }, { ownerId: actors.owner }, { customerId: actors.other }, { restaurantId }, { paymentStatus: "PAID" }, { totalRupiah: 1 }, { updatedAt: "now" }]) await request(app).post(`/api/order/${orderId}/status`).auth(tokens.customer!, { type: "bearer" }).send({ expectedStatus: "PENDING", status: "CONFIRMED", ...extra }).expect(400);
    await request(app).post(`/api/order/${orderId}/status?ownerId=forged`).auth(tokens.owner!, { type: "bearer" }).send({ expectedStatus: "PENDING", status: "CONFIRMED" }).expect(400);
    expect((await state()).status).toBe("PENDING");
  });
  it("rejects current role revocation and forged restaurant ownership", async () => {
    await settle(); await pool.query("UPDATE users SET role='CUSTOMER' WHERE id=$1", [actors.owner]); await move().expect(403);
    await pool.query("UPDATE restaurants SET owner_id=$2 WHERE id=$1", [restaurantId, actors.foreign]); await move(undefined, undefined, "foreign").expect(200);
    await pool.query("UPDATE users SET role='RESTAURANT_OWNER' WHERE id=$1", [actors.owner]); await move().expect(404);
  });
  it("requires PAID evidence even for first fulfillment, never checkout alone", async () => {
    await move().expect(409); await move("READY", "COMPLETED").expect(409);
    expect((await state()).status).toBe("PENDING");
    expect((await pool.query("SELECT * FROM order_payments WHERE order_id=$1", [orderId])).rows).toEqual([]);
  });
  it("rejects skipped, reversed, self and cancellation transitions", async () => {
    await settle();
    for (const [from, to] of [["PENDING", "COMPLETED"], ["PENDING", "PREPARING"], ["PENDING", "PENDING"], ["PENDING", "CANCELLED"], ["CONFIRMED", "PENDING"], ["COMPLETED", "READY"], ["CANCELLED", "CONFIRMED"]] as [OrderStatus, OrderStatus][]) await move(from, to).expect(409);
    expect((await state()).status).toBe("PENDING");
  });
  it("advances an owner's paid order to COMPLETED and supports Reviews eligibility", async () => {
    await request(app).post("/api/review").auth(tokens.customer!, { type: "bearer" }).send({ transactionId: orderId, restaurantId, star: 5, comment: "Complete meal", menuIds: [menuId] }).expect(409);
    await settle(); await complete(); expect((await state()).status).toBe("COMPLETED");
    await request(app).post("/api/review").auth(tokens.customer!, { type: "bearer" }).send({ transactionId: orderId, restaurantId, star: 5, comment: "Complete meal", menuIds: [menuId] }).expect(201);
    const history = await request(createApp()).get("/api/order/my-order").auth(tokens.customer!, { type: "bearer" }).expect(200);
    expect(JSON.stringify(history.body)).toContain(orderId); expect(JSON.stringify(history.body)).toContain("done");
    expect((await pool.query("SELECT status FROM order_payments WHERE order_id=$1", [orderId])).rows).toEqual([{ status: "PAID" }]);
  });
  it("allows explicit ADMIN authority without leaking customer or payment evidence", async () => {
    await settle(); const response = await move(undefined, undefined, "admin").expect(200);
    expect(response.body).toEqual({ success: true, data: { order: { id: orderId, restaurantId, status: "CONFIRMED", paymentStatus: "PAID", updatedAt: (await state()).updated_at.toISOString() }, repeated: false } });
    for (const secret of [actors.customer!, "email", "phone", "password", "reference", "confirmedBy"]) expect(JSON.stringify(response.body)).not.toContain(secret);
  });
  it("makes exact retries idempotent without timestamps changing, rejects older retries", async () => {
    await settle(); await move().expect(200); const before = await state();
    const response = await move().expect(200); expect((response.body as { data: { repeated: boolean } }).data.repeated).toBe(true); expect(await state()).toEqual(before);
    await move("CONFIRMED", "PREPARING").expect(200); await move().expect(409);
    await move("PREPARING", "READY").expect(200); await move("READY", "COMPLETED").expect(200); await move("READY", "COMPLETED").expect(200);
    await move("COMPLETED", "COMPLETED").expect(409);
  });
  it("blocks REFUNDED orders and revalidates repeats after refund", async () => {
    await settle(); await move().expect(200);
    await request(app).post(`/api/order/${orderId}/payment/refund`).auth(tokens.admin!, { type: "bearer" }).expect(200);
    await move().expect(409); await move("CONFIRMED", "PREPARING").expect(409);
    expect((await state()).status).toBe("CONFIRMED");
  });
  it("keeps cancelled orders terminal and leaves existing cancellation semantics intact", async () => {
    await settle(); await request(app).post(`/api/order/${orderId}/cancel`).auth(tokens.admin!, { type: "bearer" }).expect(200); await move().expect(409);
    expect((await state()).status).toBe("CANCELLED");
  });
  it("preserves immutable order/item/checkout snapshots despite catalog changes", async () => {
    const query = "SELECT row_to_json(i) item,row_to_json(c) checkout,o.customer_id,o.restaurant_id,o.total_rupiah,o.created_at FROM orders o JOIN order_items i ON i.order_id=o.id JOIN order_checkouts c ON c.order_id=o.id WHERE o.id=$1";
    const before = (await pool.query(query, [orderId])).rows; await settle();
    await pool.query("UPDATE menus SET name='Repriced',price=999,available=false WHERE id=$1", [menuId]); await complete();
    expect((await pool.query(query, [orderId])).rows).toEqual(before);
    await expect(pool.query("UPDATE order_items SET quantity=3 WHERE order_id=$1", [orderId])).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query("UPDATE orders SET total_rupiah=999 WHERE id=$1", [orderId])).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query("UPDATE orders SET status='INVALID' WHERE id=$1", [orderId])).rejects.toMatchObject({ code: "22P02" });
  });
  it("serializes concurrent duplicate transitions into one update and exact retries", async () => {
    await settle(); const responses = await Promise.all(Array.from({ length: 8 }, () => move()));
    expect(responses.map(r => r.status)).toEqual(Array(8).fill(200));
    expect(responses.filter(r => !(r.body as { data: { repeated: boolean } }).data.repeated)).toHaveLength(1); expect((await state()).status).toBe("CONFIRMED");
  });
  it("rejects stale expectations rather than skipping or overwriting concurrent progress", async () => {
    await settle(); await move().expect(200);
    const responses = await Promise.all([move("CONFIRMED", "PREPARING"), move("CONFIRMED", "READY")]);
    expect(responses.map(r => r.status)).toEqual([200, 409]); expect((await state()).status).toBe("PREPARING");
    await move("PENDING", "CONFIRMED").expect(409); await move("READY", "COMPLETED").expect(409);
  });
  it("rolls back failed writes and returns safe errors, then recovers", async () => {
    await settle(); const before = await state();
    await pool.query("CREATE FUNCTION lifecycle_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Sensitive test SQL failure'; END; $$");
    await pool.query("CREATE TRIGGER lifecycle_test_fail AFTER UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION lifecycle_test_fail()");
    try { const result = await move().expect(500); expect(result.body).toMatchObject({ success: false, message: "Internal server error" }); expect(JSON.stringify(result.body)).not.toContain("Sensitive test SQL failure"); expect(await state()).toEqual(before); }
    finally { await pool.query("DROP TRIGGER lifecycle_test_fail ON orders"); await pool.query("DROP FUNCTION lifecycle_test_fail()"); }
    await move().expect(200);
  });
  it("observes ownership revocation committed while the request waits", async () => {
    await settle(); const client = await pool.connect(); let pending: Promise<request.Response> | undefined;
    try {
      await client.query("BEGIN"); const pid = (await client.query<{ pid: number }>("SELECT pg_backend_pid() pid")).rows[0]!.pid;
      await client.query("UPDATE restaurants SET owner_id=$2 WHERE id=$1", [restaurantId, actors.foreign]); pending = move().then(r => r);
      await waitForBlocker(pid); await client.query("COMMIT"); expect((await pending).status).toBe(404);
    } finally { await client.query("ROLLBACK"); client.release(); if (pending) await pending; }
    expect((await state()).status).toBe("PENDING");
  });
  it("rechecks payment after a concurrent legitimate refund acquires the order lock", async () => {
    await settle(); await move().expect(200); await move("CONFIRMED", "PREPARING").expect(200); await move("PREPARING", "READY").expect(200);
    const client = await pool.connect(); let pending: Promise<request.Response> | undefined;
    try {
      await client.query("BEGIN"); const pid = (await client.query<{ pid: number }>("SELECT pg_backend_pid() pid")).rows[0]!.pid;
      await client.query("SELECT id FROM orders WHERE id=$1 FOR UPDATE", [orderId]);
      await client.query("UPDATE order_payments SET status='REFUNDED',refunded_by=$2,refunded_at=clock_timestamp() WHERE order_id=$1", [orderId, actors.admin]);
      pending = move("READY", "COMPLETED").then(r => r); await waitForBlocker(pid); await client.query("COMMIT"); expect((await pending).status).toBe(409);
    } finally { await client.query("ROLLBACK"); client.release(); if (pending) await pending; }
    expect((await state()).status).toBe("READY");
  });
  it("documents the endpoint and preserves all applied migration streams", async () => {
    expect(openApiDocument.paths["/api/order/{orderId}/status"].post.security).toEqual([{ bearerAuth: [] }]);
    for (const [table, count] of [["__drizzle_migrations", 3], ["payment_migrations", 1], ["cart_migrations", 1], ["checkout_migrations", 1], ["review_migrations", 1]]) expect((await pool.query(`SELECT count(*)::int count FROM drizzle.${table}`)).rows).toEqual([{ count }]);
  });
});
