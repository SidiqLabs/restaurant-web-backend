import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { pool, closeDatabase } from "../src/db/client.js";
import { createAccessToken } from "../src/modules/auth/token.js";

type RankingBody = { data: { restaurants: { id: number; soldQuantity: string }[]; pagination: { page: number; limit: number; total: number; totalPages: number } } };
const rankingBody = (response: { body: unknown }) => response.body as RankingBody;
const tokens: Record<string, string> = {};
const actors: Record<string, string> = {};
const restaurantIds: number[] = [];
const menuIds: number[] = [];
const references = () => `test-${randomUUID()}`;
async function order(index: number, quantity: number, status = "PENDING", total = quantity * 100) {
  const result = await pool.query<{ id: string }>("INSERT INTO orders (customer_id,restaurant_id,total_rupiah,status) VALUES ($1,$2,$3,$4) RETURNING id", [actors.CUSTOMER, restaurantIds[index], total, status]);
  const id = result.rows[0]!.id;
  if (quantity > 0) await pool.query("INSERT INTO order_items (order_id,restaurant_id,menu_id,menu_name,unit_price_rupiah,quantity,line_total_rupiah) VALUES ($1,$2,$3,'Snapshot',100,$4,$5)", [id, restaurantIds[index], menuIds[index], quantity, quantity * 100]);
  return id;
}
function payment(id: string, action: string, role = "ADMIN", body: string | object = {}) {
  return request(app).post(`/api/order/${id}/${action === "cancel" ? "cancel" : `payment/${action}`}`).auth(tokens[role]!, { type: "bearer" }).send(body);
}
const confirm = (id: string, reference = references()) => payment(id, "confirm", "ADMIN", { reference });
async function reject(sql: string, values: unknown[], code: string) {
  await expect(pool.query(sql, values)).rejects.toMatchObject({ code });
}

