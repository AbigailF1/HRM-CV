import type { Request, Response } from "express";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "../src/shared/http/errors";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/hrm?schema=public";
process.env.BETTER_AUTH_SECRET ??= "better-auth-test-secret-1234567890";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

let requireAdminSession: typeof import("../src/shared/http/middleware/auth.js").requireAdminSession;

beforeAll(async () => {
  ({ requireAdminSession } = await import("../src/shared/http/middleware/auth.ts"));
});

describe("attendance route auth guard", () => {
  it("passes an UnauthorizedError when no session is present", async () => {
    const next = vi.fn();

    await requireAdminSession({ headers: {} } as Request, {} as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(UnauthorizedError);
  });
});
