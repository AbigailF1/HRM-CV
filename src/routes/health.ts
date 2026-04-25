import { Router } from "express";

import { getPrisma } from "../lib/prisma.js";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

healthRouter.get("/health/db", async (_req, res) => {
  try {
    const prisma = getPrisma();

    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok", database: "up" });
  } catch (error) {
    console.error("Database health check failed.", error);
    res.status(503).json({ status: "error", database: "down" });
  }
});
