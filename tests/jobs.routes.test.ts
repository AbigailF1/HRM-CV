import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { join } from "node:path";

import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { disconnectPrisma, getPrisma } from "../src/lib/prisma";

const describeIfDatabaseConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const prisma = getPrisma();
const jobSlugPrefix = "public-job-test";
const adminEmailPrefix = "jobs-admin-test";
const candidateEmailPrefix = "jobs-candidate-test";
const testResumeBuffer = Buffer.from("%PDF-1.4 test resume");

const cleanupUploadedResumes = async () => {
  const applications = await prisma.application.findMany({
    where: {
      job: {
        slug: {
          startsWith: jobSlugPrefix,
        },
      },
    },
    select: {
      resumeFileUrl: true,
    },
  });

  await Promise.all(
    applications.map(async (application) => {
      try {
        const resumePath = new URL(application.resumeFileUrl).pathname;
        const relativeResumePath = resumePath.replace(`${env.uploads.publicPath}/`, "");

        await unlink(join(env.uploads.rootDir, relativeResumePath));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }),
  );
};

const createAuthenticatedAgent = async () => {
  const password = "Password123!";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const app = createApp();
    const agent = request.agent(app);
    const email = `${adminEmailPrefix}+${randomUUID()}@example.com`;

    const response = await agent
      .post("/api/auth/sign-up/email")
      .set("Origin", env.auth.origin)
      .send({
        name: "Jobs Admin",
        email,
        password,
      });

    if (response.status === 200) {
      return agent;
    }
  }

  throw new Error("Failed to create authenticated admin test agent.");
};

