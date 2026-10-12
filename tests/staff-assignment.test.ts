import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { pool, closeDatabase } from "../src/db/client.js";
import { createAccessToken } from "../src/modules/auth/token.js";
import { assignStaff } from "../src/modules/staff/staff.service.js";
import { openApiDocument } from "../src/openapi.js";

const ids: Record<string, string> = {}, tokens: Record<string, string> = {};
let restaurantId: number, foreignRestaurant: number, orderId: string;
const membership = (status = "active", actor = "owner", staff = ids.staff!, restaurant = restaurantId) =>
  request(app).put(`/api/resto/${restaurant}/staff/${staff}`).auth(tokens[actor]!, { type: "bearer" }).send({ status });
const assign = (staffId = ids.staff!, expectedStaffId: string | null = null, actor = "owner", order = orderId) =>
  request(app).put(`/api/order/${order}/staff`).auth(tokens[actor]!, { type: "bearer" }).send({ staffId, expectedStaffId });
const read = (actor = "staff", order = orderId) => request(app).get(`/api/order/${order}/staff`).auth(tokens[actor]!, { type: "bearer" });
async function waitForBlocker(pid: number) {
  for (let i = 0; i < 100; i++) {
    const result = await pool.query<{ waiting: boolean }>("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) waiting", [pid]);
    if (result.rows[0]!.waiting) return;
    await delay(10);
  }
  throw new Error("Expected staff operation to wait on fixture transaction");
}
describe("Staff membership and order assignment", () => {
  beforeAll(async () => {
    expect((await pool.query<{ name: string }>("SELECT current_database() name")).rows[0]!.name).toBe(process.env.TEST_DATABASE_NAME);
  });
  beforeEach(async () => {
    for (const [key, role] of [["owner", "RESTAURANT_OWNER"], ["foreign", "RESTAURANT_OWNER"], ["admin", "ADMIN"], ["staff", "RESTAURANT_STAFF"], ["second", "RESTAURANT_STAFF"], ["customer", "CUSTOMER"]]) {
      ids[key!] = (await pool.query<{ id: string }>("INSERT INTO users(name,email,password_hash,role) VALUES('Staff Actor',$1,'unused',$2) RETURNING id", [`staff-${randomUUID()}@example.com`, role])).rows[0]!.id;
      tokens[key!] = await createAccessToken(ids[key!]!);
    }
    restaurantId = (await pool.query<{ id: number }>("INSERT INTO restaurants(owner_id,name,address) VALUES($1,'Staff Restaurant','Test') RETURNING id", [ids.owner])).rows[0]!.id;
    foreignRestaurant = (await pool.query<{ id: number }>("INSERT INTO restaurants(owner_id,name,address) VALUES($1,'Foreign Restaurant','Test') RETURNING id", [ids.foreign])).rows[0]!.id;
    orderId = (await pool.query<{ id: string }>("INSERT INTO orders(customer_id,restaurant_id,total_rupiah) VALUES($1,$2,100) RETURNING id", [ids.customer, restaurantId])).rows[0]!.id;
  });
  afterAll(closeDatabase);
  it("requires authentication and a current database identity", async () => {
    await request(app).put(`/api/resto/${restaurantId}/staff/${ids.staff}`).send({ status: "active" }).expect(401);
    await request(app).put(`/api/order/${orderId}/staff`).send({ staffId: ids.staff, expectedStaffId: null }).expect(401);
    await request(app).get(`/api/order/${orderId}/staff`).expect(401);
    const token = await createAccessToken(randomUUID());
    await request(app).get(`/api/order/${orderId}/staff`).auth(token, { type: "bearer" }).expect(401);
    await expect(assignStaff(undefined, orderId, { staffId: ids.staff!, expectedStaffId: null })).rejects.toMatchObject({ status: 401 });
  });
  it("allows owner and global admin membership management with unique rows and stable retries", async () => {
    const first = await membership().expect(200);
    const repeat = await membership().expect(200); expect(repeat.body).toEqual(first.body);
    await membership("active", "admin", ids.second).expect(200);
    expect((await pool.query<{ count: number }>("SELECT count(*)::int count FROM restaurant_staff WHERE restaurant_id=$1", [restaurantId])).rows[0]!.count).toBe(2);
  });
  it("denies self-enrollment, self-assignment and customer management", async () => {
    for (const actor of ["staff", "customer"]) { await membership("active", actor).expect(403); await assign(ids.staff, null, actor).expect(403); }
    await membership().expect(200); await assign(ids.staff, null, "staff").expect(403);
  });
  it("hides foreign owner scopes and rejects missing restaurants and orders", async () => {
    await membership("active", "foreign").expect(404);
    await membership("active", "owner", ids.staff, 2147483647).expect(404);
    await membership().expect(200); await assign(ids.staff, null, "foreign").expect(404);
    await assign(ids.staff, null, "admin", randomUUID()).expect(404);
    await read("owner", randomUUID()).expect(404); await read("foreign").expect(404);
  });
  it("rejects nonexistent accounts, non-staff roles and absent membership", async () => {
    await membership("active", "owner", randomUUID()).expect(409);
    await membership("active", "owner", ids.customer).expect(409);
    await assign().expect(409); await assign(randomUUID()).expect(409); await assign(ids.customer).expect(409);
    await membership("revoked").expect(404);
  });
  it("validates strict bodies, UUIDs, restaurant bounds and query input", async () => {
    await membership("inactive").expect(400);
    await membership("active", "owner", "bad").expect(400);
    await membership("active", "owner", ids.staff, -1).expect(400);
    for (const id of ["01", "0x1", "1e0", "1.0", "2147483648"]) await request(app)
      .put(`/api/resto/${id}/staff/${ids.staff}`).auth(tokens.owner!, { type: "bearer" }).send({ status: "active" }).expect(400);
    for (const body of [{ staffId: ids.staff }, { staffId: ids.staff, expectedStaffId: null, restaurantId }, { staffId: "bad", expectedStaffId: null }]) {
      await request(app).put(`/api/order/${orderId}/staff`).auth(tokens.owner!, { type: "bearer" }).send(body).expect(400);
    }
    await request(app).put(`/api/resto/${restaurantId}/staff/${ids.staff}`).auth(tokens.owner!, { type: "bearer" }).send({ status: "active", role: "ADMIN" }).expect(400);
    await request(app).get(`/api/order/${orderId}/staff?restaurantId=1`).auth(tokens.owner!, { type: "bearer" }).expect(400);
  });
  it("assigns and reassigns with live eligibility, scoped reads and timestamp-stable retries", async () => {
    await membership().expect(200); await membership("active", "admin", ids.second).expect(200);
    await read("owner").expect(200, { success: true, data: { assignment: null } });
    const first = await assign().expect(200);
    const repeat = await assign().expect(200); expect(repeat.body).toEqual({ ...(first.body as object), data: { ...(first.body as { data: object }).data, repeated: true } });
    await read().expect(200); await read("second").expect(404); await read("customer").expect(403);
    await assign(ids.second, null).expect(409);
    await assign(ids.second, ids.staff, "admin").expect(200);
    await read().expect(404); await read("second").expect(200);
    await assign(ids.staff, null).expect(409);
  });
  it("rejects membership belonging only to another restaurant", async () => {
    await membership("active", "foreign", ids.staff, foreignRestaurant).expect(200);
    await assign().expect(409); await read().expect(404);
  });
  it("immediately denies revoked membership without deleting assignment or changing order", async () => {
    await membership().expect(200); await assign().expect(200);
    const before = (await pool.query("SELECT * FROM orders WHERE id=$1", [orderId])).rows;
    await membership("revoked").expect(200); await read().expect(404); await assign().expect(409);
    expect((await pool.query("SELECT * FROM orders WHERE id=$1", [orderId])).rows).toEqual(before);
    expect((await pool.query("SELECT staff_id FROM order_staff WHERE order_id=$1", [orderId])).rows).toEqual([{ staff_id: ids.staff }]);
    await membership().expect(200); await read().expect(200);
  });
  it("rechecks current roles and allows revocation after target role removal", async () => {
    await membership().expect(200); await assign().expect(200);
    await pool.query("UPDATE users SET role='CUSTOMER' WHERE id=$1", [ids.staff]);
    await read().expect(403); await assign().expect(409); await membership().expect(409);
    await membership("revoked").expect(200);
    await pool.query("UPDATE users SET role='CUSTOMER' WHERE id=$1", [ids.owner]);
    await membership("active", "owner", ids.second).expect(403); await assign(ids.second).expect(403);
  });
  it("keeps lifecycle STAFF permission denied even when assigned and membership active", async () => {
    await membership().expect(200); await assign().expect(200);
    await request(app).post(`/api/order/${orderId}/status`).auth(tokens.staff!, { type: "bearer" }).send({ expectedStatus: "PENDING", status: "CONFIRMED" }).expect(403);
    expect((await pool.query("SELECT status,total_rupiah FROM orders WHERE id=$1", [orderId])).rows).toEqual([{ status: "PENDING", total_rupiah: 100 }]);
    expect((await pool.query("SELECT * FROM order_payments WHERE order_id=$1", [orderId])).rows).toEqual([]);
  });
  it("does not reopen terminal orders when assigning administrative metadata", async () => {
    await membership().expect(200); await pool.query("UPDATE orders SET status='COMPLETED' WHERE id=$1", [orderId]);
    await assign().expect(200);
    expect((await pool.query("SELECT status FROM orders WHERE id=$1", [orderId])).rows).toEqual([{ status: "COMPLETED" }]);
  });
  it("serializes concurrent initial assignments and rejects stale competing targets", async () => {
    await membership().expect(200); await membership("active", "owner", ids.second).expect(200);
    const responses = await Promise.all([assign(), assign(ids.second)]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    expect((await pool.query("SELECT * FROM order_staff WHERE order_id=$1", [orderId])).rows).toHaveLength(1);
  });
  it("serializes duplicate assignments into one write with exact retries", async () => {
    await membership().expect(200);
    const responses = await Promise.all(Array.from({ length: 4 }, () => assign()));
    expect(responses.map(r => r.status)).toEqual([200, 200, 200, 200]);
    expect(responses.filter(r => !(r.body as { data: { repeated: boolean } }).data.repeated)).toHaveLength(1);
    expect(new Set(responses.map(r => (r.body as { data: { assignment: { updatedAt: string } } }).data.assignment.updatedAt)).size).toBe(1);
  });
  it("enforces database membership and order restaurant relationships", async () => {
    await membership().expect(200);
    await expect(pool.query("INSERT INTO restaurant_staff(restaurant_id,staff_id,status) VALUES($1,$2,'active')", [restaurantId, ids.staff])).rejects.toMatchObject({ code: "23505" });
    await expect(pool.query("UPDATE restaurant_staff SET status='invalid' WHERE restaurant_id=$1", [restaurantId])).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query("INSERT INTO order_staff(order_id,restaurant_id,staff_id) VALUES($1,$2,$3)", [orderId, foreignRestaurant, ids.staff])).rejects.toMatchObject({ code: "23503" });
    await expect(pool.query("INSERT INTO order_staff(order_id,restaurant_id,staff_id) VALUES($1,$2,$3)", [orderId, restaurantId, ids.second])).rejects.toMatchObject({ code: "23503" });
  });
  it("observes membership revocation committed while assignment waits", async () => {
    await membership().expect(200);
    const client = await pool.connect(); let pending: Promise<request.Response> | undefined;
    try {
      await client.query("BEGIN"); const pid = (await client.query<{ pid: number }>("SELECT pg_backend_pid() pid")).rows[0]!.pid;
      await client.query("SELECT id FROM restaurants WHERE id=$1 FOR UPDATE", [restaurantId]);
      await client.query("UPDATE restaurant_staff SET status='revoked' WHERE restaurant_id=$1 AND staff_id=$2", [restaurantId, ids.staff]);
      pending = assign().then(r => r); await waitForBlocker(pid); await client.query("COMMIT");
      expect((await pending).status).toBe(409);
    } finally { await client.query("ROLLBACK"); client.release(); if (pending) await pending; }
    expect((await pool.query("SELECT * FROM order_staff WHERE order_id=$1", [orderId])).rows).toEqual([]);
  });
  it("observes revocation committed while a staff read waits", async () => {
    await membership().expect(200); await assign().expect(200);
    const client = await pool.connect(); let pending: Promise<request.Response> | undefined;
    try {
      await client.query("BEGIN"); const pid = (await client.query<{ pid: number }>("SELECT pg_backend_pid() pid")).rows[0]!.pid;
      await client.query("SELECT id FROM restaurants WHERE id=$1 FOR UPDATE", [restaurantId]);
      await client.query("UPDATE restaurant_staff SET status='revoked' WHERE restaurant_id=$1 AND staff_id=$2", [restaurantId, ids.staff]);
      pending = read().then(r => r); await waitForBlocker(pid); await client.query("COMMIT"); expect((await pending).status).toBe(404);
    } finally { await client.query("ROLLBACK"); client.release(); if (pending) await pending; }
  });
  it("observes owner revocation committed while assignment waits", async () => {
    await membership().expect(200);
    const client = await pool.connect(); let pending: Promise<request.Response> | undefined;
    try {
      await client.query("BEGIN"); const pid = (await client.query<{ pid: number }>("SELECT pg_backend_pid() pid")).rows[0]!.pid;
      await client.query("UPDATE restaurants SET owner_id=$2 WHERE id=$1", [restaurantId, ids.foreign]);
      pending = assign().then(r => r); await waitForBlocker(pid); await client.query("COMMIT"); expect((await pending).status).toBe(404);
    } finally { await client.query("ROLLBACK"); client.release(); if (pending) await pending; }
  });
  it("observes target role revocation committed while assignment waits", async () => {
    await membership().expect(200);
    const client = await pool.connect(); let pending: Promise<request.Response> | undefined;
    try {
      await client.query("BEGIN"); const pid = (await client.query<{ pid: number }>("SELECT pg_backend_pid() pid")).rows[0]!.pid;
      await client.query("UPDATE users SET role='CUSTOMER' WHERE id=$1", [ids.staff]);
      pending = assign().then(r => r); await waitForBlocker(pid); await client.query("COMMIT"); expect((await pending).status).toBe(409);
    } finally { await client.query("ROLLBACK"); client.release(); if (pending) await pending; }
  });
  it("rolls back failed assignment writes and returns safe errors", async () => {
    await membership().expect(200);
    await pool.query("CREATE FUNCTION staff_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Sensitive staff SQL'; END; $$");
    await pool.query("CREATE TRIGGER staff_test_fail AFTER INSERT ON order_staff FOR EACH ROW EXECUTE FUNCTION staff_test_fail()");
    try {
      const result = await assign().expect(500); expect(JSON.stringify(result.body)).not.toContain("Sensitive staff SQL");
      expect((await pool.query("SELECT * FROM order_staff WHERE order_id=$1", [orderId])).rows).toEqual([]);
    } finally { await pool.query("DROP TRIGGER staff_test_fail ON order_staff"); await pool.query("DROP FUNCTION staff_test_fail()"); }
    await assign().expect(200);
  });
  it("documents authentication and has exactly one additive migration", async () => {
    expect(openApiDocument.paths["/api/order/{orderId}/staff"].put.security).toEqual([{ bearerAuth: [] }]);
    expect(openApiDocument.paths["/api/resto/{restaurantId}/staff/{staffId}"].put.security).toEqual([{ bearerAuth: [] }]);
    expect((await pool.query("SELECT count(*)::int count FROM drizzle.staff_migrations")).rows).toEqual([{ count: 1 }]);
  });
});
