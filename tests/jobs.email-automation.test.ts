import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/hrm?schema=public";
  process.env.BETTER_AUTH_SECRET ??= "better-auth-test-secret-1234567890";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
});

import type { EmailService } from "../src/modules/email/email.service";
import type { AdminApplicationDetailRecord, JobsRepository } from "../src/modules/jobs/jobs.repository";
import { createJobsService } from "../src/modules/jobs/jobs.service";

const createApplicationRecord = (
  status: AdminApplicationDetailRecord["status"],
): AdminApplicationDetailRecord =>
  ({
    id: "application-1",
    status,
    submittedAt: new Date("2026-06-07T09:00:00.000Z"),
    createdAt: new Date("2026-06-07T09:00:00.000Z"),
    updatedAt: new Date("2026-06-07T09:00:00.000Z"),
    coverLetterText: null,
    resumeFileName: "resume.pdf",
    resumeMimeType: "application/pdf",
    resumeSizeBytes: 100,
    candidate: {
      id: "candidate-1",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: null,
      linkedinUrl: null,
      portfolioUrl: null,
    },
    job: {
      id: "job-1",
      slug: "backend-engineer",
      title: "Backend Engineer",
      status: "open",
    },
    questionResponses: [],
  }) as AdminApplicationDetailRecord;

const createRepository = (
  existingApplication: AdminApplicationDetailRecord,
  updatedApplication: AdminApplicationDetailRecord,
) =>
  ({
    findAdminApplicationById: vi.fn(async () => existingApplication),
    updateAdminApplicationStatus: vi.fn(async () => updatedApplication),
  }) as unknown as JobsRepository;

const createEmailServiceMock = () =>
  ({
    queueApplicationStatusEmail: vi.fn(async () => null),
  }) as unknown as EmailService;

describe("jobs email automation integration", () => {
  it("queues an application status email after status update succeeds", async () => {
    const existingApplication = createApplicationRecord("new");
    const updatedApplication = createApplicationRecord("screening");
    const repository = createRepository(existingApplication, updatedApplication);
    const emailService = createEmailServiceMock();
    const service = createJobsService(repository, emailService);

    await service.updateAdminApplication("application-1", { status: "screening" });

    expect(repository.updateAdminApplicationStatus).toHaveBeenCalledWith(
      "application-1",
      "screening",
    );
    expect(emailService.queueApplicationStatusEmail).toHaveBeenCalledWith(updatedApplication);
  });

  it("does not fail the status update when email queueing fails", async () => {
    const existingApplication = createApplicationRecord("new");
    const updatedApplication = createApplicationRecord("screening");
    const repository = createRepository(existingApplication, updatedApplication);
    const emailService = {
      queueApplicationStatusEmail: vi.fn(async () => {
        throw new Error("queue unavailable");
      }),
    } as unknown as EmailService;
    const service = createJobsService(repository, emailService);

    await expect(
      service.updateAdminApplication("application-1", { status: "screening" }),
    ).resolves.toMatchObject({
      id: "application-1",
      status: "screening",
    });
  });
});
