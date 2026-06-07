import { access } from "node:fs/promises";
import { Prisma } from "@prisma/client";

import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { createEmailService, type EmailService } from "../email/email.service.js";
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from "../../shared/http/errors.js";
import { buildPaginationMeta } from "../../shared/http/pagination.js";
import type {
  AdminApplicationsListParams,
  ApplicationDetail,
  ApplicationQuestionResponseDetail,
  AdminJobDetail,
  AdminJobSummary,
  AdminJobsListParams,
  ApplicationQuestionResponseInput,
  ApplicationStatusValue,
  ApplicationSummary,
  ApplyToJobInput,
  CreateJobInput,
  JobQuestionOption,
  JobsListParams,
  PublicJobApplicationSubmission,
  PublicJobDetail,
  PublicJobSummary,
  UploadedResume,
  UpdateJobInput,
} from "./jobs.types.js";
import { deleteSavedResumeFile, resolveResumeStoragePath, saveResumeFile } from "./jobs.upload.js";
import { createJobsRepository } from "./jobs.repository.js";
import type {
  AdminApplicationDetailRecord,
  AdminApplicationResumeRecord,
  AdminApplicationSummaryRecord,
  AdminJobDetailRecord,
  AdminJobRecord,
  ApplicationTargetJobRecord,
  JobsRepository,
  PublicApplicationSubmissionRecord,
  PublicJobDetailRecord,
  PublicJobRecord,
} from "./jobs.repository.js";

export type JobsService = {
  repository: JobsRepository;
  listPublicJobs(params: JobsListParams): Promise<{
    jobs: PublicJobSummary[];
    meta: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
    };
  }>;
  getPublicJobBySlug(slug: string): Promise<PublicJobDetail>;
  listAdminJobs(params: AdminJobsListParams): Promise<{
    jobs: AdminJobSummary[];
    meta: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
    };
  }>;
  getAdminJobById(id: string): Promise<AdminJobDetail>;
  createJob(input: CreateJobInput): Promise<AdminJobDetail>;
  updateJob(id: string, input: UpdateJobInput): Promise<AdminJobDetail>;
  listApplicationsForAdminJob(
    jobId: string,
    params: AdminApplicationsListParams,
  ): Promise<{
    applications: ApplicationSummary[];
    meta: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
    };
  }>;
  getAdminApplicationById(id: string): Promise<ApplicationDetail>;
  getAdminApplicationResumeDownload(id: string): Promise<{
    fileName: string;
    mimeType: string | null;
    storagePath: string;
  }>;
  updateAdminApplication(
    id: string,
    input: {
      status: ApplicationStatusValue;
    },
  ): Promise<ApplicationDetail>;
  applyToJob(
    slug: string,
    input: ApplyToJobInput,
    resume: UploadedResume,
  ): Promise<PublicJobApplicationSubmission>;
};

const isJobQuestionOptions = (value: unknown): value is JobQuestionOption[] => {
  return (
    Array.isArray(value) &&
    value.every(
      (option) =>
        typeof option === "object" &&
        option !== null &&
        "label" in option &&
        "value" in option &&
        typeof option.label === "string" &&
        typeof option.value === "string",
    )
  );
};

const toIsoString = (value: Date | null) => {
  return value?.toISOString() ?? null;
};

