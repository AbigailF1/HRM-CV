import { Router } from "express";
import { cvRankerRouter } from "./modules/cv-ranker/cv-ranker.routes.js";
import { attendanceRouter } from "./modules/attendance/attendance.routes.js";
import { healthRouter } from "./modules/health/health.js";
import { jobsRouter } from "./modules/jobs/jobs.routes.js";

export const router = Router();

// Register Routes
router.use(healthRouter);
router.use(jobsRouter);
router.use(attendanceRouter);
router.use(cvRankerRouter);
