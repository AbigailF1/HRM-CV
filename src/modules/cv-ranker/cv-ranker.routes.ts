import { Router } from "express";

import { BadRequestError } from "../../shared/http/errors.js";
import { requireAdminSession } from "../../shared/http/middleware/auth.js";
import {
  parseCreateApplicationCvRankJobInput,
  parseCreateCvRankJobInput,
  parseCvRankerRoleType,
  parseGenerateCustomMetricsInput,
  parseUpdateCvRankerRoleConfigInput,
} from "./cv-ranker.schema.js";
import { createCvRankerService } from "./cv-ranker.service.js";
import { getUploadedCvFiles, runCvRankerUpload } from "./cv-ranker.upload.js";
import type { CvRankerRoleTypeValue } from "./cv-ranker.types.js";

const cvRankerService = createCvRankerService();

const getRouteParam = (value: string | string[]) => {
  return Array.isArray(value) ? value[0] : value;
};

const parseStoredRoleType = (value: unknown): Exclude<CvRankerRoleTypeValue, "Custom"> => {
  const roleType = parseCvRankerRoleType(value);

  if (roleType === "Custom") {
    throw new BadRequestError(
      "Custom role does not have a stored default config.",
      "CUSTOM_ROLE_CONFIG_UNSUPPORTED",
    );
  }

  return roleType;
};

export const cvRankerRouter = Router();

cvRankerRouter.get("/admin/cv-ranker/role-configs", requireAdminSession, async (_req, res) => {
  const configs = await cvRankerService.listRoleConfigs();

  return res.status(200).json({ data: configs });
});

cvRankerRouter.get(
  "/admin/cv-ranker/role-configs/:roleType",
  requireAdminSession,
  async (req, res) => {
    const roleType = parseStoredRoleType(getRouteParam(req.params.roleType));
    const config = await cvRankerService.getRoleConfig(roleType);

    return res.status(200).json({ data: config });
  },
);

cvRankerRouter.patch(
  "/admin/cv-ranker/role-configs/:roleType",
  requireAdminSession,
  async (req, res) => {
    const roleType = parseStoredRoleType(getRouteParam(req.params.roleType));
    const input = parseUpdateCvRankerRoleConfigInput(req.body);
    const config = await cvRankerService.updateRoleConfig(roleType, input);

    return res.status(200).json({ data: config });
  },
);

cvRankerRouter.post(
  "/admin/cv-ranker/custom-metrics",
  requireAdminSession,
  async (req, res) => {
    const input = parseGenerateCustomMetricsInput(req.body);
    const metrics = await cvRankerService.generateCustomMetrics(input.jobDescription);

    return res.status(200).json({ data: metrics });
  },
);

cvRankerRouter.post("/admin/cv-ranker/jobs", requireAdminSession, async (req, res) => {
  await runCvRankerUpload(req, res);

  const input = parseCreateCvRankJobInput(req.body);
  const files = getUploadedCvFiles(req);
  const rankJob = await cvRankerService.startRankJob(input, files);

  return res.status(202).json(rankJob);
});

cvRankerRouter.post(
  "/admin/jobs/:id/applications/rank",
  requireAdminSession,
  async (req, res) => {
    const input = parseCreateApplicationCvRankJobInput(req.body);
    const rankJob = await cvRankerService.startApplicationRankJob(
      getRouteParam(req.params.id),
      input,
    );

    return res.status(202).json(rankJob);
  },
);

cvRankerRouter.get("/admin/cv-ranker/jobs/:id", requireAdminSession, async (req, res) => {
  const rankJob = await cvRankerService.getRankJob(getRouteParam(req.params.id));

  return res.status(200).json(rankJob);
});
