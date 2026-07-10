import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

const restoreEnv = () => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, ORIGINAL_ENV);
};

const configureRateLimitEnv = () => {
  process.env.BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET ?? "test-secret";
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://user:pass@localhost:5432/db";
  process.env.RATE_LIMIT_ENABLED = "true";
  process.env.RATE_LIMIT_PUBLIC_READ_WINDOW_MS = "60000";
  process.env.RATE_LIMIT_PUBLIC_READ_LIMIT = "3";
  process.env.RATE_LIMIT_APPLICATION_WINDOW_MS = "60000";
  process.env.RATE_LIMIT_APPLICATION_LIMIT = "2";
};

const createRateLimitTestApp = async () => {
  const { default: express } = await import("express");
  const { errorHandler } = await import("../src/shared/http/middleware/errors");
  const { applicationSubmitLimiter, publicReadLimiter } = await import(
    "../src/shared/http/middleware/rateLimit"
  );

  const app = express();

  app.get("/public", publicReadLimiter, (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.post("/applications", applicationSubmitLimiter, (_req, res) => {
    res.status(201).json({ ok: true });
  });

  app.use(errorHandler);

  return app;
};

beforeEach(() => {
  configureRateLimitEnv();
  vi.resetModules();
});

afterEach(() => {
  vi.resetModules();
  restoreEnv();
});

describe("rate limiting", () => {
  it("returns 429 after exceeding the public read budget", async () => {
    const app = await createRateLimitTestApp();

    for (let i = 0; i < 3; i += 1) {
      const response = await request(app).get("/public");
      expect(response.status).not.toBe(429);
    }

    const rejected = await request(app).get("/public");
    expect(rejected.status).toBe(429);
    expect(rejected.body).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
      },
    });
    expect(rejected.headers["retry-after"]).toBeDefined();
  });

  it("applies the stricter application-submit budget independently", async () => {
    const app = await createRateLimitTestApp();

    for (let i = 0; i < 2; i += 1) {
      const response = await request(app).post("/applications");
      expect(response.status).not.toBe(429);
    }

    const rejected = await request(app).post("/applications");
    expect(rejected.status).toBe(429);
    expect(rejected.body.error.code).toBe("RATE_LIMITED");
  });
});
