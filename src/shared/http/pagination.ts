import { BadRequestError } from "./errors.js";
import type { PaginationMeta } from "./response.js";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const parsePositiveInteger = (value: unknown, field: string, fallback: number) => {
  if (value === undefined) {
    return fallback;
  }

  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsedValue = Number(rawValue);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new BadRequestError(`${field} must be a positive integer.`, "INVALID_PAGINATION");
  }

  return parsedValue;
};

export type PaginationInput = {
  page?: unknown;
  pageSize?: unknown;
};

export type PaginationParams = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
};

export const parsePagination = (input: PaginationInput): PaginationParams => {
  const page = parsePositiveInteger(input.page, "page", DEFAULT_PAGE);
  const requestedPageSize = parsePositiveInteger(
    input.pageSize,
    "pageSize",
    DEFAULT_PAGE_SIZE,
  );
  const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
};

export const buildPaginationMeta = (
  page: number,
  pageSize: number,
  totalItems: number,
): PaginationMeta => {
  return {
    page,
    pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
  };
};
