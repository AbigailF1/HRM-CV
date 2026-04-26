import type { NextFunction, Request, Response } from "express";

import { AppError, isAppError } from "../errors.js";

export const notFoundHandler = (_req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Not found",
    },
  });
};

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const appError =
    error instanceof AppError
      ? error
      : isAppError(error)
        ? error
        : new AppError("Internal server error");

  res.status(appError.statusCode).json({
    error: {
      code: appError.code,
      message: appError.message,
    },
  });
};
