import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { disconnectPrisma } from "../src/lib/prisma";

const describeIfDatabaseConfigured = process.env.DATABASE_URL ? describe : describe.skip;

describeIfDatabaseConfigured("GET /health/db", () => {
  afterAll(async () => {
    await disconnectPrisma();
  });

  it("returns a healthy database payload when the database is reachable", async () => {
    const app = createApp();
    const response = await request(app).get("/health/db");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", database: "up" });
  });
});
