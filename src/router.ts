import { Router } from "express";
import { healthRouter } from "./modules/health/health.js";
import { jobsRouter } from "./modules/jobs/jobs.routes.js";

export const router = Router();

// Register Routes
router.use(healthRouter);
router.use(jobsRouter);
