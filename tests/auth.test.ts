import request from "supertest";
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { app } from "../src/app.js";
import {
  closeDatabase,
  db,
} from "../src/db/client.js";
import { users } from "../src/db/schema.js";

const PASSWORD = "StrongPassphrase123!";

interface PublicUserBody {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

interface AuthResponseBody {
  success: boolean;
  message: string;
  data: {
    user: PublicUserBody;
    accessToken: string;
  };
}

interface ProfileResponseBody {
  success: boolean;
  message: string;
  data: PublicUserBody;
}

interface ErrorResponseBody {
  success: boolean;
  message: string;
}

function bodyAs<T>(body: unknown): T {
  return body as T;
}

describe("auth and identity", () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it("registers a normalized customer safely", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Sidiq",
        email: "  SIDIQ@example.com ",
        password: PASSWORD,
      });

    expect(response.status).toBe(201);
    const body = bodyAs<AuthResponseBody>(response.body);

    expect(body.data.user).toMatchObject({
      name: "Sidiq",
      email: "sidiq@example.com",
      role: "CUSTOMER",
    });

    expect(
      "password" in body.data.user,
    ).toBe(false);
    expect(
      "passwordHash" in body.data.user,
    ).toBe(false);
    expect(body.data.accessToken).toBeTypeOf("string");
  });

  it("rejects duplicate normalized email", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({
        name: "First",
        email: "user@example.com",
        password: PASSWORD,
      })
      .expect(201);

    const response = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Second",
        email: " USER@example.com ",
        password: PASSWORD,
      });

    expect(response.status).toBe(409);
  });

  it("rejects client-controlled role", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Admin Attempt",
        email: "admin@example.com",
        password: PASSWORD,
        role: "ADMIN",
      });

    expect(response.status).toBe(400);
  });

  it("logs in using normalized email", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({
        name: "Login User",
        email: "login@example.com",
        password: PASSWORD,
      })
      .expect(201);

    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: " LOGIN@example.com ",
        password: PASSWORD,
      });

    expect(response.status).toBe(200);
    const body = bodyAs<AuthResponseBody>(response.body);

    expect(body.data.user.email).toBe(
      "login@example.com",
    );
    expect(body.data.accessToken).toBeTypeOf("string");
  });

  it("uses generic invalid credential responses", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({
        name: "Existing",
        email: "existing@example.com",
        password: PASSWORD,
      })
      .expect(201);

    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({
        email: "existing@example.com",
        password: "WrongPassphrase123!",
      });

    const unknownEmail = await request(app)
      .post("/api/auth/login")
      .send({
        email: "missing@example.com",
        password: "WrongPassphrase123!",
      });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    const wrongBody = bodyAs<ErrorResponseBody>(
      wrongPassword.body,
    );
    const unknownBody = bodyAs<ErrorResponseBody>(
      unknownEmail.body,
    );

    expect(wrongBody).toEqual(unknownBody);
    expect(wrongBody.message).toBe(
      "Invalid email or password",
    );
  });

  it("protects and returns authenticated profile", async () => {
    const registration = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Profile User",
        email: "profile@example.com",
        password: PASSWORD,
      });

    const registrationBody = bodyAs<AuthResponseBody>(
      registration.body,
    );
    const token = registrationBody.data.accessToken;

    await request(app)
      .get("/api/auth/profile")
      .expect(401);

    const response = await request(app)
      .get("/api/auth/profile")
      .set("authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    const body = bodyAs<ProfileResponseBody>(response.body);

    expect(body.data).toMatchObject({
      name: "Profile User",
      email: "profile@example.com",
      role: "CUSTOMER",
    });
    expect(
      "passwordHash" in body.data,
    ).toBe(false);
  });

  it("rejects malformed bearer tokens", async () => {
    await request(app)
      .get("/api/auth/profile")
      .set("authorization", "Bearer definitely-not-a-jwt")
      .expect(401);
  });
});