const mapPublicJobSummary = (job: PublicJobRecord): PublicJobSummary => {
  return {
    id: job.id,
    title: job.title,
    slug: job.slug,
    description: job.description,
    location: job.location,
    type: job.type,
    status: "open",
    remoteStatus: job.remoteStatus,
    experienceLevel: job.experienceLevel,
    validThrough: toIsoString(job.validThrough),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
};

const mapPublicJobDetail = (job: PublicJobDetailRecord): PublicJobDetail => {
  return {
    ...mapPublicJobSummary(job),
    questions: job.questions.map((question) => ({
      id: question.id,
      type: question.type,
      label: question.label,
      description: question.description,
      required: question.required,
      options: isJobQuestionOptions(question.options) ? question.options : null,
      displayOrder: question.displayOrder,
    })),
  };
};

const mapAdminJobSummary = (job: AdminJobRecord): AdminJobSummary => {
  return {
    id: job.id,
    title: job.title,
    slug: job.slug,
    description: job.description,
    location: job.location,
    type: job.type,
    status: job.status,
    remoteStatus: job.remoteStatus,
    experienceLevel: job.experienceLevel,
    validThrough: toIsoString(job.validThrough),
    autoScoreOnApply: job.autoScoreOnApply,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
};

const mapAdminJobDetail = (job: AdminJobDetailRecord): AdminJobDetail => {
  return {
    ...mapAdminJobSummary(job),
    questions: job.questions.map((question) => ({
      id: question.id,
      type: question.type,
      label: question.label,
      description: question.description,
      required: question.required,
      options: isJobQuestionOptions(question.options) ? question.options : null,
      displayOrder: question.displayOrder,
    })),
    applicationCount: job._count.applications,
  };
};

const mapPublicApplicationSubmission = (
  application: PublicApplicationSubmissionRecord,
): PublicJobApplicationSubmission => {
  return {
    id: application.id,
    status: application.status,
    submittedAt: application.submittedAt?.toISOString() ?? application.createdAt.toISOString(),
    createdAt: application.createdAt.toISOString(),
    job: {
      id: application.job.id,
      slug: application.job.slug,
      title: application.job.title,
    },
    candidate: {
      firstName: application.candidate.firstName,
      lastName: application.candidate.lastName,
      email: application.candidate.email,
    },
  };
};

const mapCandidateSummary = (
  candidate: AdminApplicationSummaryRecord["candidate"],
): ApplicationSummary["candidate"] => {
  return {
    id: candidate.id,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    phone: candidate.phone,
    linkedinUrl: candidate.linkedinUrl,
    portfolioUrl: candidate.portfolioUrl,
  };
};

const mapAdminApplicationSummary = (
  application: AdminApplicationSummaryRecord,
): ApplicationSummary => {
  return {
    id: application.id,
    status: application.status,
    submittedAt: toIsoString(application.submittedAt),
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
    candidate: mapCandidateSummary(application.candidate),
  };
};

const mapApplicationQuestionResponseDetail = (
  response: AdminApplicationDetailRecord["questionResponses"][number],
): ApplicationQuestionResponseDetail => {
  return {
    id: response.id,
    value: response.value,
    createdAt: response.createdAt.toISOString(),
    question: {
      id: response.question.id,
      type: response.question.type,
      label: response.question.label,
      description: response.question.description,
      required: response.question.required,
      options: isJobQuestionOptions(response.question.options) ? response.question.options : null,
      displayOrder: response.question.displayOrder,
    },
  };
};

const mapAdminApplicationDetail = (
  application: AdminApplicationDetailRecord,
): ApplicationDetail => {
  return {
    ...mapAdminApplicationSummary(application),
    job: {
      id: application.job.id,
      slug: application.job.slug,
      title: application.job.title,
      status: application.job.status,
    },
    coverLetterText: application.coverLetterText,
    resumeDownloadUrl: `${env.auth.origin}/api/v1/admin/applications/${application.id}/resume`,
    resumeFileName: application.resumeFileName,
    resumeMimeType: application.resumeMimeType,
    resumeSizeBytes: application.resumeSizeBytes,
    questionResponses: application.questionResponses
      .map(mapApplicationQuestionResponseDetail)
      .sort(
        (left, right) =>
          left.question.displayOrder - right.question.displayOrder ||
          left.createdAt.localeCompare(right.createdAt) ||
          left.id.localeCompare(right.id),
      ),
  };
};

const mapAdminApplicationResumeDownload = async (
  application: AdminApplicationResumeRecord,
) => {
  const storagePath = resolveResumeStoragePath(application.resumeStorageKey);

  try {
    await access(storagePath);
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException).code;

    if (errorCode === "ENOENT") {
      throw new NotFoundError("Resume file not found.", "RESUME_FILE_NOT_FOUND");
    }

    throw error;
  }

  return {
    fileName: application.resumeFileName,
    mimeType: application.resumeMimeType,
    storagePath,
  };
};

const isUniqueConstraintError = (
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
};

const toJobWriteConflict = (error: unknown): never => {
  if (!isUniqueConstraintError(error)) {
    throw error;
  }

  throw new ConflictError("A job with this slug already exists.", "JOB_SLUG_CONFLICT");
};

const toApplicationConflict = (error: unknown): never => {
  if (!isUniqueConstraintError(error)) {
    throw error;
  }

  throw new ConflictError(
    "An application already exists for this candidate and job.",
    "APPLICATION_ALREADY_EXISTS",
  );
};

const allowedApplicationStatusTransitions: Record<
  ApplicationStatusValue,
  readonly ApplicationStatusValue[]
> = {
  new: ["screening", "exam", "interview", "offer", "rejected", "withdrawn"],
  screening: ["exam", "interview", "offer", "rejected", "withdrawn"],
  exam: ["interview", "offer", "rejected", "withdrawn"],
  interview: ["offer", "hired", "rejected", "withdrawn"],
  offer: ["hired", "rejected", "withdrawn"],
  hired: [],
  rejected: [],
  withdrawn: [],
};

type QuestionResponseValue = ApplicationQuestionResponseInput["value"];

const isAnsweredQuestionValue = (value: QuestionResponseValue) => {
  if (value === null) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
};

const assertValidQuestionResponse = (
  question: ApplicationTargetJobRecord["questions"][number],
  value: QuestionResponseValue,
) => {
  switch (question.type) {
    case "short_text":
    case "long_text":
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new ValidationError(
          `Question "${question.label}" requires a text response.`,
          "INVALID_QUESTION_RESPONSE",
        );
      }
      return value.trim();
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new ValidationError(
          `Question "${question.label}" requires a numeric response.`,
          "INVALID_QUESTION_RESPONSE",
        );
      }
      return value;
    case "date":
      if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
        throw new ValidationError(
          `Question "${question.label}" requires a valid date string.`,
          "INVALID_QUESTION_RESPONSE",
        );
      }
      return value;
    case "url":
      if (typeof value !== "string") {
        throw new ValidationError(
          `Question "${question.label}" requires a valid URL.`,
          "INVALID_QUESTION_RESPONSE",
        );
      }

      try {
        return new URL(value).toString();
      } catch {
        throw new ValidationError(
          `Question "${question.label}" requires a valid URL.`,
          "INVALID_QUESTION_RESPONSE",
        );
      }
    case "checkbox":
      if (typeof value !== "boolean") {
        throw new ValidationError(
          `Question "${question.label}" requires a true or false response.`,
          "INVALID_QUESTION_RESPONSE",
        );
      }
      return value;
    case "single_select": {
      const allowedOptions = isJobQuestionOptions(question.options)
        ? new Set(question.options.map((option) => option.value))
        : null;

      if (typeof value !== "string" || !allowedOptions?.has(value)) {
        throw new ValidationError(
          `Question "${question.label}" requires one of the configured options.`,
          "INVALID_QUESTION_RESPONSE",
        );
      }

      return value;
    }
    case "multi_select": {
      const allowedOptions = isJobQuestionOptions(question.options)
        ? new Set(question.options.map((option) => option.value))
        : null;

      if (
        !Array.isArray(value) ||
        value.length === 0 ||
        value.some((option) => typeof option !== "string" || !allowedOptions?.has(option))
      ) {
        throw new ValidationError(
          `Question "${question.label}" requires one or more configured options.`,
          "INVALID_QUESTION_RESPONSE",
        );
      }

      return value;
    }
  }
};

