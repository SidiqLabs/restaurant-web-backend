import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../src/app.js";

describe("backend foundation", () => {
  it("returns service health", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Service is healthy",
      data: {
        status: "ok",
      },
    });
    expect(response.headers["x-request-id"]).toBeTypeOf("string");
  });

  it("returns a safe 404 response for unknown routes", async () => {
    const response = await request(app).get("/definitely-not-a-route");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      message: "Route not found",
    });
  });

  it("preserves a valid incoming request id", async () => {
    const response = await request(app)
      .get("/health")
      .set("x-request-id", "foundation-test-request");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe(
      "foundation-test-request",
    );
  });
});
