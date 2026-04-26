import pino from "pino";

const environment = process.env.NODE_ENV ?? "development";

export const logger = pino({
  level: process.env.LOG_LEVEL?.trim() || "info",
  base: {
    service: "hrm-api",
    environment,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers.set-cookie",
      "*.headers.authorization",
      "*.headers.cookie",
      "*.headers.set-cookie",
    ],
    remove: true,
  },
});

export const isProduction = environment === "production";