const validateApplicationQuestionResponses = (
  job: ApplicationTargetJobRecord,
  input: ApplyToJobInput,
) => {
  const responsesByQuestionId = new Map<string, QuestionResponseValue>();

  for (const response of input.questionResponses ?? []) {
    if (responsesByQuestionId.has(response.questionId)) {
      throw new ValidationError(
        "Duplicate question responses are not allowed.",
        "DUPLICATE_QUESTION_RESPONSE",
      );
    }

    responsesByQuestionId.set(response.questionId, response.value);
  }

  const validatedResponses: Array<{
    questionId: string;
    value: Prisma.InputJsonValue;
  }> = [];

  for (const question of job.questions) {
    const submittedValue = responsesByQuestionId.get(question.id);

    if (question.required && !isAnsweredQuestionValue(submittedValue ?? null)) {
      throw new ValidationError(
        `Question "${question.label}" is required.`,
        "MISSING_REQUIRED_QUESTION_RESPONSE",
      );
    }

    if (!responsesByQuestionId.has(question.id) || !isAnsweredQuestionValue(submittedValue ?? null)) {
      continue;
    }

    validatedResponses.push({
      questionId: question.id,
      value: assertValidQuestionResponse(question, submittedValue ?? null),
    });
  }

  for (const questionId of responsesByQuestionId.keys()) {
    if (!job.questions.some((question) => question.id === questionId)) {
      throw new ValidationError(
        "One or more question responses reference an unknown job question.",
        "UNKNOWN_JOB_QUESTION",
      );
    }
  }

  return validatedResponses;
};

