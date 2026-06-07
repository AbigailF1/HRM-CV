import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/hrm?schema=public";
process.env.BETTER_AUTH_SECRET ??= "better-auth-test-secret-1234567890";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

const emailServiceMock = vi.hoisted(() => ({
  getEmailJob: vi.fn(),
  listEmailLogs: vi.fn(),
  retryEmailJob: vi.fn(),
  createBatchEmailJobs: vi.fn(),
}));

vi.mock("../src/shared/http/middleware/auth.js", () => ({
  requireAdminSession: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../src/modules/email/email.service.js", () => ({
  createEmailService: () => emailServiceMock,
}));

let createApp: typeof import("../src/app.js").createApp;

beforeAll(async () => {
  ({ createApp } = await import("../src/app.ts"));
}, 30_000);

describe("email admin routes", () => {
  it("returns an email job", async () => {
    emailServiceMock.getEmailJob.mockResolvedValueOnce({
      id: "email-job-1",
      status: "pending",
    });

    const response = await request(createApp()).get("/api/v1/admin/email/jobs/email-job-1");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      id: "email-job-1",
      status: "pending",
    });
    expect(emailServiceMock.getEmailJob).toHaveBeenCalledWith("email-job-1");
  });

  it("returns email job logs", async () => {
    emailServiceMock.listEmailLogs.mockResolvedValueOnce([
      {
        id: "log-1",
        action: "job_created",
      },
    ]);

    const response = await request(createApp()).get("/api/v1/admin/email/jobs/email-job-1/logs");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      {
        id: "log-1",
        action: "job_created",
      },
    ]);
    expect(emailServiceMock.listEmailLogs).toHaveBeenCalledWith("email-job-1");
  });

  it("retries an email job", async () => {
    emailServiceMock.retryEmailJob.mockResolvedValueOnce({
      id: "email-job-1",
      status: "pending",
    });

    const response = await request(createApp()).post("/api/v1/admin/email/jobs/email-job-1/retry");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      id: "email-job-1",
      status: "pending",
    });
    expect(emailServiceMock.retryEmailJob).toHaveBeenCalledWith("email-job-1");
  });

  it("queues a batch email request", async () => {
    emailServiceMock.createBatchEmailJobs.mockResolvedValueOnce({
      jobIds: ["email-job-1"],
      skipped: [],
    });

    const response = await request(createApp())
      .post("/api/v1/admin/email/batch")
      .send({
        template_key: "application_received",
        users: [
          {
            name: "Alice",
            email: "alice@example.com",
            job_title: "Backend Developer",
          },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual({
      jobIds: ["email-job-1"],
      skipped: [],
    });
    expect(emailServiceMock.createBatchEmailJobs).toHaveBeenCalledWith({
      templateKey: "application_received",
      users: [
        {
          name: "Alice",
          email: "alice@example.com",
          job_title: "Backend Developer",
        },
      ],
    });
  });
});
