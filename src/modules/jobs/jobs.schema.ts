import { z } from "zod";

import { parsePagination } from "../../shared/http/pagination.js";
import { ValidationError } from "../../shared/http/errors.js";
import type {
  AdminApplicationsListParams,
  AdminApplicationsListQuery,
  AdminJobsListParams,
  AdminJobsListQuery,
  ApplicationQuestionResponseInput,
  ApplyToJobInput,
  CreateJobInput,
  JobQuestionInput,
  JobsListParams,
  JobsListQuery,
  PatchApplicationInput,
  UpdateJobInput,
} from "./jobs.types.js";
import {
  applicationStatusValues,
  experienceLevelValues,
  jobStatusValues,
  jobTypeValues,
  questionTypeValues,
  remoteStatusValues,
} from "./jobs.types.js";

const trimToUndefined = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
};

const optionalTrimmedString = (maxLength: number) =>
  z.preprocess(trimToUndefined, z.string().max(maxLength).optional());

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "slug must contain only lowercase letters, numbers, and hyphens.",
  });

const jobTypeSchema = z.enum(jobTypeValues);
const jobStatusSchema = z.enum(jobStatusValues);
const remoteStatusSchema = z.enum(remoteStatusValues);
const experienceLevelSchema = z.enum(experienceLevelValues);
const applicationStatusSchema = z.enum(applicationStatusValues);
const questionTypeSchema = z.enum(questionTypeValues);

const questionOptionSchema = z.object({
  label: z.string().trim().min(1).max(120),
  value: z.string().trim().min(1).max(120),
});

const questionResponseValueSchema = z.union([
  z.string().trim().min(1),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().trim().min(1)).min(1),
  z.null(),
]);

export const jobsListQuerySchema = z.object({
  page: z.unknown().optional(),
  pageSize: z.unknown().optional(),
  search: optionalTrimmedString(120),
  type: jobTypeSchema.optional(),
  remoteStatus: remoteStatusSchema.optional(),
  experienceLevel: experienceLevelSchema.optional(),
  location: optionalTrimmedString(120),
});

export const adminJobsListQuerySchema = jobsListQuerySchema.extend({
  status: jobStatusSchema.optional(),
});

export const adminApplicationsListQuerySchema = z.object({
  page: z.unknown().optional(),
  pageSize: z.unknown().optional(),
  search: optionalTrimmedString(120),
  status: applicationStatusSchema.optional(),
});

export const jobQuestionInputSchema: z.ZodType<JobQuestionInput> = z
  .object({
    type: questionTypeSchema.default("short_text"),
    label: z.string().trim().min(1).max(200),
    description: optionalTrimmedString(2_000),
    required: z.boolean().default(true),
    options: z.array(questionOptionSchema).min(1).optional(),
    displayOrder: z.number().int().min(0).default(0),
  })
  .superRefine((question, ctx) => {
    const requiresOptions =
      question.type === "single_select" || question.type === "multi_select";

    if (requiresOptions && (!question.options || question.options.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Question options are required for select question types.",
        path: ["options"],
      });
    }

    if (!requiresOptions && question.options && question.options.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Question options are only allowed for select question types.",
        path: ["options"],
      });
    }
  });

const jobInputBaseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: slugSchema,
  description: optionalTrimmedString(10_000),
  location: optionalTrimmedString(200),
  type: jobTypeSchema.default("full_time"),
  status: jobStatusSchema.default("draft"),
  remoteStatus: remoteStatusSchema.optional(),
  experienceLevel: experienceLevelSchema.optional(),
  validThrough: z.coerce.date().optional(),
  autoScoreOnApply: z.boolean().default(true),
  questions: z.array(jobQuestionInputSchema).max(50).default([]),
});

export const createJobInputSchema: z.ZodType<CreateJobInput> = jobInputBaseSchema;

