import type { NextFunction, Request, Response } from "express";

import { AppError, isAppError } from "../errors.js";
import { logger, isProduction } from "../../../lib/logger.js";

export const notFoundHandler = (req: Request, res: Response) => {
  if (!res.getHeader("x-request-id") && req.requestId) {
    res.setHeader("x-request-id", req.requestId);
  }

  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Not found",
    },
  });
};

export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const appError =
    error instanceof AppError
      ? error
      : isAppError(error)
        ? error
        : new AppError("Internal server error");
  const requestLogger = req.log ?? logger;
  const logPayload = {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode: appError.statusCode,
    errorCode: appError.code,
    err:
      !isProduction || appError.statusCode >= 500
        ? error instanceof Error
          ? error
          : undefined
        : undefined,
  };

  if (!res.getHeader("x-request-id") && req.requestId) {
    res.setHeader("x-request-id", req.requestId);
  }

  if (appError.statusCode >= 500) {
    requestLogger.error(logPayload, appError.message);
  } else {
    requestLogger.warn(logPayload, appError.message);
  }

  res.status(appError.statusCode).json({
    error: {
      code: appError.code,
      message: appError.message,
    },
  });
};