describe("Session 5C.4 isolated PostgreSQL payment and ranking", () => {
  beforeAll(async () => {
    // Fixtures exist only in the authorized disposable DB. Payment evidence
    // deliberately cannot be deleted; never disable its protective triggers.
    for (const role of ["ADMIN", "CUSTOMER", "RESTAURANT_OWNER", "RESTAURANT_STAFF"] as const) {
      const result = await pool.query<{ id: string }>("INSERT INTO users (name,email,password_hash,role) VALUES ('5C4 fixture',$1,'unused',$2) RETURNING id", [`5c4-${randomUUID()}@example.com`, role]);
      actors[role] = result.rows[0]!.id;
      tokens[role] = await createAccessToken(actors[role]);
    }
    for (let i = 0; i < 4; i++) {
      const restaurant = await pool.query<{ id: number }>("INSERT INTO restaurants (owner_id,name,address) VALUES ($1,$2,'Test') RETURNING id", [actors.RESTAURANT_OWNER, `5C4 ${i}`]);
      restaurantIds.push(restaurant.rows[0]!.id);
      const menu = await pool.query<{ id: number }>("INSERT INTO menus (restaurant_id,name,price) VALUES ($1,'Original',100) RETURNING id", [restaurantIds[i]]);
      menuIds.push(menu.rows[0]!.id);
    }
  });
  afterAll(async () => {
    try {
      if (actors.ADMIN) await pool.query("UPDATE order_payments SET status='REFUNDED',refunded_by=$1,refunded_at=now() WHERE confirmed_by=$1 AND status='PAID'", [actors.ADMIN]);
    } finally { await closeDatabase(); }
  });

  it("verifies migration history, constraints and empty ranking", async () => {
    const base = await pool.query<{ count: number }>('SELECT count(*)::integer AS count FROM drizzle.__drizzle_migrations');
    const paymentHistory = await pool.query<{ count: number }>('SELECT count(*)::integer AS count FROM drizzle.payment_migrations');
    expect(base.rows[0]!.count).toBe(3);
    expect(paymentHistory.rows[0]!.count).toBe(1);
    const response = await request(app).get("/api/resto/best-seller").expect(200);
    expect(rankingBody(response).data).toEqual({ restaurants: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  });

  it("enforces authentication, current ADMIN role and strict client validation", async () => {
    const id = await order(0, 1);
    await request(app).post(`/api/order/${id}/payment/confirm`).send({ reference: references() }).expect(401);
    await request(app).post(`/api/order/${id}/payment/confirm`).auth("invalid", { type: "bearer" }).send({ reference: references() }).expect(401);
    for (const role of ["CUSTOMER", "RESTAURANT_OWNER", "RESTAURANT_STAFF"]) {
      for (const action of ["confirm", "refund", "cancel"]) await payment(id, action, role, action === "confirm" ? { reference: references() } : {}).expect(403);
    }
    for (const input of [{ reference: references(), total: 1 }, { reference: references(), status: "PAID" }, { reference: references(), confirmedBy: actors.ADMIN }, { reference: " " }, { reference: "a".repeat(101) }]) await payment(id, "confirm", "ADMIN", input).expect(400);
    await payment("invalid", "confirm", "ADMIN", { reference: references() }).expect(400);
    await confirm(randomUUID()).expect(404);
    await pool.query("UPDATE users SET role='CUSTOMER' WHERE id=$1", [actors.ADMIN]);
    await confirm(id).expect(403);
    await pool.query("UPDATE users SET role='ADMIN' WHERE id=$1", [actors.ADMIN]);
    await reject("INSERT INTO order_payments (order_id,reference,confirmed_by) VALUES ($1,$2,$3)", [id, references(), actors.CUSTOMER], "23514");
  });

  it("rejects empty, inconsistent, zero-total and cancelled purchases", async () => {
    for (const id of [await order(0, 0), await order(0, 2, "PENDING", 1), await order(0, 1, "CANCELLED")]) {
      await confirm(id).expect(409);
      await reject("INSERT INTO order_payments (order_id,reference,confirmed_by) VALUES ($1,$2,$3)", [id, references(), actors.ADMIN], "23514");
    }
    const id = await order(0, 1);
    await payment(id, "refund").expect(409);
    await payment(id, "cancel").expect(200);
    await payment(id, "cancel").expect(409);
    await confirm(id).expect(409);
    await reject("UPDATE orders SET status='PENDING' WHERE id=$1", [id], "23514");
  });

  it("confirms once under concurrency and unique reference conflicts", async () => {
    const id = await order(0, 2);
    const responses = await Promise.all([confirm(id), confirm(id)]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const rows = await pool.query<{ reference: string; refunded_at: Date }>("SELECT * FROM order_payments WHERE order_id=$1", [id]);
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]).toMatchObject({ status: "PAID", confirmed_by: actors.ADMIN, refunded_by: null });
    await confirm(id).expect(409);
    const another = await order(0, 1);
    await confirm(another, rows.rows[0]!.reference).expect(409);
    expect((await pool.query<{ reference: string; refunded_at: Date }>("SELECT * FROM order_payments WHERE order_id=$1", [another])).rowCount).toBe(0);
  });

  it("protects persisted payment evidence and paid purchase facts", async () => {
    const id = await order(0, 3);
    await confirm(id).expect(200);
    for (const [sql, values] of [
      ["UPDATE order_payments SET reference='tampered' WHERE order_id=$1", [id]],
      ["DELETE FROM order_payments WHERE order_id=$1", [id]],
      ["UPDATE orders SET total_rupiah=1 WHERE id=$1", [id]],
      ["UPDATE orders SET restaurant_id=$2 WHERE id=$1", [id, restaurantIds[1]]],
      ["UPDATE order_items SET quantity=99 WHERE order_id=$1", [id]],
      ["DELETE FROM order_items WHERE order_id=$1", [id]],
      ["INSERT INTO order_items (order_id,restaurant_id,menu_id,menu_name,unit_price_rupiah,quantity,line_total_rupiah) VALUES ($1,$2,$3,'Extra',100,1,100)", [id, restaurantIds[0], menuIds[0]]],
    ] as const) await reject(sql, [...values], "23514");
    await pool.query("UPDATE menus SET name='Changed',price=999 WHERE id=$1", [menuIds[0]]);
    const snapshot = await pool.query("SELECT menu_name,unit_price_rupiah,quantity FROM order_items WHERE order_id=$1", [id]);
    expect(snapshot.rows).toEqual([{ menu_name: "Snapshot", unit_price_rupiah: 100, quantity: 3 }]);
    await reject("DELETE FROM orders WHERE id=$1", [id], "23001");
  });

  it("refunds once, keeps audit evidence and excludes refunds and cancellations", async () => {
    const refunded = await order(2, 100);
    await confirm(refunded).expect(200);
    const refunds = await Promise.all([payment(refunded, "refund"), payment(refunded, "refund")]);
    expect(refunds.map((r) => r.status).sort()).toEqual([200, 409]);
    const evidence = await pool.query<{ reference: string; refunded_at: Date }>("SELECT * FROM order_payments WHERE order_id=$1", [refunded]);
    expect(evidence.rows[0]).toMatchObject({ status: "REFUNDED", refunded_by: actors.ADMIN });
    expect(evidence.rows[0]!.refunded_at).toBeInstanceOf(Date);
    await confirm(refunded).expect(409);
    await reject("UPDATE order_payments SET status='PAID',refunded_by=NULL,refunded_at=NULL WHERE order_id=$1", [refunded], "23514");
    const cancelled = await order(3, 200);
    await confirm(cancelled).expect(200);
    await payment(cancelled, "cancel").expect(200);
    const cancellation = await pool.query<{ cancelled_by: string }>("SELECT cancelled_by FROM order_cancellations WHERE order_id=$1", [cancelled]);
    expect(cancellation.rows[0]!.cancelled_by).toBe(actors.ADMIN);
    await reject("DELETE FROM order_cancellations WHERE order_id=$1", [cancelled], "23514");
    await order(2, 999, "COMPLETED");
  });

  it("ranks SUM(quantity) with deterministic numeric ID ties and stable pagination", async () => {
    // Restaurant 0 has two eligible orders totalling 5. Restaurant 1 has one
    // eligible order with 5: order counts must not determine the ranking.
    const tied = await order(1, 5, "COMPLETED");
    await confirm(tied).expect(200);
    await payment(tied, "cancel").expect(409);
    const first = await request(app).get("/api/resto/best-seller?page=1&limit=1").expect(200);
    const second = await request(app).get("/api/resto/best-seller?page=2&limit=1").expect(200);
    expect(rankingBody(first).data.restaurants.map((r: { id: number }) => r.id)).toEqual([restaurantIds[0]]);
    expect(rankingBody(second).data.restaurants.map((r: { id: number }) => r.id)).toEqual([restaurantIds[1]]);
    expect(rankingBody(first).data.restaurants[0]!.soldQuantity).toBe("5");
    expect(rankingBody(second).data.restaurants[0]!.soldQuantity).toBe("5");
    expect(rankingBody(first).data.pagination).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
    const repeated = await request(app).get("/api/resto/best-seller?page=1&limit=1").expect(200);
    expect(repeated.body).toEqual(first.body);
    const beyond = await request(app).get("/api/resto/best-seller?page=3&limit=1").expect(200);
    expect(rankingBody(beyond).data.restaurants).toEqual([]);
    const higher = await order(1, 1);
    await confirm(higher).expect(200);
    const ranked = await request(app).get("/api/resto/best-seller").expect(200);
    expect(rankingBody(ranked).data.restaurants.map((r: { id: number; soldQuantity: string }) => [r.id, r.soldQuantity])).toEqual([[restaurantIds[1], "6"], [restaurantIds[0], "5"]]);
  });

  it("bounds pagination and preserves public catalog routes", async () => {
    for (const query of ["limit=101", "limit=0", "page=0", "page=1&page=2", "sort=total", "paid=true", "limit[x]=1"]) await request(app).get(`/api/resto/best-seller?${query}`).expect(400);
    await request(app).get("/api/resto?limit=1").expect(200);
    await request(app).get("/api/resto/recommended").expect(200);
    await request(app).get("/api/resto/search?q=5C4").expect(200);
    await request(app).get(`/api/resto/${restaurantIds[0]}`).expect(200);
    await request(app).get(`/api/resto/${restaurantIds[0]}/menu`).expect(200);
  });

  it("enforces order storage monetary and relational constraints", async () => {
    const id = await order(3, 1);
    const insert = "INSERT INTO order_items (order_id,restaurant_id,menu_id,menu_name,unit_price_rupiah,quantity,line_total_rupiah) VALUES ($1,$2,$3,$4,$5,$6,$7)";
    for (const values of [["Snapshot", -1, 2, -2], ["Snapshot", 100, 0, 0], ["Snapshot", 100, 2, 1], [" ", 100, 2, 200], ["Snapshot", 2147483647, 2, 1]]) await reject(insert, [id, restaurantIds[3], menuIds[3], ...values], "23514");
    await reject(insert, [id, restaurantIds[2], menuIds[3], "Snapshot", 100, 1, 100], "23503");
    await reject(insert, [id, restaurantIds[3], menuIds[3], "Snapshot", 1.5, 2, 3], "22P02");
    await reject("INSERT INTO orders (customer_id,restaurant_id,total_rupiah) VALUES ($1,$2,-1)", [actors.CUSTOMER, restaurantIds[0]], "23514");
    await reject("UPDATE orders SET status='PAID' WHERE id=$1", [id], "22P02");
  });
});
