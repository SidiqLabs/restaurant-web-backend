import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { openApiDocument } from "../src/openapi.js";

describe("OpenAPI documentation", () => {
  it("serves the OpenAPI document", async () => {
    const response = await request(createApp())
      .get("/api-docs.json")
      .expect(200);

    expect(response.body).toEqual(openApiDocument);

    expect(openApiDocument.openapi).toBe("3.0.3");

    expect(openApiDocument.paths).toHaveProperty(
      "/api/auth/register",
    );
    expect(openApiDocument.paths).toHaveProperty(
      "/api/auth/login",
    );
    expect(openApiDocument.paths).toHaveProperty(
      "/api/auth/profile",
    );

    expect(
      openApiDocument.components.securitySchemes.bearerAuth,
    ).toMatchObject({
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });

    expect(
      openApiDocument.paths["/api/auth/profile"].get.security,
    ).toEqual([{ bearerAuth: [] }]);
  });

  it("serves Swagger UI with a docs-only compatible CSP", async () => {
    const response = await request(createApp())
      .get("/api-docs/")
      .expect(200);

    expect(response.text).toContain("Swagger UI");

    const contentSecurityPolicy =
      response.headers["content-security-policy"];

    expect(contentSecurityPolicy).toContain(
      "script-src 'self' 'unsafe-inline'",
    );
  });

  it("keeps the strict CSP outside Swagger UI", async () => {
    const response = await request(createApp())
      .get("/health")
      .expect(200);

    const contentSecurityPolicy =
      response.headers["content-security-policy"];

    expect(contentSecurityPolicy).toContain(
      "script-src 'self'",
    );
    expect(contentSecurityPolicy).not.toContain(
      "script-src 'self' 'unsafe-inline'",
    );
  });
});
