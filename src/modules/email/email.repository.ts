import { Prisma, type EmailEventType, type EmailJobStatus, type PrismaClient } from "@prisma/client";

import { getPrisma } from "../../lib/prisma.js";

export const emailJobSelect = {
  id: true,
  eventType: true,
  templateKey: true,
  recipientEmail: true,
  recipientName: true,
  payloadJson: true,
  status: true,
  attemptCount: true,
  maxAttempts: true,
  nextRetryAt: true,
  lastError: true,
  providerMessageId: true,
  dedupeKey: true,
  createdAt: true,
  updatedAt: true,
  sentAt: true,
} satisfies Prisma.EmailJobSelect;

export const emailLogSelect = {
  id: true,
  emailJobId: true,
  action: true,
  message: true,
  metadata: true,
  createdAt: true,
} satisfies Prisma.EmailLogSelect;

export type EmailJobRecord = Prisma.EmailJobGetPayload<{
  select: typeof emailJobSelect;
}>;

export type EmailLogRecord = Prisma.EmailLogGetPayload<{
  select: typeof emailLogSelect;
}>;

export type CreateEmailJobInput = {
  eventType: EmailEventType;
  templateKey: string;
  recipientEmail: string;
  recipientName?: string | null;
  payloadJson: Prisma.InputJsonValue;
  maxAttempts?: number;
  dedupeKey?: string | null;
};