export const createJobsService = (
  repository: JobsRepository = createJobsRepository(),
  emailService: EmailService = createEmailService(),
): JobsService => {
  return {
    repository,
    async listPublicJobs(params) {
      const { jobs, totalItems } = await repository.listPublicJobs(params);

      return {
        jobs: jobs.map(mapPublicJobSummary),
        meta: buildPaginationMeta(params.page, params.pageSize, totalItems),
      };
    },
    async getPublicJobBySlug(slug) {
      const job = await repository.findPublicJobBySlug(slug);

      if (!job) {
        throw new NotFoundError("Job not found.");
      }

      return mapPublicJobDetail(job);
    },
    async listAdminJobs(params) {
      const { jobs, totalItems } = await repository.listAdminJobs(params);

      return {
        jobs: jobs.map(mapAdminJobSummary),
        meta: buildPaginationMeta(params.page, params.pageSize, totalItems),
      };
    },
    async getAdminJobById(id) {
      const job = await repository.findAdminJobById(id);

      if (!job) {
        throw new NotFoundError("Job not found.");
      }

      return mapAdminJobDetail(job);
    },
    async createJob(input) {
      try {
        const job = await repository.createJob(input);
        return mapAdminJobDetail(job);
      } catch (error) {
        return toJobWriteConflict(error);
      }
    },
    async updateJob(id, input) {
      try {
        const job = await repository.updateJob(id, input);

        if (!job) {
          throw new NotFoundError("Job not found.");
        }

        return mapAdminJobDetail(job);
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw error;
        }

        return toJobWriteConflict(error);
      }
    },
    async listApplicationsForAdminJob(jobId, params) {
      const job = await repository.findAdminJobById(jobId);

      if (!job) {
        throw new NotFoundError("Job not found.");
      }

      const { applications, totalItems } = await repository.listApplicationsForAdminJob(
        jobId,
        params,
      );

      return {
        applications: applications.map(mapAdminApplicationSummary),
        meta: buildPaginationMeta(params.page, params.pageSize, totalItems),
      };
    },
    async getAdminApplicationById(id) {
      const application = await repository.findAdminApplicationById(id);

      if (!application) {
        throw new NotFoundError("Application not found.");
      }

      return mapAdminApplicationDetail(application);
    },
    async getAdminApplicationResumeDownload(id) {
      const application = await repository.findAdminApplicationResumeById(id);

      if (!application) {
        throw new NotFoundError("Application not found.");
      }

      return mapAdminApplicationResumeDownload(application);
    },
    async updateAdminApplication(id, input) {
      const existingApplication = await repository.findAdminApplicationById(id);

      if (!existingApplication) {
        throw new NotFoundError("Application not found.");
      }

      if (existingApplication.status === input.status) {
        return mapAdminApplicationDetail(existingApplication);
      }

      if (!allowedApplicationStatusTransitions[existingApplication.status].includes(input.status)) {
        throw new BadRequestError(
          `Application status cannot change from ${existingApplication.status} to ${input.status}.`,
          "INVALID_APPLICATION_STATUS_TRANSITION",
        );
      }

      const updatedApplication = await repository.updateAdminApplicationStatus(id, input.status);

      if (!updatedApplication) {
        throw new NotFoundError("Application not found.");
      }

      try {
        await emailService.queueApplicationStatusEmail(updatedApplication);
      } catch (error) {
        logger.error(
          {
            applicationId: updatedApplication.id,
            status: updatedApplication.status,
            error: error instanceof Error ? error.message : String(error),
          },
          "failed to queue application status email",
        );
      }

      return mapAdminApplicationDetail(updatedApplication);
    },
    async applyToJob(slug, input, resume) {
      const job = await repository.findJobBySlugForApplication(slug);

      if (!job) {
        throw new NotFoundError("Job not found.");
      }

      if (job.status !== "open") {
        throw new BadRequestError(
          "This job is not currently accepting applications.",
          "JOB_NOT_OPEN",
        );
      }

      const questionResponses = validateApplicationQuestionResponses(job, input);
      const savedResume = await saveResumeFile(resume);

      try {
        const application = await repository.createApplicationSubmission({
          jobId: job.id,
          candidate: input,
          resume: savedResume,
          questionResponses,
        });

        try {
          await emailService.queueApplicationReceived(application);
        } catch (error) {
          logger.error(
            {
              applicationId: application.id,
              error: error instanceof Error ? error.message : String(error),
            },
            "failed to queue application received email",
          );
        }

        return mapPublicApplicationSubmission(application);
      } catch (error) {
        await deleteSavedResumeFile(savedResume.storagePath);
        return toApplicationConflict(error);
      }
    },
  };
};
