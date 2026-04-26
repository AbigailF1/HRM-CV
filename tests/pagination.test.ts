import { describe, expect, it } from "vitest";

import { BadRequestError } from "../src/shared/http/errors";
import { buildPaginationMeta, parsePagination } from "../src/shared/http/pagination";

describe("pagination", () => {
  it("returns default pagination values", () => {
    expect(parsePagination({})).toEqual({
      page: 1,
      pageSize: 20,
      skip: 0,
      take: 20,
    });
  });

  it("caps page size at the configured maximum", () => {
    expect(parsePagination({ pageSize: "500" })).toEqual({
      page: 1,
      pageSize: 100,
      skip: 0,
      take: 100,
    });
  });

  it("throws for invalid pagination input", () => {
    expect(() => parsePagination({ page: "0" })).toThrow(BadRequestError);
  });

  it("builds pagination metadata", () => {
    expect(buildPaginationMeta(2, 10, 45)).toEqual({
      page: 2,
      pageSize: 10,
      totalItems: 45,
      totalPages: 5,
    });
  });
});
