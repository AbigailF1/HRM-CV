import express from "express";

import { healthRouter } from "./routes/health";

export const createApp = () => {
  const app = express();

  app.use(express.json());
  app.use(healthRouter);

  app.use((_req, res) => {
    res.status(404).json({ status: "error", message: "Not found" });
  });

  return app;
};
