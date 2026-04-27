import { Router } from "express";

import { requireAdminSession } from "../../shared/http/middleware/auth.js";
import { sendCreated, sendOk, sendPaginated } from "../../shared/http/response.js";
import {
  parseAdminApplicationsListQuery,
  parseAdminJobsListQuery,
  parseApplicationQuestionResponsesField,
  parseApplyToJobInput,
  parseCreateJobInput,
  parsePatchApplicationInput,
  parseJobsListQuery,
  parseUpdateJobInput,
} from "./jobs.schema.js";
import { createJobsService } from "./jobs.service.js";
import { getUploadedResume, runResumeUpload } from "./jobs.upload.js";

const jobsService = createJobsService();

const getRouteParam = (value: string | string[]) => {
  return Array.isArray(value) ? value[0] : value;
};

export const jobsRouter = Router();

jobsRouter.get("/jobs", async (req, res) => {
  const params = parseJobsListQuery(req.query);
  const result = await jobsService.listPublicJobs(params);

  return sendPaginated(res, result.jobs, result.meta);
});

jobsRouter.get("/jobs/:slug", async (req, res) => {
  const job = await jobsService.getPublicJobBySlug(getRouteParam(req.params.slug));

  return sendOk(res, job);
});

jobsRouter.post("/jobs/:slug/applications", async (req, res) => {
  await runResumeUpload(req, res);

  const input = parseApplyToJobInput({
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    email: req.body.email,
    phone: req.body.phone,
    linkedinUrl: req.body.linkedinUrl,
    portfolioUrl: req.body.portfolioUrl,
    coverLetterText: req.body.coverLetterText,
    questionResponses: parseApplicationQuestionResponsesField(req.body.questionResponses),
  });
  const uploadedResume = getUploadedResume(req);
  const application = await jobsService.applyToJob(
    getRouteParam(req.params.slug),
    input,
    uploadedResume,
  );

  return sendCreated(res, application);
});

jobsRouter.get("/admin/jobs", requireAdminSession, async (req, res) => {
  const params = parseAdminJobsListQuery(req.query);
  const result = await jobsService.listAdminJobs(params);

  return sendPaginated(res, result.jobs, result.meta);
});

jobsRouter.post("/admin/jobs", requireAdminSession, async (req, res) => {
  const input = parseCreateJobInput(req.body);
  const job = await jobsService.createJob(input);

  return sendCreated(res, job);
});

jobsRouter.get("/admin/jobs/:id", requireAdminSession, async (req, res) => {
  const job = await jobsService.getAdminJobById(getRouteParam(req.params.id));

  return sendOk(res, job);
});

jobsRouter.patch("/admin/jobs/:id", requireAdminSession, async (req, res) => {
  const input = parseUpdateJobInput(req.body);
  const job = await jobsService.updateJob(getRouteParam(req.params.id), input);

  return sendOk(res, job);
});

jobsRouter.get("/admin/jobs/:id/applications", requireAdminSession, async (req, res) => {
  const params = parseAdminApplicationsListQuery(req.query);
  const result = await jobsService.listApplicationsForAdminJob(
    getRouteParam(req.params.id),
    params,
  );

  return sendPaginated(res, result.applications, result.meta);
});

jobsRouter.get("/admin/applications/:id", requireAdminSession, async (req, res) => {
  const application = await jobsService.getAdminApplicationById(getRouteParam(req.params.id));

  return sendOk(res, application);
});

jobsRouter.get("/admin/applications/:id/resume", requireAdminSession, async (req, res, next) => {
  try {
    const resume = await jobsService.getAdminApplicationResumeDownload(
      getRouteParam(req.params.id),
    );

    res.attachment(resume.fileName);
    res.type(resume.mimeType || "application/octet-stream");
    res.sendFile(resume.storagePath, (error) => {
      if (error) {
        next(error);
      }
    });
  } catch (error) {
    next(error);
  }
});

jobsRouter.patch("/admin/applications/:id", requireAdminSession, async (req, res) => {
  const input = parsePatchApplicationInput(req.body);
  const application = await jobsService.updateAdminApplication(
    getRouteParam(req.params.id),
    input,
  );

  return sendOk(res, application);
});
