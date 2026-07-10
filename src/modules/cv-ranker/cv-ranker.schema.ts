import { z } from "zod";

import { ValidationError } from "../../shared/http/errors.js";
import type {
  CreateCvRankJobInput,
  CreateApplicationCvRankJobInput,
  CvRankMetricDefinition,
  CvRankerRoleTypeValue,
  UpdateCvRankerRoleConfigInput,
} from "./cv-ranker.types.js";
import { cvRankerRoleTypeValues } from "./cv-ranker.types.js";

const trimToUndefined = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
};

const optionalTrimmedString = (maxLength: number) =>
  z.preprocess(trimToUndefined, z.string().max(maxLength).optional());

export const cvRankerRoleTypeSchema = z.enum(cvRankerRoleTypeValues, {
  error: `Role type must be one of: ${cvRankerRoleTypeValues.join(", ")}.`,
});

const metricIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, {
    message: "Metric id must contain lowercase letters, numbers, and underscores.",
  });

export const cvRankMetricSchema: z.ZodType<CvRankMetricDefinition> = z.object({
  id: metricIdSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2_000),
  weight: z.number().finite().positive().max(100),
});

const weightsSchema = z.record(metricIdSchema, z.number().finite().positive().max(100));

export const createCvRankJobInputSchema: z.ZodType<CreateCvRankJobInput> = z.object({
  roleType: cvRankerRoleTypeSchema,
  jobDescription: optionalTrimmedString(20_000),
  metrics: z.array(cvRankMetricSchema).min(1).max(20).optional(),
  weights: weightsSchema.optional(),
  webhookUrl: z.preprocess(trimToUndefined, z.string().url().max(2_000).optional()),
});

export const createApplicationCvRankJobInputSchema: z.ZodType<CreateApplicationCvRankJobInput> =
  z.object({
    roleType: cvRankerRoleTypeSchema.optional(),
    jobDescription: optionalTrimmedString(20_000),
    metrics: z.array(cvRankMetricSchema).min(1).max(20).optional(),
    weights: weightsSchema.optional(),
    webhookUrl: z.preprocess(trimToUndefined, z.string().url().max(2_000).optional()),
  });

export const updateCvRankerRoleConfigInputSchema: z.ZodType<UpdateCvRankerRoleConfigInput> =
  z
    .object({
      defaultJobDescription: optionalTrimmedString(20_000),
      metrics: z.array(cvRankMetricSchema).min(1).max(20).optional(),
    })
    .superRefine((payload, ctx) => {
      if (Object.keys(payload).length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "At least one field must be provided.",
        });
      }
    });

export const generateCustomMetricsInputSchema = z.object({
  jobDescription: z.string().trim().min(1).max(20_000),
});

const toValidationError = (error: z.ZodError) => {
  const firstIssue = error.issues[0];
  return new ValidationError(firstIssue?.message ?? "Validation failed");
};

const parseJsonField = (value: unknown, fieldName: string) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    throw new ValidationError(`${fieldName} must be valid JSON.`, "INVALID_JSON_FIELD");
  }
};

export const parseCvRankerRoleType = (value: unknown): CvRankerRoleTypeValue => {
  try {
    return cvRankerRoleTypeSchema.parse(value);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw toValidationError(error);
    }

    throw error;
  }
};

export const parseCreateCvRankJobInput = (input: Record<string, unknown>) => {
  try {
    return createCvRankJobInputSchema.parse({
      ...input,
      metrics: parseJsonField(input.metrics, "metrics"),
      weights: parseJsonField(input.weights, "weights"),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw toValidationError(error);
    }

    throw error;
  }
};

export const parseCreateApplicationCvRankJobInput = (input: Record<string, unknown>) => {
  try {
    return createApplicationCvRankJobInputSchema.parse({
      ...input,
      metrics: parseJsonField(input.metrics, "metrics"),
      weights: parseJsonField(input.weights, "weights"),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw toValidationError(error);
    }

    throw error;
  }
};

export const parseUpdateCvRankerRoleConfigInput = (input: Record<string, unknown>) => {
  try {
    return updateCvRankerRoleConfigInputSchema.parse({
      ...input,
      metrics: parseJsonField(input.metrics, "metrics"),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw toValidationError(error);
    }

    throw error;
  }
};

export const parseGenerateCustomMetricsInput = (input: unknown) => {
  try {
    return generateCustomMetricsInputSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw toValidationError(error);
    }

    throw error;
  }
};
