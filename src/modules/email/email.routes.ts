import { Router } from "express";

import { requireAdminSession } from "../../shared/http/middleware/auth.js";
import { sendCreated, sendOk } from "../../shared/http/response.js";
import { parseCreateBatchEmailInput } from "./email.schema.js";
import { createEmailService } from "./email.service.js";

const emailService = createEmailService();

const getRouteParam = (value: string | string[]) => {
  return Array.isArray(value) ? value[0] : value;
};

export const emailRouter = Router();

emailRouter.get("/admin/email/jobs/:id", requireAdminSession, async (req, res) => {
  const job = await emailService.getEmailJob(getRouteParam(req.params.id));

  return sendOk(res, job);
});

emailRouter.get("/admin/email/jobs/:id/logs", requireAdminSession, async (req, res) => {
  const logs = await emailService.listEmailLogs(getRouteParam(req.params.id));

  return sendOk(res, logs);
});

emailRouter.post("/admin/email/jobs/:id/retry", requireAdminSession, async (req, res) => {
  const job = await emailService.retryEmailJob(getRouteParam(req.params.id));

  return sendOk(res, job);
});

emailRouter.post("/admin/email/batch", requireAdminSession, async (req, res) => {
  const input = parseCreateBatchEmailInput(req.body);
  const result = await emailService.createBatchEmailJobs({
    templateKey: input.template_key,
    users: input.users,
  });

  return sendCreated(res, result);
});
