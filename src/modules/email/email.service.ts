import { Prisma, type EmailEventType } from "@prisma/client";

import { logger } from "../../lib/logger.js";
import { NotFoundError, ValidationError } from "../../shared/http/errors.js";
import { EmailProviderError, createEmailProvider, type EmailProvider } from "./email.provider.js";
import {
  createEmailRepository,
  type CreateEmailJobInput,
  type EmailJobRecord,
  type EmailLogRecord,
  type EmailRepository,
} from "./email.repository.js";
import { renderEmailTemplate, type TemplatePayload } from "./email.templates.js";

const MAX_ATTEMPTS = 5;
const COMPANY_NAME = "iCog Labs";

export type ApplicationEmailTarget = {
  id: string;
  status: string;
  candidate: {
    firstName: string;
    lastName: string;
    email: string;
  };
  job: {
    title: string;
  };
};

export type EmailJobDetail = {
  id: string;
  eventType: EmailEventType;
  templateKey: string;
  recipientEmail: string;
  recipientName: string | null;
  payloadJson: unknown;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  lastError: string | null;
  providerMessageId: string | null;
  dedupeKey: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
};

export type EmailLogDetail = {
  id: string;
  emailJobId: string;
  action: string;
  message: string | null;
  metadata: unknown;
  createdAt: string;
};

export type BatchEmailResult = {
  jobIds: string[];
  skipped: Array<{
    email: string;
    reason: string;
  }>;
};

export type EmailService = {
  repository: EmailRepository;
  provider: EmailProvider;
  createEmailJob(input: {
    eventType: EmailEventType;
    recipientEmail: string;
    recipientName?: string | null;
    payload: TemplatePayload;
    dedupeKey?: string | null;
  }): Promise<EmailJobDetail>;
  createBatchEmailJobs(input: {
    templateKey: EmailEventType;
    users: Array<Record<string, unknown> & { email: string; name?: string }>;
  }): Promise<BatchEmailResult>;
  queueApplicationReceived(application: ApplicationEmailTarget): Promise<EmailJobDetail | null>;
  queueApplicationStatusEmail(application: ApplicationEmailTarget): Promise<EmailJobDetail | null>;
  getEmailJob(id: string): Promise<EmailJobDetail>;
  listEmailLogs(id: string): Promise<EmailLogDetail[]>;
  retryEmailJob(id: string): Promise<EmailJobDetail>;
  processDueEmailJobs(limit?: number): Promise<{
    processed: number;
    sent: number;
    failed: number;
    retrying: number;
  }>;
};

const retryDelaysMs = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toIsoString = (value: Date | null) => value?.toISOString() ?? null;

const truncateError = (message: string) => message.slice(0, 2_000);

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const assertValidEmail = (email: string) => {
  const normalizedEmail = normalizeEmail(email);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new ValidationError("Recipient email must be a valid email address.", "INVALID_EMAIL");
  }

  return normalizedEmail;
};

const mapEmailJob = (job: EmailJobRecord): EmailJobDetail => ({
  id: job.id,
  eventType: job.eventType,
  templateKey: job.templateKey,
  recipientEmail: job.recipientEmail,
  recipientName: job.recipientName,
  payloadJson: job.payloadJson,
  status: job.status,
  attemptCount: job.attemptCount,
  maxAttempts: job.maxAttempts,
  nextRetryAt: toIsoString(job.nextRetryAt),
  lastError: job.lastError,
  providerMessageId: job.providerMessageId,
  dedupeKey: job.dedupeKey,
  createdAt: job.createdAt.toISOString(),
  updatedAt: job.updatedAt.toISOString(),
  sentAt: toIsoString(job.sentAt),
});

const mapEmailLog = (log: EmailLogRecord): EmailLogDetail => ({
  id: log.id,
  emailJobId: log.emailJobId,
  action: log.action,
  message: log.message,
  metadata: log.metadata,
  createdAt: log.createdAt.toISOString(),
});

const buildApplicationPayload = (application: ApplicationEmailTarget): TemplatePayload => {
  const applicantName = `${application.candidate.firstName} ${application.candidate.lastName}`.trim();

  return {
    applicant_name: applicantName,
    applicant_email: application.candidate.email,
    job_title: application.job.title,
    company_name: COMPANY_NAME,
    application_status: application.status,
  };
};

const applicationStatusEmailEvents: Partial<Record<string, EmailEventType>> = {
  screening: "application_shortlisted",
  offer: "application_offer",
  hired: "application_hired",
  rejected: "application_rejected",
};

const getRetryDecision = (job: EmailJobRecord, error: unknown) => {
  const retryable =
    error instanceof EmailProviderError
      ? error.retryable
      : !(error instanceof ValidationError);
  const permanentlyFailed = !retryable || job.attemptCount >= job.maxAttempts;
  const retryDelayMs = retryDelaysMs[Math.max(0, job.attemptCount - 1)] ?? retryDelaysMs.at(-1);

  return {
    retryable,
    permanentlyFailed,
    nextRetryAt:
      retryable && !permanentlyFailed && retryDelayMs !== undefined
        ? new Date(Date.now() + retryDelayMs)
        : null,
    errorMessage: truncateError(error instanceof Error ? error.message : "Email send failed."),
  };
};

