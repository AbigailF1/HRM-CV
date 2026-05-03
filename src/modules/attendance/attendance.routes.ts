import { Router } from "express";

import { requireAdminSession } from "../../shared/http/middleware/auth.js";
import { sendOk } from "../../shared/http/response.js";
import { createMonthlyAttendanceReport } from "./attendance.service.js";
import { getUploadedAttendanceFile, runAttendanceUpload } from "./attendance.upload.js";

export const attendanceRouter = Router();

attendanceRouter.post(
  "/admin/attendance/monthly-report",
  requireAdminSession,
  async (req, res) => {
    await runAttendanceUpload(req, res);

    const attendanceFile = getUploadedAttendanceFile(req);
    const report = await createMonthlyAttendanceReport(attendanceFile);

    return sendOk(res, report);
  },
);
