import { z } from "zod";

import { ValidationError } from "../../shared/http/errors.js";

export const emailEventTypeValues = [
  "application_received",
  "application_shortlisted",
  "application_offer",
  "application_hired",
  "application_rejected",
  "interview_scheduled",
  "interview_rescheduled",
  "interview_reminder",
] as const;

const primitiveTemplateValueSchema = z.union([
  z.string().trim().max(2_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const templatePayloadSchema = z.record(z.string(), primitiveTemplateValueSchema);

export const createBatchEmailInputSchema = z.object({
  template_key: z.enum(emailEventTypeValues),
  users: z
    .array(
      z
        .object({
          name: z.string().trim().min(1).max(200).optional(),
          email: z.string().trim().min(1).max(320),
        })
        .catchall(primitiveTemplateValueSchema),
    )
    .min(1)
    .max(100),
});

export type CreateBatchEmailInput = z.infer<typeof createBatchEmailInputSchema>;

const toValidationError = (error: z.ZodError) => {
  const firstIssue = error.issues[0];
  return new ValidationError(firstIssue?.message ?? "Validation failed");
};

export const parseCreateBatchEmailInput = (input: unknown): CreateBatchEmailInput => {
  try {
    return createBatchEmailInputSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw toValidationError(error);
    }

    throw error;
  }
};

export const normalizeTemplatePayload = (payload: unknown) => {
  try {
    return templatePayloadSchema.parse(payload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw toValidationError(error);
    }

    throw error;
  }
};
