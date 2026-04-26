import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";
import { pinoHttp } from "pino-http";

import { logger } from "../../../lib/logger.js";

const getRequestId = (req: Request, res: Response) => {
  const incomingRequestId = req.headers["x-request-id"];
  const requestId =
    typeof incomingRequestId === "string" && incomingRequestId.trim().length > 0
      ? incomingRequestId.trim()
      : randomUUID();

  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  return requestId;
};

export const requestLogger = pinoHttp({
  logger,
  quietReqLogger: true,
  autoLogging: false,
  genReqId: getRequestId,
  customAttributeKeys: {
    req: "request",
    res: "response",
    err: "error",
    responseTime: "durationMs",
  },
  serializers: {
    req: () => undefined,
    res: () => undefined,
    err: (error: Error) => ({
      type: error.name,
      message: error.message,
      stack: error.stack,
    }),
  },
});

export const requestCompletionLogger = (req: Request, res: Response, next: NextFunction) => {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

    req.log[level](
      {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        ip: req.ip,
        userId: req.auth?.user.id,
      },
      "request completed",
    );
  });

  next();
};
