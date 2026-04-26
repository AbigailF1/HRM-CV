import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";

describe("GET /health", () => {
  it("returns an ok status payload", async () => {
    const app = createApp();
    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(response.headers["x-request-id"]).toEqual(expect.any(String));
  });

  it("echoes an incoming request id header", async () => {
    const app = createApp();
    const response = await request(app)
      .get("/api/v1/health")
      .set("x-request-id", "health-check-request");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("health-check-request");
  });

  it("returns a request id on not found responses without changing the error shape", async () => {
    const app = createApp();
    const response = await request(app).get("/api/v1/missing-route");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Not found",
      },
    });
    expect(response.headers["x-request-id"]).toEqual(expect.any(String));
  });
});
