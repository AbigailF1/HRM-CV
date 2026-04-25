import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/hrm?schema=public";
process.env.BETTER_AUTH_SECRET ??= "better-auth-test-secret-1234567890";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

let createApp: typeof import("../src/app.js").createApp;

beforeAll(async () => {
  ({ createApp } = await import("../src/app.ts"));
});

describe("Better Auth", () => {
  it("mounts the auth handler under the Express catch-all route", async () => {
    const response = await request(createApp()).get("/api/auth/get-session");

    expect(response.status).toBe(200);
    expect(response.text).toBe("null");
  });
});
