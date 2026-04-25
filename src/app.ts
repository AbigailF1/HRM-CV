import express from "express";

import { healthRouter } from "./routes/health.js";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";

export const createApp = () => {
  const app = express();

  app.all("/api/auth/{*authRoute}", toNodeHandler(auth));

  app.use(express.json());
  app.use(healthRouter);

  app.use((_req, res) => {
    res.status(404).json({ status: "error", message: "Not found" });
  });

  return app;
};