export const createEmailService = (
  repository: EmailRepository = createEmailRepository(),
  provider: EmailProvider = createEmailProvider(),
): EmailService => {
  const createEmailJobInput = (
    input: Parameters<EmailService["createEmailJob"]>[0],
  ): CreateEmailJobInput => {
    const recipientEmail = assertValidEmail(input.recipientEmail);

    renderEmailTemplate(input.eventType, input.payload);

    return {
      eventType: input.eventType,
      templateKey: input.eventType,
      recipientEmail,
      recipientName: input.recipientName?.trim() || null,
      payloadJson: input.payload as Prisma.InputJsonValue,
      maxAttempts: MAX_ATTEMPTS,
      dedupeKey: input.dedupeKey,
    };
  };

  const queueEmailJob = async (input: Parameters<EmailService["createEmailJob"]>[0]) => {
    const job = await repository.createEmailJob(createEmailJobInput(input));

    logger.info(
      {
        emailJobId: job.id,
        eventType: job.eventType,
        recipientEmail: job.recipientEmail,
        dedupeKey: job.dedupeKey,
      },
      "email job queued",
    );

    return mapEmailJob(job);
  };

  return {
    repository,
    provider,
    async createEmailJob(input) {
      return queueEmailJob(input);
    },
    async createBatchEmailJobs(input) {
      const jobs: CreateEmailJobInput[] = [];
      const skipped: BatchEmailResult["skipped"] = [];

      for (const user of input.users) {
        try {
          const email = assertValidEmail(user.email);
          const name = typeof user.name === "string" ? user.name.trim() : undefined;
          const payload = {
            ...user,
            email,
            applicant_email: email,
            applicant_name: typeof user.applicant_name === "string" ? user.applicant_name : name,
            company_name:
              typeof user.company_name === "string" && user.company_name.trim().length > 0
                ? user.company_name
                : COMPANY_NAME,
          };

          jobs.push(
            createEmailJobInput({
              eventType: input.templateKey,
              recipientEmail: email,
              recipientName: name,
              payload,
            }),
          );
        } catch (error) {
          skipped.push({
            email: user.email,
            reason: error instanceof Error ? error.message : "Invalid recipient.",
          });
        }
      }

      const createdJobs = jobs.length > 0 ? await repository.createEmailJobs(jobs) : [];

      return {
        jobIds: createdJobs.map((job) => job.id),
        skipped,
      };
    },
    async queueApplicationReceived(application) {
      const payload = buildApplicationPayload(application);

      return queueEmailJob({
        eventType: "application_received",
        recipientEmail: application.candidate.email,
        recipientName: `${application.candidate.firstName} ${application.candidate.lastName}`,
        payload,
        dedupeKey: `application:${application.id}:event:application_received`,
      });
    },
    async queueApplicationStatusEmail(application) {
      const eventType = applicationStatusEmailEvents[application.status];

      if (!eventType) {
        return null;
      }

      return queueEmailJob({
        eventType,
        recipientEmail: application.candidate.email,
        recipientName: `${application.candidate.firstName} ${application.candidate.lastName}`,
        payload: buildApplicationPayload(application),
        dedupeKey: `application:${application.id}:event:${eventType}`,
      });
    },
    async getEmailJob(id) {
      const job = await repository.findEmailJobById(id);

      if (!job) {
        throw new NotFoundError("Email job not found.", "EMAIL_JOB_NOT_FOUND");
      }

      return mapEmailJob(job);
    },
    async listEmailLogs(id) {
      const job = await repository.findEmailJobById(id);

      if (!job) {
        throw new NotFoundError("Email job not found.", "EMAIL_JOB_NOT_FOUND");
      }

      const logs = await repository.listEmailLogs(id);
      return logs.map(mapEmailLog);
    },
    async retryEmailJob(id) {
      const job = await repository.resetEmailJobForRetry(id);

      if (!job) {
        throw new NotFoundError("Email job not found.", "EMAIL_JOB_NOT_FOUND");
      }

      return mapEmailJob(job);
    },
    async processDueEmailJobs(limit = 10) {
      const jobs = await repository.claimDueEmailJobs(limit);
      const result = {
        processed: jobs.length,
        sent: 0,
        failed: 0,
        retrying: 0,
      };

      for (const job of jobs) {
        try {
          if (!isRecord(job.payloadJson)) {
            throw new ValidationError("Email job payload must be an object.", "INVALID_EMAIL_PAYLOAD");
          }

          const renderedEmail = renderEmailTemplate(job.eventType, job.payloadJson);
          const providerResult = await provider.send({
            ...renderedEmail,
            to: {
              email: job.recipientEmail,
              name: job.recipientName,
            },
            templateKey: job.templateKey,
          });

          await repository.markEmailJobSent(job.id, providerResult.providerMessageId);
          result.sent += 1;
        } catch (error) {
          const retryDecision = getRetryDecision(job, error);
          const updatedJob = await repository.markEmailJobFailed(job.id, retryDecision);

          if (updatedJob.status === "retrying") {
            result.retrying += 1;
          } else {
            result.failed += 1;
          }

          logger.warn(
            {
              emailJobId: job.id,
              status: updatedJob.status,
              attemptCount: updatedJob.attemptCount,
              retryable: retryDecision.retryable,
              nextRetryAt: updatedJob.nextRetryAt?.toISOString() ?? null,
              error: retryDecision.errorMessage,
            },
            "email job send failed",
          );
        }
      }

      return result;
    },
  };
};
