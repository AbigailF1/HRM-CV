import type { NextFunction, Request, RequestHandler, Response } from "express";
import rateLimit, { type Options } from "express-rate-limit";

import { env } from "../../../config/env.js";
import { TooManyRequestsError } from "../errors.js";

const passthrough: RequestHandler = (_req, _res, next) => {
  next();
};

const rejectHandler = (_req: Request, _res: Response, next: NextFunction) => {
  next(new TooManyRequestsError("Too many requests. Please try again later."));
};

const createLimiter = (overrides: Partial<Options>): RequestHandler => {
  if (!env.rateLimit.enabled) {
    return passthrough;
  }

  return rateLimit({
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: rejectHandler,
    ...overrides,
  });
};

export const applicationSubmitLimiter = createLimiter({
  windowMs: env.rateLimit.applicationSubmit.windowMs,
  limit: env.rateLimit.applicationSubmit.limit,
});

export const publicReadLimiter = createLimiter({
  windowMs: env.rateLimit.publicRead.windowMs,
  limit: env.rateLimit.publicRead.limit,
});

export const authLimiter = createLimiter({
  windowMs: env.rateLimit.auth.windowMs,
  limit: env.rateLimit.auth.limit,
});
