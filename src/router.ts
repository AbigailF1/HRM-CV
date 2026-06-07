import { Router } from "express";
import { attendanceRouter } from "./modules/attendance/attendance.routes.js";
import { emailRouter } from "./modules/email/email.routes.js";
import { healthRouter } from "./modules/health/health.js";
import { jobsRouter } from "./modules/jobs/jobs.routes.js";

export const router = Router();

// Register Routes
router.use(healthRouter);
router.use(jobsRouter);
router.use(emailRouter);
router.use(attendanceRouter);
