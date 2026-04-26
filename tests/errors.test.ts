import { describe, expect, it } from "vitest";

import { BadRequestError, UnauthorizedError } from "../src/shared/http/errors";

describe("app errors", () => {
  it("maps bad request errors to the expected code and status", () => {
    const error = new BadRequestError("Invalid pagination");

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("BAD_REQUEST");
  });

  it("maps unauthorized errors to the expected code and status", () => {
    const error = new UnauthorizedError();

    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("UNAUTHORIZED");
  });
});
