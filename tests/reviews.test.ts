import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import pg from "pg";
import { app, createApp } from "../src/app.js";
import { pool, closeDatabase } from "../src/db/client.js";
import { createAccessToken } from "../src/modules/auth/token.js";
import { openApiDocument } from "../src/openapi.js";
interface Review { id: number; star: number; comment: string; transactionId?: string; restaurant?: { id: number; name: string; logo: string }; user?: { name: string; avatar: string }; menus: { menuId: number; menuName: string; price: number; quantity: number }[]; createdAt: string; updatedAt: string }
interface Page { reviews: Review[]; pagination: { page: number; limit: number; total: number; totalPages: number }; summary?: { reviewCount: number; averageRating: number } }
const review = (r: { body: unknown }) => (r.body as { data: { review: Review } }).data.review;
const page = (r: { body: unknown }) => (r.body as { data: Page }).data;
const actors: Record<string,string> = {}, tokens: Record<string,string> = {};
let restaurantIds: number[], menuIds: number[], orderId: string;
const payload = () => ({ transactionId: orderId, restaurantId: restaurantIds[0], star: 4, comment: "Great meal", menuIds: [menuIds[0]] });
const create = (body: object = payload(), role = "a") => request(app).post("/api/review").auth(tokens[role]!, { type: "bearer" }).send(body);
const update = (id: number, body: object = { star: 5, comment: "Updated review" }, role = "a") => request(app).put(`/api/review/${id}`).auth(tokens[role]!, { type: "bearer" }).send(body);
const remove = (id: number, role = "a") => request(app).delete(`/api/review/${id}`).auth(tokens[role]!, { type: "bearer" });
const mine = (query = "", role = "a") => request(app).get(`/api/review/my-reviews?${query}`).auth(tokens[role]!, { type: "bearer" });
const publicList = (query = "", id = restaurantIds[0]) => request(app).get(`/api/review/restaurant/${id}?${query}`);
async function purchase(role = "a", status = "COMPLETED") {
  for (const [menuId,quantity] of [[menuIds[0],2],[menuIds[2],1]]) await request(app).post("/api/cart").auth(tokens[role]!, { type: "bearer" }).send({ restaurantId: restaurantIds[0], menuId, quantity }).expect(201);
  const placed = await request(app).post("/api/order/checkout").auth(tokens[role]!, { type: "bearer" }).set("Idempotency-Key", randomUUID()).send({ restaurants: [{ restaurantId: restaurantIds[0], items: [{ menuId: menuIds[0], quantity: 2 }, { menuId: menuIds[2], quantity: 1 }] }], deliveryAddress: "Test Address number 10", phone: "1234567890", paymentMethod: "Mandiri" }).expect(201);
  const id = (placed.body as { data: { transaction: { transactionId: string } } }).data.transaction.transactionId;
  // Synthetic completion is confined to the verified disposable database.
  await pool.query("UPDATE orders SET status=$2,updated_at=now() WHERE id=$1", [id,status]); return id;
}
const count = async () => (await pool.query<{ count: number }>("SELECT count(*)::int count FROM reviews WHERE customer_id=$1", [actors.a])).rows[0]!.count;
describe("Reviews API and real isolated PostgreSQL", () => {
  beforeAll(async () => { expect((await pool.query<{ name: string }>("SELECT current_database() name")).rows[0]!.name).toBe(process.env.TEST_DATABASE_NAME); });
  beforeEach(async () => {
    for (const [key,role] of [["a","CUSTOMER"],["b","CUSTOMER"],["owner","RESTAURANT_OWNER"],["admin","ADMIN"],["staff","RESTAURANT_STAFF"]]) {
      actors[key!] = (await pool.query<{ id: string }>("INSERT INTO users(name,email,password_hash,role) VALUES('Review Customer',$1,'unused',$2) RETURNING id", [`reviews-${randomUUID()}@example.com`,role])).rows[0]!.id;
      tokens[key!] = await createAccessToken(actors[key!]!);
    }
    restaurantIds=[]; menuIds=[];
    for (let i=0;i<2;i++) { const id=(await pool.query<{ id: number }>("INSERT INTO restaurants(owner_id,name,address) VALUES($1,'Review Restaurant','Test') RETURNING id",[actors.owner])).rows[0]!.id; restaurantIds.push(id);
      menuIds.push((await pool.query<{ id: number }>("INSERT INTO menus(restaurant_id,name,price) VALUES($1,'Purchased Nasi',100) RETURNING id",[id])).rows[0]!.id); }
    menuIds.push((await pool.query<{ id: number }>("INSERT INTO menus(restaurant_id,name,price) VALUES($1,'Second menu',50) RETURNING id",[restaurantIds[0]])).rows[0]!.id);
    orderId=await purchase();
  });
  afterAll(async () => { await closeDatabase(); });
  it("requires auth for private routes while restaurant reviews are public", async () => {
    await request(app).post("/api/review").send(payload()).expect(401);
    await request(app).get("/api/review/my-reviews").expect(401);
    for (const method of ["put","delete"] as const) await request(app)[method]("/api/review/1").expect(401);
    await request(app).get("/api/review/my-reviews").auth("invalid",{type:"bearer"}).expect(401);
    expect(page(await publicList().expect(200))).toMatchObject({ reviews: [], summary: { reviewCount:0, averageRating:0 } });
  });
  it("enforces current CUSTOMER roles without an admin or merchant ownership bypass", async () => {
    for (const role of ["owner","staff","admin"]) { await create(payload(),role).expect(403); await mine("",role).expect(403); await update(1,undefined,role).expect(403); await remove(1,role).expect(403); }
    await pool.query("UPDATE users SET role='ADMIN' WHERE id=$1",[actors.a]); await create().expect(403);
    const token=await createAccessToken(randomUUID()); await request(app).get("/api/review/my-reviews").auth(token,{type:"bearer"}).expect(401);
  });
  it("creates the actual frontend shape and persists across instances/connections", async () => {
    const result=review(await create().expect(201));
    expect(result.id).toBeTypeOf("number");
    expect(result).toMatchObject({ star:4, comment:"Great meal", transactionId:orderId, restaurant:{id:restaurantIds[0],name:"Review Restaurant",logo:""}, menus:[{menuId:menuIds[0],menuName:"Purchased Nasi",price:100,quantity:2,type:"",image:""}] });
    const client=new pg.Client({connectionString:process.env.DATABASE_URL}); await client.connect();
    try { expect((await client.query("SELECT customer_id,order_id,star FROM reviews WHERE id=$1",[result.id])).rows).toEqual([{customer_id:actors.a,order_id:orderId,star:4}]); } finally { await client.end(); }
    const response=await request(createApp()).get("/api/review/my-reviews").auth(tokens.a!,{type:"bearer"}).expect(200); expect(page(response).reviews).toEqual([result]);
  });
  it("requires a completed checkout, never cart presence or other order states", async () => {
    for (const status of ["PENDING","CONFIRMED","PREPARING","READY","CANCELLED"]) { await pool.query("UPDATE orders SET status=$2,updated_at=now() WHERE id=$1",[orderId,status]); await create().expect(409); if(status==="CANCELLED") break; }
    expect(await count()).toBe(0);
    const legacy=(await pool.query<{id:string}>("INSERT INTO orders(customer_id,restaurant_id,total_rupiah,status) VALUES($1,$2,0,'COMPLETED') RETURNING id",[actors.a,restaurantIds[0]])).rows[0]!.id;
    await create({...payload(),transactionId:legacy}).expect(404);
  });
  it("rejects foreign orders, restaurant mismatch, missing references and unpurchased menus", async () => {
    await create(payload(),"b").expect(404);
    await create({...payload(),restaurantId:restaurantIds[1]}).expect(404);
    await create({...payload(),transactionId:randomUUID()}).expect(404);
    await create({...payload(),restaurantId:2147483647}).expect(404);
    await create({...payload(),menuIds:[menuIds[1]]}).expect(400); expect(await count()).toBe(0);
  });
  it("validates rating boundaries, comments and strict scalar identifiers", async () => {
    for (const star of [0,6,-1,1.5,"4",null]) { await create({...payload(),star}).expect(400); await update(1,{star,comment:"Text"}).expect(400); }
    for (const comment of ["","   ","x".repeat(2001),null,1]) await create({...payload(),comment}).expect(400);
    for (const extra of [{transactionId:"invalid"},{restaurantId:0},{restaurantId:"1"},{menuIds:[]},{menuIds:[menuIds[0],menuIds[0]]},{menuIds:[0]},{menuIds:Array.from({length:51},(_,i)=>i+1)}]) await create({...payload(),...extra}).expect(400);
    const result=review(await create({...payload(),star:1,comment:"  Good  "}).expect(201)); expect(result.comment).toBe("Good");
    expect(review(await update(result.id).expect(200)).star).toBe(5);
  });
  it("rejects mass assignment and unknown query/body fields", async () => {
    for (const extra of [{customerId:actors.b},{userId:actors.b},{id:1},{deletedAt:null},{createdAt:"today"},{rating:5}]) await create({...payload(),...extra}).expect(400);
    const id=review(await create().expect(201)).id;
    for (const extra of [{customerId:actors.b},{restaurantId:restaurantIds[1]},{transactionId:randomUUID()},{menuIds:[menuIds[2]]},{deletedAt:null}]) await update(id,{star:3,comment:"Edit",...extra}).expect(400);
    await request(app).delete(`/api/review/${id}`).auth(tokens.a!,{type:"bearer"}).send({customerId:actors.b}).expect(400);
    await mine("customerId=other").expect(400); await publicList("unknown=true").expect(400);
  });
  it("prevents duplicates per order but permits another completed purchase", async () => {
    await create().expect(201); await create().expect(409);
    const next=await purchase(); await create({...payload(),transactionId:next}).expect(201); expect(await count()).toBe(2);
  });
  it("serializes concurrent duplicate submissions into one review and selected-menu set", async () => {
    const results=await Promise.all(Array.from({length:8},()=>create())); expect(results.map(r=>r.status).sort()).toEqual([201,409,409,409,409,409,409,409]);
    expect(await count()).toBe(1); expect((await pool.query("SELECT count(*)::int count FROM review_menus m JOIN reviews r ON r.id=m.review_id WHERE r.customer_id=$1",[actors.a])).rows).toEqual([{count:1}]);
  });
  it("hides foreign IDs on update/delete and scopes personal history", async () => {
    const id=review(await create().expect(201)).id; await update(id,undefined,"b").expect(404); await remove(id,"b").expect(404);
    expect(page(await mine("","b").expect(200)).reviews).toEqual([]); expect(page(await mine().expect(200)).reviews).toHaveLength(1);
    await update(2147483647).expect(404); await remove(2147483647).expect(404);
  });
  it("rejects malformed route IDs and unknown restaurant IDs", async () => {
    for (const id of ["0","01","-1","1.5","abc","2147483648"]) { await request(app).get(`/api/review/restaurant/${id}`).expect(400); await request(app).put(`/api/review/${id}`).auth(tokens.a!,{type:"bearer"}).send({star:4,comment:"Test"}).expect(400); }
    await publicList("",2147483647).expect(404);
  });
  it("soft deletes, removes aggregates and keeps the order uniqueness reservation", async () => {
    const id=review(await create().expect(201)).id;
    await remove(id).expect(200); await remove(id).expect(404); await update(id).expect(404); await create().expect(409);
    expect(page(await mine().expect(200)).reviews).toEqual([]);
    expect(page(await publicList().expect(200))).toMatchObject({reviews:[],summary:{reviewCount:0,averageRating:0}});
    expect((await pool.query("SELECT deleted_at IS NOT NULL deleted FROM reviews WHERE id=$1",[id])).rows).toEqual([{deleted:true}]);
  });
  it("aggregates all active ratings independently of page and observes updates/deletes", async () => {
    const a=review(await create({...payload(),star:1}).expect(201)); const bOrder=await purchase("b");
    const b=review(await create({...payload(),transactionId:bOrder,star:4},"b").expect(201));
    expect(page(await publicList("limit=1").expect(200))).toMatchObject({pagination:{total:2},summary:{reviewCount:2,averageRating:2.5}});
    await update(a.id,{star:5,comment:"Better"}).expect(200);
    expect(page(await publicList().expect(200)).summary).toEqual({reviewCount:2,averageRating:4.5});
    await remove(b.id,"b").expect(200); expect(page(await publicList().expect(200)).summary).toEqual({reviewCount:1,averageRating:5});
  });
  it("preserves purchased menu snapshots after catalog changes and omits private public identifiers", async () => {
    await create().expect(201); await pool.query("UPDATE menus SET name='Changed',price=999,available=false WHERE id=$1",[menuIds[0]]);
    const data=page(await publicList().expect(200)); expect(data.reviews[0]!.menus[0]).toMatchObject({menuName:"Purchased Nasi",price:100,quantity:2});
    expect(data.reviews[0]!.user).toEqual({name:"Review Customer",avatar:""}); const text=JSON.stringify(data);
    for(const value of [actors.a!,orderId,"customerId","password","email","deliveryAddress","phone"]) expect(text).not.toContain(value);
    expect(data.reviews[0]).not.toHaveProperty("transactionId"); expect(data.reviews[0]!.user).not.toHaveProperty("id");
  });
  it("paginates deterministically with timestamp ties and validates pagination bounds", async () => {
    const second=await purchase(); const client=await pool.connect(); const ids:number[]=[];
    try { await client.query("BEGIN"); for(const id of [orderId,second]) { const result=await client.query<{id:number}>("INSERT INTO reviews(customer_id,restaurant_id,order_id,star,comment) VALUES($1,$2,$3,3,'Tie') RETURNING id",[actors.a,restaurantIds[0],id]); ids.push(result.rows[0]!.id); await client.query("INSERT INTO review_menus(review_id,menu_id) VALUES($1,$2)",[result.rows[0]!.id,menuIds[0]]); } await client.query("COMMIT"); } finally { await client.query("ROLLBACK"); client.release(); }
    const first=page(await publicList("page=1&limit=1").expect(200)); expect(first.reviews[0]!.id).toBe(ids[1]); expect(first.pagination).toEqual({page:1,limit:1,total:2,totalPages:2});
    expect(page(await publicList("page=2&limit=1").expect(200)).reviews[0]!.id).toBe(ids[0]); expect(page(await publicList("page=99&limit=1").expect(200))).toMatchObject({reviews:[],pagination:{total:2}});
    for(const query of ["page=0","page=01","page=10001","limit=101","limit=-1","page=1&page=2"]) {await publicList(query).expect(400); await mine(query).expect(400);}
  });
  it("serializes update/delete races without resurrecting a deleted review", async () => {
    const id=review(await create().expect(201)).id; const results=await Promise.all([update(id),remove(id)]); expect([200,404]).toContain(results[0].status); expect(results[1].status).toBe(200); expect(page(await publicList().expect(200)).reviews).toEqual([]);
  });
  it("enforces PostgreSQL bounds and immutable ownership/reference/soft-delete identity", async () => {
    const id=review(await create().expect(201)).id;
    for(const query of ["UPDATE reviews SET star=0 WHERE id=$1","UPDATE reviews SET star=6 WHERE id=$1","UPDATE reviews SET comment=' ' WHERE id=$1","UPDATE reviews SET customer_id=gen_random_uuid() WHERE id=$1","UPDATE reviews SET order_id=gen_random_uuid() WHERE id=$1","UPDATE reviews SET restaurant_id=2147483647 WHERE id=$1","DELETE FROM reviews WHERE id=$1"]) await expect(pool.query(query,[id])).rejects.toMatchObject({code:"23514"});
    await expect(pool.query("UPDATE review_menus SET menu_id=$2 WHERE review_id=$1",[id,menuIds[2]])).rejects.toMatchObject({code:"23514"});
    await expect(pool.query("INSERT INTO review_menus(review_id,menu_id) VALUES($1,$2)",[id,menuIds[1]])).rejects.toMatchObject({code:"23514"});
    await expect(pool.query("INSERT INTO review_menus(review_id,menu_id) VALUES($1,$2)",[id,menuIds[0]])).rejects.toMatchObject({code:"23505"});
    await remove(id).expect(200); await expect(pool.query("UPDATE reviews SET deleted_at=NULL WHERE id=$1",[id])).rejects.toMatchObject({code:"23514"});
  });
  it("enforces DB eligibility, uniqueness, foreign keys and deferred nonempty menus", async () => {
    const sql="INSERT INTO reviews(customer_id,restaurant_id,order_id,star,comment) VALUES($1,$2,$3,4,'SQL review') RETURNING id";
    await expect(pool.query(sql,[actors.b,restaurantIds[0],orderId])).rejects.toMatchObject({code:"23514"});
    await expect(pool.query(sql,[actors.a,restaurantIds[0],randomUUID()])).rejects.toMatchObject({code:"23514"});
    await expect(pool.query(sql,[actors.a,restaurantIds[0],orderId])).rejects.toMatchObject({code:"23514"}); // deferred: no selected menus
    expect(await count()).toBe(0); await create().expect(201); await expect(pool.query(sql,[actors.a,restaurantIds[0],orderId])).rejects.toMatchObject({code:"23505"});
    await expect(pool.query("INSERT INTO review_menus(review_id,menu_id) VALUES(2147483647,$1)",[menuIds[0]])).rejects.toMatchObject({code:"23514"});
    const id=review(await update((page(await mine().expect(200)).reviews[0]!.id)).expect(200)).id;
    await expect(pool.query("DELETE FROM review_menus WHERE review_id=$1",[id])).rejects.toMatchObject({code:"23514"});
  });
  it("rolls back review creation if selected-menu persistence fails", async () => {
    await pool.query("CREATE FUNCTION review_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Test review failure'; END; $$");
    await pool.query("CREATE TRIGGER review_test_fail BEFORE INSERT ON review_menus FOR EACH ROW EXECUTE FUNCTION review_test_fail()");
    try { const response=await create().expect(500); expect(JSON.stringify(response.body)).not.toContain("Test review failure"); expect(await count()).toBe(0); }
    finally { await pool.query("DROP TRIGGER review_test_fail ON review_menus"); await pool.query("DROP FUNCTION review_test_fail()"); }
    await create().expect(201);
  });
  it("observes order-state revocation committed while eligibility waits", async () => {
    const client=await pool.connect(); let pending:Promise<request.Response>|undefined;
    try { await client.query("BEGIN"); await client.query("UPDATE orders SET status='PENDING',updated_at=now() WHERE id=$1",[orderId]); pending=create().then(r=>r); await client.query("COMMIT"); expect((await pending).status).toBe(409); }
    finally {await client.query("ROLLBACK"); client.release(); if(pending) await pending;}
    expect(await count()).toBe(0);
  });
  it("documents all five routes and additive migration history", async () => {
    expect(openApiDocument.paths["/api/review"].post.security).toEqual([{bearerAuth:[]}]); expect(openApiDocument.paths["/api/review/restaurant/{restaurantId}"].get.security).toEqual([]);
    expect(Object.keys(openApiDocument.paths["/api/review/{id}"])).toEqual(["put","delete"]);
    expect((await pool.query("SELECT count(*)::int count FROM drizzle.review_migrations")).rows).toEqual([{count:1}]);
  });
});