export type EmailLogInput = {
  action: string;
  message?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

export type MarkFailedInput = {
  retryable: boolean;
  errorMessage: string;
  nextRetryAt: Date | null;
  permanentlyFailed: boolean;
};

export type EmailRepository = {
  prisma: PrismaClient;
  createEmailJob(input: CreateEmailJobInput): Promise<EmailJobRecord>;
  createEmailJobs(inputs: CreateEmailJobInput[]): Promise<EmailJobRecord[]>;
  findEmailJobById(id: string): Promise<EmailJobRecord | null>;
  listEmailLogs(emailJobId: string): Promise<EmailLogRecord[]>;
  createEmailLog(emailJobId: string, input: EmailLogInput): Promise<EmailLogRecord>;
  claimDueEmailJobs(limit: number): Promise<EmailJobRecord[]>;
  markEmailJobSent(id: string, providerMessageId: string): Promise<EmailJobRecord>;
  markEmailJobFailed(id: string, input: MarkFailedInput): Promise<EmailJobRecord>;
  resetEmailJobForRetry(id: string): Promise<EmailJobRecord | null>;
};

const isUniqueConstraintError = (
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

const statusForFailure = (input: MarkFailedInput): EmailJobStatus => {
  if (input.permanentlyFailed) {
    return "failed";
  }

  return input.retryable ? "retrying" : "failed";
};

export const createEmailRepository = (
  prisma: PrismaClient = getPrisma(),
): EmailRepository => {
  const createEmailJobWithTx = async (
    tx: Prisma.TransactionClient,
    input: CreateEmailJobInput,
  ) => {
    try {
      const job = await tx.emailJob.create({
        data: {
          eventType: input.eventType,
          templateKey: input.templateKey,
          recipientEmail: input.recipientEmail,
          recipientName: input.recipientName,
          payloadJson: input.payloadJson,
          maxAttempts: input.maxAttempts ?? 5,
          dedupeKey: input.dedupeKey,
        },
        select: emailJobSelect,
      });

      await tx.emailLog.create({
        data: {
          emailJobId: job.id,
          action: "job_created",
          metadata: {
            eventType: job.eventType,
            templateKey: job.templateKey,
            recipientEmail: job.recipientEmail,
            dedupeKey: job.dedupeKey,
          },
        },
      });

      return job;
    } catch (error) {
      if (!isUniqueConstraintError(error) || !input.dedupeKey) {
        throw error;
      }

      const existingJob = await tx.emailJob.findUnique({
        where: { dedupeKey: input.dedupeKey },
        select: emailJobSelect,
      });

      if (!existingJob) {
        throw error;
      }

      await tx.emailLog.create({
        data: {
          emailJobId: existingJob.id,
          action: "duplicate_suppressed",
          metadata: {
            dedupeKey: input.dedupeKey,
            eventType: input.eventType,
          },
        },
      });

      return existingJob;
    }
  };

  return {
    prisma,
    async createEmailJob(input) {
      return prisma.$transaction((tx) => createEmailJobWithTx(tx, input));
    },
    async createEmailJobs(inputs) {
      return prisma.$transaction(async (tx) => {
        const jobs: EmailJobRecord[] = [];

        for (const input of inputs) {
          jobs.push(await createEmailJobWithTx(tx, input));
        }

        return jobs;
      });
    },
    async findEmailJobById(id) {
      return prisma.emailJob.findUnique({
        where: { id },
        select: emailJobSelect,
      });
    },
    async listEmailLogs(emailJobId) {
      return prisma.emailLog.findMany({
        where: { emailJobId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: emailLogSelect,
      });
    },
    async createEmailLog(emailJobId, input) {
      return prisma.emailLog.create({
        data: {
          emailJobId,
          action: input.action,
          message: input.message,
          metadata: input.metadata ?? Prisma.JsonNull,
        },
        select: emailLogSelect,
      });
    },
    async claimDueEmailJobs(limit) {
      return prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "email_job"
          WHERE "status" IN ('pending'::email_job_status, 'retrying'::email_job_status)
            AND ("next_retry_at" IS NULL OR "next_retry_at" <= NOW())
          ORDER BY "created_at" ASC, "id" ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        `;

        const jobs: EmailJobRecord[] = [];

        for (const row of rows) {
          const job = await tx.emailJob.update({
            where: { id: row.id },
            data: {
              status: "processing",
              attemptCount: { increment: 1 },
              lastError: null,
            },
            select: emailJobSelect,
          });

          await tx.emailLog.create({
            data: {
              emailJobId: job.id,
              action: job.attemptCount === 1 ? "sending_started" : "retry_attempted",
              metadata: {
                attemptCount: job.attemptCount,
                maxAttempts: job.maxAttempts,
              },
            },
          });

          jobs.push(job);
        }

        return jobs;
      });
    },
    async markEmailJobSent(id, providerMessageId) {
      return prisma.$transaction(async (tx) => {
        const job = await tx.emailJob.update({
          where: { id },
          data: {
            status: "sent",
            providerMessageId,
            lastError: null,
            nextRetryAt: null,
            sentAt: new Date(),
          },
          select: emailJobSelect,
        });

        await tx.emailLog.create({
          data: {
            emailJobId: id,
            action: "email_sent",
            metadata: {
              providerMessageId,
              attemptCount: job.attemptCount,
            },
          },
        });

        return job;
      });
    },
    async markEmailJobFailed(id, input) {
      return prisma.$transaction(async (tx) => {
        const status = statusForFailure(input);
        const job = await tx.emailJob.update({
          where: { id },
          data: {
            status,
            lastError: input.errorMessage,
            nextRetryAt: input.nextRetryAt,
          },
          select: emailJobSelect,
        });

        const failureMetadata = {
          status,
          attemptCount: job.attemptCount,
          maxAttempts: job.maxAttempts,
          nextRetryAt: input.nextRetryAt?.toISOString() ?? null,
        };

        await tx.emailLog.create({
          data: {
            emailJobId: id,
            action: "email_failed",
            message: input.errorMessage,
            metadata: failureMetadata,
          },
        });

        if (input.retryable && !input.permanentlyFailed) {
          await tx.emailLog.create({
            data: {
              emailJobId: id,
              action: "retry_scheduled",
              message: input.errorMessage,
              metadata: failureMetadata,
            },
          });
        }

        if (input.permanentlyFailed) {
          await tx.emailLog.create({
            data: {
              emailJobId: id,
              action: "permanently_failed",
              message: input.errorMessage,
              metadata: failureMetadata,
            },
          });
        }

        return job;
      });
    },
    async resetEmailJobForRetry(id) {
      return prisma.$transaction(async (tx) => {
        const existingJob = await tx.emailJob.findUnique({
          where: { id },
          select: emailJobSelect,
        });

        if (!existingJob) {
          return null;
        }

        const job = await tx.emailJob.update({
          where: { id },
          data: {
            status: "pending",
            nextRetryAt: new Date(),
            lastError: null,
          },
          select: emailJobSelect,
        });

        await tx.emailLog.create({
          data: {
            emailJobId: id,
            action: "manual_resend",
            metadata: {
              previousStatus: existingJob.status,
              attemptCount: existingJob.attemptCount,
            },
          },
        });

        return job;
      });
    },
  };
};