describeIfDatabaseConfigured("jobs routes", () => {
  beforeEach(async () => {
    await cleanupUploadedResumes();
    await prisma.job.deleteMany({
      where: {
        slug: {
          startsWith: jobSlugPrefix,
        },
      },
    });
    await prisma.candidate.deleteMany({
      where: {
        email: {
          contains: candidateEmailPrefix,
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: {
          contains: adminEmailPrefix,
        },
      },
    });
  });

  afterAll(async () => {
    await cleanupUploadedResumes();
    await prisma.job.deleteMany({
      where: {
        slug: {
          startsWith: jobSlugPrefix,
        },
      },
    });
    await prisma.candidate.deleteMany({
      where: {
        email: {
          contains: candidateEmailPrefix,
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: adminEmailPrefix,
        },
      },
    });
    await disconnectPrisma();
  });

  it("lists only open jobs with pagination metadata", async () => {
    await prisma.job.createMany({
      data: [
        {
          id: "job-open-1",
          title: "Backend Engineer",
          slug: `${jobSlugPrefix}-backend`,
          status: "open",
          type: "full_time",
        },
        {
          id: "job-draft-1",
          title: "Draft Role",
          slug: `${jobSlugPrefix}-draft`,
          status: "draft",
          type: "full_time",
        },
        {
          id: "job-open-2",
          title: "Frontend Engineer",
          slug: `${jobSlugPrefix}-frontend`,
          status: "open",
          type: "contract",
        },
      ],
    });

    const response = await request(createApp()).get("/api/v1/jobs");

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({
      page: 1,
      pageSize: 20,
      totalItems: 2,
      totalPages: 1,
    });
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data.map((job: { slug: string }) => job.slug).sort()).toEqual([
      `${jobSlugPrefix}-backend`,
      `${jobSlugPrefix}-frontend`,
    ]);
    expect(response.body.data.every((job: { status: string }) => job.status === "open")).toBe(
      true,
    );
  });

  it("filters public jobs by search and type", async () => {
    await prisma.job.createMany({
      data: [
        {
          id: "job-open-3",
          title: "Backend Engineer",
          slug: `${jobSlugPrefix}-backend-filter`,
          status: "open",
          type: "full_time",
        },
        {
          id: "job-open-4",
          title: "Backend Contractor",
          slug: `${jobSlugPrefix}-backend-contract`,
          status: "open",
          type: "contract",
        },
      ],
    });

    const response = await request(createApp()).get(
      "/api/v1/jobs?search=backend&type=contract&page=1&pageSize=10",
    );

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
    });
    expect(response.body.data).toEqual([
      expect.objectContaining({
        slug: `${jobSlugPrefix}-backend-contract`,
        type: "contract",
      }),
    ]);
  });

  it("caps public jobs page size and returns accurate pagination metadata", async () => {
    await prisma.job.createMany({
      data: Array.from({ length: 101 }, (_, index) => ({
        id: randomUUID(),
        title: `Open Role ${index + 1}`,
        slug: `${jobSlugPrefix}-page-cap-${index + 1}`,
        status: "open",
        type: "full_time" as const,
      })),
    });

    const response = await request(createApp()).get("/api/v1/jobs?page=1&pageSize=500");

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({
      page: 1,
      pageSize: 100,
      totalItems: 101,
      totalPages: 2,
    });
    expect(response.body.data).toHaveLength(100);
  });

  it("returns public job detail with ordered questions", async () => {
    await prisma.job.create({
      data: {
        id: "job-open-5",
        title: "Product Designer",
        slug: `${jobSlugPrefix}-detail`,
        status: "open",
        type: "full_time",
        questions: {
          create: [
            {
              id: "question-2",
              label: "Portfolio URL",
              type: "url",
              required: true,
              displayOrder: 2,
            },
            {
              id: "question-1",
              label: "Years of experience",
              type: "number",
              required: true,
              displayOrder: 1,
            },
          ],
        },
      },
    });

    const response = await request(createApp()).get(`/api/v1/jobs/${jobSlugPrefix}-detail`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        slug: `${jobSlugPrefix}-detail`,
        status: "open",
        questions: [
          expect.objectContaining({
            id: "question-1",
            label: "Years of experience",
            displayOrder: 1,
          }),
          expect.objectContaining({
            id: "question-2",
            label: "Portfolio URL",
            displayOrder: 2,
          }),
        ],
      }),
    );
  });

  it("returns not found for non-open public job detail", async () => {
    await prisma.job.create({
      data: {
        id: "job-closed-1",
        title: "Closed Role",
        slug: `${jobSlugPrefix}-closed`,
        status: "closed",
        type: "full_time",
      },
    });

    const response = await request(createApp()).get(`/api/v1/jobs/${jobSlugPrefix}-closed`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Job not found.",
      },
    });
  });

  it("submits a public job application with resume and question responses", async () => {
    const yearsQuestionId = randomUUID();
    const stackQuestionId = randomUUID();

    await prisma.job.create({
      data: {
        id: randomUUID(),
        title: "Applied Role",
        slug: `${jobSlugPrefix}-apply`,
        status: "open",
        type: "full_time",
        questions: {
          create: [
            {
              id: yearsQuestionId,
              label: "Years of experience",
              type: "number",
              required: true,
              displayOrder: 1,
            },
            {
              id: stackQuestionId,
              label: "Primary stack",
              type: "single_select",
              required: true,
              options: [
                { label: "TypeScript", value: "typescript" },
                { label: "Go", value: "go" },
              ],
              displayOrder: 2,
            },
          ],
        },
      },
    });

    const response = await request(createApp())
      .post(`/api/v1/jobs/${jobSlugPrefix}-apply/applications`)
      .field("firstName", "Ada")
      .field("lastName", "Lovelace")
      .field("email", `${candidateEmailPrefix}+apply@example.com`)
      .field(
        "questionResponses",
        JSON.stringify([
          { questionId: yearsQuestionId, value: 5 },
          { questionId: stackQuestionId, value: "typescript" },
        ]),
      )
      .attach("resume", testResumeBuffer, {
        filename: "resume.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        status: "new",
        job: expect.objectContaining({
          slug: `${jobSlugPrefix}-apply`,
        }),
        candidate: {
          firstName: "Ada",
          lastName: "Lovelace",
          email: `${candidateEmailPrefix}+apply@example.com`,
        },
      }),
    );

    const savedApplication = await prisma.application.findUniqueOrThrow({
      where: { id: response.body.data.id },
      include: {
        candidate: true,
        questionResponses: true,
      },
    });

    expect(savedApplication.candidate.email).toBe(`${candidateEmailPrefix}+apply@example.com`);
    expect(savedApplication.resumeFileUrl).toContain(`${env.uploads.resumesPublicPath}/`);
    expect(savedApplication.questionResponses).toHaveLength(2);
  });

  it("rejects duplicate applications for the same candidate and job", async () => {
    await prisma.job.create({
      data: {
        id: randomUUID(),
        title: "Duplicate Application Role",
        slug: `${jobSlugPrefix}-duplicate-application`,
        status: "open",
        type: "full_time",
      },
    });

    const firstRequest = request(createApp())
      .post(`/api/v1/jobs/${jobSlugPrefix}-duplicate-application/applications`)
      .field("firstName", "Ada")
      .field("lastName", "Lovelace")
      .field("email", `${candidateEmailPrefix}+duplicate@example.com`)
      .attach("resume", testResumeBuffer, {
        filename: "resume.pdf",
        contentType: "application/pdf",
      });

    const secondRequest = request(createApp())
      .post(`/api/v1/jobs/${jobSlugPrefix}-duplicate-application/applications`)
      .field("firstName", "Ada")
      .field("lastName", "Lovelace")
      .field("email", `${candidateEmailPrefix}+duplicate@example.com`)
      .attach("resume", testResumeBuffer, {
        filename: "resume.pdf",
        contentType: "application/pdf",
      });

    expect((await firstRequest).status).toBe(201);

    const response = await secondRequest;

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: "APPLICATION_ALREADY_EXISTS",
        message: "An application already exists for this candidate and job.",
      },
    });
  });

  it("rejects invalid job question responses during application", async () => {
    const stackQuestionId = randomUUID();

    await prisma.job.create({
      data: {
        id: randomUUID(),
        title: "Validation Role",
        slug: `${jobSlugPrefix}-invalid-question`,
        status: "open",
        type: "full_time",
        questions: {
          create: {
            id: stackQuestionId,
            label: "Primary stack",
            type: "single_select",
            required: true,
            options: [
              { label: "TypeScript", value: "typescript" },
              { label: "Go", value: "go" },
            ],
            displayOrder: 1,
          },
        },
      },
    });

    const response = await request(createApp())
      .post(`/api/v1/jobs/${jobSlugPrefix}-invalid-question/applications`)
      .field("firstName", "Ada")
      .field("lastName", "Lovelace")
      .field("email", `${candidateEmailPrefix}+invalid-question@example.com`)
      .field(
        "questionResponses",
        JSON.stringify([{ questionId: stackQuestionId, value: "rust" }]),
      )
      .attach("resume", testResumeBuffer, {
        filename: "resume.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_QUESTION_RESPONSE",
        message: 'Question "Primary stack" requires one of the configured options.',
      },
    });
  });

  it("rejects applications for non-open jobs", async () => {
    await prisma.job.create({
      data: {
        id: randomUUID(),
        title: "Closed Application Role",
        slug: `${jobSlugPrefix}-closed-application`,
        status: "closed",
        type: "full_time",
      },
    });

    const response = await request(createApp())
      .post(`/api/v1/jobs/${jobSlugPrefix}-closed-application/applications`)
      .field("firstName", "Ada")
      .field("lastName", "Lovelace")
      .field("email", `${candidateEmailPrefix}+closed@example.com`)
      .attach("resume", testResumeBuffer, {
        filename: "resume.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "JOB_NOT_OPEN",
        message: "This job is not currently accepting applications.",
      },
    });
  });

  it("requires a resume file for public applications", async () => {
    await prisma.job.create({
      data: {
        id: randomUUID(),
        title: "Resume Required Role",
        slug: `${jobSlugPrefix}-missing-resume`,
        status: "open",
        type: "full_time",
      },
    });

    const response = await request(createApp())
      .post(`/api/v1/jobs/${jobSlugPrefix}-missing-resume/applications`)
      .field("firstName", "Ada")
      .field("lastName", "Lovelace")
      .field("email", `${candidateEmailPrefix}+missing-resume@example.com`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "MISSING_RESUME_FILE",
        message: "Resume file is required.",
      },
    });
  });

  it("rejects invalid resume file types for public applications", async () => {
    await prisma.job.create({
      data: {
        id: randomUUID(),
        title: "Resume Type Role",
        slug: `${jobSlugPrefix}-invalid-resume-type`,
        status: "open",
        type: "full_time",
      },
    });

    const response = await request(createApp())
      .post(`/api/v1/jobs/${jobSlugPrefix}-invalid-resume-type/applications`)
      .field("firstName", "Ada")
      .field("lastName", "Lovelace")
      .field("email", `${candidateEmailPrefix}+invalid-resume-type@example.com`)
      .attach("resume", Buffer.from("plain text resume"), {
        filename: "resume.txt",
        contentType: "text/plain",
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_RESUME_FILE_TYPE",
        message: "Resume must be a PDF, DOC, or DOCX file.",
      },
    });
  });

  it("rejects oversized resume uploads for public applications", async () => {
    await prisma.job.create({
      data: {
        id: randomUUID(),
        title: "Resume Size Role",
        slug: `${jobSlugPrefix}-oversized-resume`,
        status: "open",
        type: "full_time",
      },
    });

    const oversizedResume = Buffer.alloc(env.uploads.maxResumeFileSizeBytes + 1, 0);

    const response = await request(createApp())
      .post(`/api/v1/jobs/${jobSlugPrefix}-oversized-resume/applications`)
      .field("firstName", "Ada")
      .field("lastName", "Lovelace")
      .field("email", `${candidateEmailPrefix}+oversized-resume@example.com`)
      .attach("resume", oversizedResume, {
        filename: "resume.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "RESUME_FILE_TOO_LARGE",
        message: `Resume must be ${env.uploads.maxResumeFileSizeBytes} bytes or smaller.`,
      },
    });
  });

  it("rejects malformed question response payloads for public applications", async () => {
    await prisma.job.create({
      data: {
        id: randomUUID(),
        title: "Malformed Question Responses Role",
        slug: `${jobSlugPrefix}-malformed-question-responses`,
        status: "open",
        type: "full_time",
      },
    });

    const response = await request(createApp())
      .post(`/api/v1/jobs/${jobSlugPrefix}-malformed-question-responses/applications`)
      .field("firstName", "Ada")
      .field("lastName", "Lovelace")
      .field("email", `${candidateEmailPrefix}+malformed-question-responses@example.com`)
      .field("questionResponses", "{not-json")
      .attach("resume", testResumeBuffer, {
        filename: "resume.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_QUESTION_RESPONSES",
        message: "questionResponses must be a valid JSON array.",
      },
    });
  });

  it("rejects unauthenticated admin jobs requests", async () => {
    const response = await request(createApp()).get("/api/v1/admin/jobs");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication is required.",
      },
    });
  });

  it("rejects unauthenticated admin application review requests", async () => {
    const listResponse = await request(createApp()).get(
      `/api/v1/admin/jobs/${randomUUID()}/applications`,
    );
    const detailResponse = await request(createApp()).get(
      `/api/v1/admin/applications/${randomUUID()}`,
    );
    const updateResponse = await request(createApp())
      .patch(`/api/v1/admin/applications/${randomUUID()}`)
      .send({ status: "screening" });

    for (const response of [listResponse, detailResponse, updateResponse]) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication is required.",
        },
      });
    }
  });

  it("lists all jobs for authenticated admins across statuses", async () => {
    const agent = await createAuthenticatedAgent();

    await prisma.job.createMany({
      data: [
        {
          id: randomUUID(),
          title: "Draft Admin Role",
          slug: `${jobSlugPrefix}-admin-draft`,
          status: "draft",
          type: "full_time",
        },
        {
          id: randomUUID(),
          title: "Archived Admin Role",
          slug: `${jobSlugPrefix}-admin-archived`,
          status: "archived",
          type: "contract",
        },
      ],
    });

    const response = await agent
      .get("/api/v1/admin/jobs?status=draft&page=1&pageSize=10")
      .set("Origin", env.auth.origin);

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
    });
    expect(response.body.data).toEqual([
      expect.objectContaining({
        slug: `${jobSlugPrefix}-admin-draft`,
        status: "draft",
        autoScoreOnApply: true,
      }),
    ]);
  });

  it("creates an admin job with questions", async () => {
    const agent = await createAuthenticatedAgent();

    const response = await agent
      .post("/api/v1/admin/jobs")
      .set("Origin", env.auth.origin)
      .send({
        title: "Senior Backend Engineer",
        slug: `${jobSlugPrefix}-create`,
        description: "Own backend platform work.",
        location: "Addis Ababa",
        type: "full_time",
        status: "draft",
        remoteStatus: "hybrid",
        experienceLevel: "senior",
        autoScoreOnApply: false,
        questions: [
          {
            type: "single_select",
            label: "Primary language",
            options: [
              { label: "TypeScript", value: "typescript" },
              { label: "Go", value: "go" },
            ],
            displayOrder: 1,
          },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        slug: `${jobSlugPrefix}-create`,
        status: "draft",
        autoScoreOnApply: false,
        applicationCount: 0,
        questions: [
          expect.objectContaining({
            label: "Primary language",
            type: "single_select",
            displayOrder: 1,
          }),
        ],
      }),
    );
  });

  it("returns admin job detail with internal fields", async () => {
    const agent = await createAuthenticatedAgent();
    const job = await prisma.job.create({
      data: {
        id: randomUUID(),
        title: "Admin Detail Role",
        slug: `${jobSlugPrefix}-admin-detail`,
        status: "draft",
        type: "part_time",
        autoScoreOnApply: false,
        questions: {
          create: {
            id: randomUUID(),
            label: "Availability",
            type: "short_text",
            required: true,
            displayOrder: 1,
          },
        },
      },
    });

    const response = await agent
      .get(`/api/v1/admin/jobs/${job.id}`)
      .set("Origin", env.auth.origin);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        id: job.id,
        slug: `${jobSlugPrefix}-admin-detail`,
        status: "draft",
        autoScoreOnApply: false,
        applicationCount: 0,
      }),
    );
    expect(response.body.data.questions).toEqual([
      expect.objectContaining({
        label: "Availability",
        displayOrder: 1,
      }),
    ]);
  });

  it("updates an admin job and replaces its question set", async () => {
    const agent = await createAuthenticatedAgent();
    const job = await prisma.job.create({
      data: {
        id: randomUUID(),
        title: "Original Role",
        slug: `${jobSlugPrefix}-admin-update`,
        status: "draft",
        type: "full_time",
        questions: {
          create: {
            id: randomUUID(),
            label: "Old Question",
            type: "short_text",
            required: true,
            displayOrder: 0,
          },
        },
      },
    });

    const response = await agent
      .patch(`/api/v1/admin/jobs/${job.id}`)
      .set("Origin", env.auth.origin)
      .send({
        title: "Updated Role",
        status: "open",
        autoScoreOnApply: false,
        questions: [
          {
            type: "multi_select",
            label: "Preferred stacks",
            options: [
              { label: "Node.js", value: "node" },
              { label: "Go", value: "go" },
            ],
            displayOrder: 2,
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        id: job.id,
        title: "Updated Role",
        status: "open",
        autoScoreOnApply: false,
      }),
    );
    expect(response.body.data.questions).toEqual([
      expect.objectContaining({
        label: "Preferred stacks",
        type: "multi_select",
        displayOrder: 2,
      }),
    ]);
  });

  it("lists job applications for authenticated admins with pagination and filters", async () => {
    const agent = await createAuthenticatedAgent();
    const job = await prisma.job.create({
      data: {
        id: randomUUID(),
        title: "Admin Review Role",
        slug: `${jobSlugPrefix}-applications-list`,
        status: "open",
        type: "full_time",
      },
    });

    const firstCandidate = await prisma.candidate.create({
      data: {
        id: randomUUID(),
        firstName: "Grace",
        lastName: "Hopper",
        email: `${candidateEmailPrefix}+grace@example.com`,
      },
    });
    const secondCandidate = await prisma.candidate.create({
      data: {
        id: randomUUID(),
        firstName: "Katherine",
        lastName: "Johnson",
        email: `${candidateEmailPrefix}+katherine@example.com`,
      },
    });

    await prisma.application.createMany({
      data: [
        {
          id: randomUUID(),
          jobId: job.id,
          candidateId: firstCandidate.id,
          status: "screening",
          resumeFileUrl: `${env.auth.origin}${env.uploads.resumesPublicPath}/grace.pdf`,
          resumeFileName: "grace.pdf",
          resumeMimeType: "application/pdf",
          resumeSizeBytes: 1234,
          submittedAt: new Date("2026-04-25T09:00:00.000Z"),
        },
        {
          id: randomUUID(),
          jobId: job.id,
          candidateId: secondCandidate.id,
          status: "rejected",
          resumeFileUrl: `${env.auth.origin}${env.uploads.resumesPublicPath}/katherine.pdf`,
          resumeFileName: "katherine.pdf",
          resumeMimeType: "application/pdf",
          resumeSizeBytes: 2345,
          submittedAt: new Date("2026-04-24T09:00:00.000Z"),
        },
      ],
    });

    const response = await agent
      .get(`/api/v1/admin/jobs/${job.id}/applications?status=screening&search=grace&page=1&pageSize=10`)
      .set("Origin", env.auth.origin);

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
    });
    expect(response.body.data).toEqual([
      expect.objectContaining({
        status: "screening",
        candidate: expect.objectContaining({
          firstName: "Grace",
          email: `${candidateEmailPrefix}+grace@example.com`,
        }),
      }),
    ]);
  });

  it("returns not found when listing applications for an unknown admin job", async () => {
    const agent = await createAuthenticatedAgent();

    const response = await agent
      .get(`/api/v1/admin/jobs/${randomUUID()}/applications`)
      .set("Origin", env.auth.origin);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Job not found.",
      },
    });
  });

  it("returns admin application detail with candidate, resume, and question responses", async () => {
    const agent = await createAuthenticatedAgent();
    const job = await prisma.job.create({
      data: {
        id: randomUUID(),
        title: "Admin Review Detail Role",
        slug: `${jobSlugPrefix}-application-detail`,
        status: "open",
        type: "full_time",
        questions: {
          create: [
            {
              id: randomUUID(),
              label: "Portfolio URL",
              type: "url",
              required: true,
              displayOrder: 2,
            },
            {
              id: randomUUID(),
              label: "Years of experience",
              type: "number",
              required: true,
              displayOrder: 1,
            },
          ],
        },
      },
      include: {
        questions: true,
      },
    });
    const candidate = await prisma.candidate.create({
      data: {
        id: randomUUID(),
        firstName: "Ada",
        lastName: "Lovelace",
        email: `${candidateEmailPrefix}+detail@example.com`,
        linkedinUrl: "https://www.linkedin.com/in/ada-lovelace",
      },
    });
    const application = await prisma.application.create({
      data: {
        id: randomUUID(),
        jobId: job.id,
        candidateId: candidate.id,
        status: "interview",
        resumeFileUrl: `${env.auth.origin}${env.uploads.resumesPublicPath}/ada-detail.pdf`,
        resumeFileName: "ada-detail.pdf",
        resumeMimeType: "application/pdf",
        resumeSizeBytes: 4567,
        coverLetterText: "I would love to build reliable systems.",
        submittedAt: new Date("2026-04-23T09:00:00.000Z"),
      },
    });

    await prisma.questionResponse.create({
      data: {
        id: randomUUID(),
        applicationId: application.id,
        questionId: job.questions[0].id,
        jobId: job.id,
        value: "https://portfolio.example.com/ada",
      },
    });
    await prisma.questionResponse.create({
      data: {
        id: randomUUID(),
        applicationId: application.id,
        questionId: job.questions[1].id,
        jobId: job.id,
        value: 7,
      },
    });

    const response = await agent
      .get(`/api/v1/admin/applications/${application.id}`)
      .set("Origin", env.auth.origin);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        id: application.id,
        status: "interview",
        job: expect.objectContaining({
          id: job.id,
          slug: `${jobSlugPrefix}-application-detail`,
        }),
        candidate: expect.objectContaining({
          firstName: "Ada",
          linkedinUrl: "https://www.linkedin.com/in/ada-lovelace",
        }),
        resumeFileName: "ada-detail.pdf",
        resumeMimeType: "application/pdf",
        resumeSizeBytes: 4567,
        coverLetterText: "I would love to build reliable systems.",
      }),
    );
    expect(response.body.data.questionResponses).toEqual([
      expect.objectContaining({
        value: 7,
        question: expect.objectContaining({
          label: "Years of experience",
          displayOrder: 1,
        }),
      }),
      expect.objectContaining({
        value: "https://portfolio.example.com/ada",
        question: expect.objectContaining({
          label: "Portfolio URL",
          displayOrder: 2,
        }),
      }),
    ]);
  });

  it("updates an admin application status", async () => {
    const agent = await createAuthenticatedAgent();
    const job = await prisma.job.create({
      data: {
        id: randomUUID(),
        title: "Admin Review Update Role",
        slug: `${jobSlugPrefix}-application-update`,
        status: "open",
        type: "full_time",
      },
    });
    const candidate = await prisma.candidate.create({
      data: {
        id: randomUUID(),
        firstName: "Barbara",
        lastName: "Liskov",
        email: `${candidateEmailPrefix}+update@example.com`,
      },
    });
    const application = await prisma.application.create({
      data: {
        id: randomUUID(),
        jobId: job.id,
        candidateId: candidate.id,
        status: "screening",
        resumeFileUrl: `${env.auth.origin}${env.uploads.resumesPublicPath}/barbara.pdf`,
        resumeFileName: "barbara.pdf",
        resumeMimeType: "application/pdf",
        resumeSizeBytes: 3456,
        submittedAt: new Date("2026-04-22T09:00:00.000Z"),
      },
    });

    const response = await agent
      .patch(`/api/v1/admin/applications/${application.id}`)
      .set("Origin", env.auth.origin)
      .send({
        status: "interview",
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        id: application.id,
        status: "interview",
      }),
    );

    const savedApplication = await prisma.application.findUniqueOrThrow({
      where: { id: application.id },
    });

    expect(savedApplication.status).toBe("interview");
  });

  it("returns not found for unknown admin application detail and update requests", async () => {
    const agent = await createAuthenticatedAgent();
    const missingId = randomUUID();

    const detailResponse = await agent
      .get(`/api/v1/admin/applications/${missingId}`)
      .set("Origin", env.auth.origin);
    const updateResponse = await agent
      .patch(`/api/v1/admin/applications/${missingId}`)
      .set("Origin", env.auth.origin)
      .send({
        status: "screening",
      });

    for (const response of [detailResponse, updateResponse]) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: {
          code: "NOT_FOUND",
          message: "Application not found.",
        },
      });
    }
  });

  it("rejects invalid admin application status transitions", async () => {
    const agent = await createAuthenticatedAgent();
    const job = await prisma.job.create({
      data: {
        id: randomUUID(),
        title: "Admin Review Transition Role",
        slug: `${jobSlugPrefix}-application-transition`,
        status: "open",
        type: "full_time",
      },
    });
    const candidate = await prisma.candidate.create({
      data: {
        id: randomUUID(),
        firstName: "Margaret",
        lastName: "Hamilton",
        email: `${candidateEmailPrefix}+transition@example.com`,
      },
    });
    const application = await prisma.application.create({
      data: {
        id: randomUUID(),
        jobId: job.id,
        candidateId: candidate.id,
        status: "hired",
        resumeFileUrl: `${env.auth.origin}${env.uploads.resumesPublicPath}/margaret.pdf`,
        resumeFileName: "margaret.pdf",
        resumeMimeType: "application/pdf",
        resumeSizeBytes: 5678,
        submittedAt: new Date("2026-04-21T09:00:00.000Z"),
      },
    });

    const response = await agent
      .patch(`/api/v1/admin/applications/${application.id}`)
      .set("Origin", env.auth.origin)
      .send({
        status: "screening",
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_APPLICATION_STATUS_TRANSITION",
        message: "Application status cannot change from hired to screening.",
      },
    });
  });

  it("rejects duplicate admin job slugs", async () => {
    const agent = await createAuthenticatedAgent();

    await prisma.job.create({
      data: {
        id: randomUUID(),
        title: "Existing Role",
        slug: `${jobSlugPrefix}-slug-conflict`,
        status: "draft",
        type: "full_time",
      },
    });

    const response = await agent
      .post("/api/v1/admin/jobs")
      .set("Origin", env.auth.origin)
      .send({
        title: "Conflicting Role",
        slug: `${jobSlugPrefix}-slug-conflict`,
        status: "draft",
        type: "full_time",
      });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: "JOB_SLUG_CONFLICT",
        message: "A job with this slug already exists.",
      },
    });
  });
});
