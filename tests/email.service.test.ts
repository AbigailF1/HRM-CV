import type { EmailEventType, EmailJobStatus, Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { EmailProviderError, type EmailProvider } from "../src/modules/email/email.provider";
import type {
  CreateEmailJobInput,
  EmailJobRecord,
  EmailLogInput,
  EmailLogRecord,
  EmailRepository,
  MarkFailedInput,
} from "../src/modules/email/email.repository";
import { createEmailService } from "../src/modules/email/email.service";
import { renderEmailTemplate } from "../src/modules/email/email.templates";
import { ValidationError } from "../src/shared/http/errors";

const now = () => new Date();

class FakeEmailRepository implements Omit<EmailRepository, "prisma"> {
  readonly jobs = new Map<string, EmailJobRecord>();
  readonly logs = new Map<string, EmailLogRecord[]>();
  private nextJobId = 1;
  private nextLogId = 1;

  async createEmailJob(input: CreateEmailJobInput) {
    const existingJob = input.dedupeKey
      ? [...this.jobs.values()].find((job) => job.dedupeKey === input.dedupeKey)
      : undefined;

    if (existingJob) {
      await this.createEmailLog(existingJob.id, { action: "duplicate_suppressed" });
      return existingJob;
    }

    const date = now();
    const job = {
      id: `job-${this.nextJobId++}`,
      eventType: input.eventType,
      templateKey: input.templateKey,
      recipientEmail: input.recipientEmail,
      recipientName: input.recipientName ?? null,
      payloadJson: input.payloadJson,
      status: "pending" as EmailJobStatus,
      attemptCount: 0,
      maxAttempts: input.maxAttempts ?? 5,
      nextRetryAt: date,
      lastError: null,
      providerMessageId: null,
      dedupeKey: input.dedupeKey ?? null,
      createdAt: date,
      updatedAt: date,
      sentAt: null,
    } satisfies EmailJobRecord;

    this.jobs.set(job.id, job);
    await this.createEmailLog(job.id, { action: "job_created" });

    return job;
  }

  async createEmailJobs(inputs: CreateEmailJobInput[]) {
    const jobs: EmailJobRecord[] = [];

    for (const input of inputs) {
      jobs.push(await this.createEmailJob(input));
    }

    return jobs;
  }

  async findEmailJobById(id: string) {
    return this.jobs.get(id) ?? null;
  }

  async listEmailLogs(emailJobId: string) {
    return this.logs.get(emailJobId) ?? [];
  }

  async createEmailLog(emailJobId: string, input: EmailLogInput) {
    const log = {
      id: `log-${this.nextLogId++}`,
      emailJobId,
      action: input.action,
      message: input.message ?? null,
      metadata: input.metadata ?? null,
      createdAt: now(),
    } satisfies EmailLogRecord;

    this.logs.set(emailJobId, [...(this.logs.get(emailJobId) ?? []), log]);
    return log;
  }

  async claimDueEmailJobs(limit: number) {
    const dueJobs = [...this.jobs.values()]
      .filter(
        (job) =>
          (job.status === "pending" || job.status === "retrying") &&
          (!job.nextRetryAt || job.nextRetryAt.getTime() <= Date.now()),
      )
      .slice(0, limit)
      .map((job) => {
        const updatedJob = {
          ...job,
          status: "processing" as EmailJobStatus,
          attemptCount: job.attemptCount + 1,
          updatedAt: now(),
        };

        this.jobs.set(job.id, updatedJob);
        return updatedJob;
      });

    return dueJobs;
  }

  async markEmailJobSent(id: string, providerMessageId: string) {
    const job = this.mustFindJob(id);
    const updatedJob = {
      ...job,
      status: "sent" as EmailJobStatus,
      providerMessageId,
      nextRetryAt: null,
      sentAt: now(),
      updatedAt: now(),
    };

    this.jobs.set(id, updatedJob);
    await this.createEmailLog(id, { action: "email_sent" });
    return updatedJob;
  }

  async markEmailJobFailed(id: string, input: MarkFailedInput) {
    const job = this.mustFindJob(id);
    const updatedJob = {
      ...job,
      status: input.permanentlyFailed
        ? ("failed" as EmailJobStatus)
        : input.retryable
          ? ("retrying" as EmailJobStatus)
          : ("failed" as EmailJobStatus),
      lastError: input.errorMessage,
      nextRetryAt: input.nextRetryAt,
      updatedAt: now(),
    };

    this.jobs.set(id, updatedJob);
    await this.createEmailLog(id, {
      action: input.permanentlyFailed ? "permanently_failed" : "retry_scheduled",
      message: input.errorMessage,
    });
    return updatedJob;
  }

  async resetEmailJobForRetry(id: string) {
    const job = this.jobs.get(id);

    if (!job) {
      return null;
    }

    const updatedJob = {
      ...job,
      status: "pending" as EmailJobStatus,
      nextRetryAt: now(),
      lastError: null,
      updatedAt: now(),
    };

    this.jobs.set(id, updatedJob);
    await this.createEmailLog(id, { action: "manual_resend" });
    return updatedJob;
  }

  seedJob(input: {
    eventType?: EmailEventType;
    payloadJson?: Prisma.JsonValue;
    status?: EmailJobStatus;
    attemptCount?: number;
    maxAttempts?: number;
  }) {
    const date = now();
    const job = {
      id: `job-${this.nextJobId++}`,
      eventType: input.eventType ?? "application_received",
      templateKey: input.eventType ?? "application_received",
      recipientEmail: "ada@example.com",
      recipientName: "Ada Lovelace",
      payloadJson:
        input.payloadJson ??
        ({
          applicant_name: "Ada Lovelace",
          applicant_email: "ada@example.com",
          job_title: "Backend Engineer",
          company_name: "iCog Labs",
          application_status: "new",
        } satisfies Prisma.JsonObject),
      status: input.status ?? "pending",
      attemptCount: input.attemptCount ?? 0,
      maxAttempts: input.maxAttempts ?? 5,
      nextRetryAt: date,
      lastError: null,
      providerMessageId: null,
      dedupeKey: null,
      createdAt: date,
      updatedAt: date,
      sentAt: null,
    } satisfies EmailJobRecord;

    this.jobs.set(job.id, job);
    return job;
  }

  private mustFindJob(id: string) {
    const job = this.jobs.get(id);

    if (!job) {
      throw new Error("Missing seeded job.");
    }

    return job;
  }
}

const createFakeProvider = (send: EmailProvider["send"]): EmailProvider => ({ send });

const createService = (repository = new FakeEmailRepository(), provider = createFakeProvider(
  async () => ({ providerMessageId: "provider-1" }),
)) => {
  return {
    repository,
    service: createEmailService(repository as unknown as EmailRepository, provider),
  };
};

describe("email automation", () => {
  it("renders templates and escapes HTML variables", () => {
    const rendered = renderEmailTemplate("application_received", {
      applicant_name: "<Ada>",
      job_title: "Backend Engineer",
      company_name: "iCog Labs",
    });

    expect(rendered.subject).toBe("We received your application for Backend Engineer");
    expect(rendered.html).toContain("&lt;Ada&gt;");
  });

  it("creates an email job with normalized recipient and dedupe key", async () => {
    const { repository, service } = createService();

    const job = await service.createEmailJob({
      eventType: "application_received",
      recipientEmail: " ADA@Example.com ",
      recipientName: "Ada Lovelace",
      payload: {
        applicant_name: "Ada Lovelace",
        job_title: "Backend Engineer",
        company_name: "iCog Labs",
      },
      dedupeKey: "application:1:event:application_received",
    });

    expect(job.recipientEmail).toBe("ada@example.com");
    expect(job.dedupeKey).toBe("application:1:event:application_received");
    expect(repository.jobs.size).toBe(1);
  });

  it("rejects invalid recipient email", async () => {
    const { service } = createService();

    await expect(
      service.createEmailJob({
        eventType: "application_received",
        recipientEmail: "bad-email",
        payload: {
          applicant_name: "Ada Lovelace",
          job_title: "Backend Engineer",
          company_name: "iCog Labs",
        },
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("sends due jobs through the provider", async () => {
    const provider = createFakeProvider(vi.fn(async () => ({ providerMessageId: "provider-123" })));
    const repository = new FakeEmailRepository();
    const seededJob = repository.seedJob({});
    const service = createEmailService(repository as unknown as EmailRepository, provider);

    const result = await service.processDueEmailJobs();

    expect(result).toMatchObject({ processed: 1, sent: 1 });
    expect(repository.jobs.get(seededJob.id)?.status).toBe("sent");
    expect(repository.jobs.get(seededJob.id)?.providerMessageId).toBe("provider-123");
  });

  it("schedules retryable failures with backoff", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-07T12:00:00.000Z"));

    const provider = createFakeProvider(async () => {
      throw new EmailProviderError("temporary provider outage", true);
    });
    const repository = new FakeEmailRepository();
    const seededJob = repository.seedJob({});
    const service = createEmailService(repository as unknown as EmailRepository, provider);

    await service.processDueEmailJobs();

    const failedJob = repository.jobs.get(seededJob.id);
    expect(failedJob?.status).toBe("retrying");
    expect(failedJob?.attemptCount).toBe(1);
    expect(failedJob?.nextRetryAt?.toISOString()).toBe("2026-06-07T12:01:00.000Z");

    vi.useRealTimers();
  });

  it("marks a job permanently failed after max attempts", async () => {
    const provider = createFakeProvider(async () => {
      throw new EmailProviderError("temporary provider outage", true);
    });
    const repository = new FakeEmailRepository();
    const seededJob = repository.seedJob({ attemptCount: 4, maxAttempts: 5 });
    const service = createEmailService(repository as unknown as EmailRepository, provider);

    await service.processDueEmailJobs();

    const failedJob = repository.jobs.get(seededJob.id);
    expect(failedJob?.status).toBe("failed");
    expect(failedJob?.attemptCount).toBe(5);
  });

  it("creates batch jobs and skips invalid recipients independently", async () => {
    const { service } = createService();

    const result = await service.createBatchEmailJobs({
      templateKey: "application_received",
      users: [
        {
          name: "Alice",
          email: "alice@example.com",
          job_title: "Backend Developer",
        },
        {
          name: "Bob",
          email: "not-an-email",
          job_title: "Designer",
        },
      ],
    });

    expect(result.jobIds).toHaveLength(1);
    expect(result.skipped).toEqual([
      {
        email: "not-an-email",
        reason: "Recipient email must be a valid email address.",
      },
    ]);
  });
});