export const updateJobInputSchema: z.ZodType<UpdateJobInput> = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    slug: slugSchema.optional(),
    description: optionalTrimmedString(10_000),
    location: optionalTrimmedString(200),
    type: jobTypeSchema.optional(),
    status: jobStatusSchema.optional(),
    remoteStatus: remoteStatusSchema.optional(),
    experienceLevel: experienceLevelSchema.optional(),
    validThrough: z.coerce.date().optional(),
    autoScoreOnApply: z.boolean().optional(),
    questions: z.array(jobQuestionInputSchema).max(50).optional(),
  })
  .superRefine((payload, ctx) => {
    if (Object.keys(payload).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one field must be provided.",
      });
    }
  });

export const applicationQuestionResponseInputSchema: z.ZodType<ApplicationQuestionResponseInput> =
  z.object({
    questionId: z.string().uuid(),
    value: questionResponseValueSchema,
  });

export const applyToJobInputSchema: z.ZodType<ApplyToJobInput> = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  phone: optionalTrimmedString(40),
  linkedinUrl: z.preprocess(trimToUndefined, z.string().url().max(2_000).optional()),
  portfolioUrl: z.preprocess(trimToUndefined, z.string().url().max(2_000).optional()),
  coverLetterText: optionalTrimmedString(10_000),
  questionResponses: z.array(applicationQuestionResponseInputSchema).default([]),
});

export const patchApplicationInputSchema: z.ZodType<PatchApplicationInput> = z.object({
  status: applicationStatusSchema,
});

const toValidationError = (error: z.ZodError) => {
  const firstIssue = error.issues[0];
  return new ValidationError(firstIssue?.message ?? "Validation failed");
};

export const parseApplicationQuestionResponsesField = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  if (typeof value !== "string") {
    throw new ValidationError(
      "questionResponses must be a valid JSON array.",
      "INVALID_QUESTION_RESPONSES",
    );
  }

  try {
    const parsedValue = JSON.parse(value);

    if (!Array.isArray(parsedValue)) {
      throw new ValidationError(
        "questionResponses must be a valid JSON array.",
        "INVALID_QUESTION_RESPONSES",
      );
    }

    return parsedValue;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    throw new ValidationError(
      "questionResponses must be a valid JSON array.",
      "INVALID_QUESTION_RESPONSES",
    );
  }
};

export const parseJobsListQuery = (query: JobsListQuery = {}): JobsListParams => {
  try {
    const parsedQuery = jobsListQuerySchema.parse(query);
    const { page, pageSize, ...filters } = parsedQuery;
    const pagination = parsePagination({ page, pageSize });

    return {
      ...filters,
      ...pagination,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw toValidationError(error);
    }

    throw error;
  }
};

export const parseAdminJobsListQuery = (
  query: AdminJobsListQuery = {},
): AdminJobsListParams => {
  try {
    const parsedQuery = adminJobsListQuerySchema.parse(query);
    const { page, pageSize, ...filters } = parsedQuery;
    const pagination = parsePagination({ page, pageSize });

    return {
      ...filters,
      ...pagination,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw toValidationError(error);
    }

    throw error;
  }
};

export const parseAdminApplicationsListQuery = (
  query: AdminApplicationsListQuery = {},
): AdminApplicationsListParams => {
  try {
    const parsedQuery = adminApplicationsListQuerySchema.parse(query);
    const { page, pageSize, ...filters } = parsedQuery;
    const pagination = parsePagination({ page, pageSize });

    return {
      ...filters,
      ...pagination,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw toValidationError(error);
    }

    throw error;
  }
};

export const parseCreateJobInput = (input: unknown): CreateJobInput => {
  try {
    return createJobInputSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw toValidationError(error);
    }

    throw error;
  }
};

export const parseUpdateJobInput = (input: unknown): UpdateJobInput => {
  try {
    return updateJobInputSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw toValidationError(error);
    }

    throw error;
  }
};

export const parseApplyToJobInput = (input: unknown): ApplyToJobInput => {
  try {
    return applyToJobInputSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw toValidationError(error);
    }

    throw error;
  }
};

export const parsePatchApplicationInput = (input: unknown): PatchApplicationInput => {
  try {
    return patchApplicationInputSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw toValidationError(error);
    }

    throw error;
  }
};
