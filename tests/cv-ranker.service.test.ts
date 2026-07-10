import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { resolveResumeStoragePath } from "../src/modules/jobs/jobs.upload";
import { createCvRankerService } from "../src/modules/cv-ranker/cv-ranker.service";
import type {
  CreateCvRankJobRepositoryInput,
  CvRankJobDetailRecord,
  CvRankerRepository,
  CvRankerRoleConfigRecord,
} from "../src/modules/cv-ranker/cv-ranker.repository";

const metric = {
  id: "python_skills",
  name: "Python skills",
  description: "Python programming experience",
  weight: 100,
};

const createRoleConfig = (roleType: "ML" | "Math"): CvRankerRoleConfigRecord => ({
  id: `${roleType.toLowerCase()}-config`,
  roleType,
  defaultJobDescription: `${roleType} default job description`,
  metrics: [metric],
  createdAt: new Date("2026-06-15T00:00:00.000Z"),
  updatedAt: new Date("2026-06-15T00:00:00.000Z"),
});

const createRankJob = (id: string): CvRankJobDetailRecord => ({
  id,
  roleType: "ML",
  jobDescription: "ML job",
  metrics: [metric],
  status: "queued",
  webhookUrl: null,
  errorMessage: null,
  completedAt: null,
  createdAt: new Date("2026-06-15T00:00:00.000Z"),
  updatedAt: new Date("2026-06-15T00:00:00.000Z"),
  results: [],
});

const createRankJobFromInput = (
  id: string,
  input: CreateCvRankJobRepositoryInput,
): CvRankJobDetailRecord => ({
  id,
  roleType: input.roleType,
  jobDescription: input.jobDescription,
  metrics: input.metrics,
  status: "queued",
  webhookUrl: input.webhookUrl ?? null,
  errorMessage: null,
  completedAt: null,
  createdAt: new Date("2026-06-15T00:00:00.000Z"),
  updatedAt: new Date("2026-06-15T00:00:00.000Z"),
  results: input.files.map((file, index) => ({
    id: `rank-result-${index + 1}`,
    rankJobId: id,
    applicationId: file.applicationId ?? null,
    inputFileName: file.originalName,
    mimeType: file.mimeType,
    storageKey: file.storageKey,
    sizeBytes: file.sizeBytes,
    status: "pending",
    name: null,
    email: null,
    finalScore: null,
    metricScores: null,
    llmSummary: null,
    extracted: null,
    errorMessage: null,
    createdAt: new Date("2026-06-15T00:00:00.000Z"),
    updatedAt: new Date("2026-06-15T00:00:00.000Z"),
  })),
});

const createRepository = (
  overrides: Partial<CvRankerRepository> = {},
): CvRankerRepository =>
  ({
    prisma: {} as CvRankerRepository["prisma"],
    upsertRoleConfig: vi.fn(async ({ roleType }) => createRoleConfig(roleType)),
    listRoleConfigs: vi.fn(async () => [createRoleConfig("ML"), createRoleConfig("Math")]),
    findRoleConfig: vi.fn(async (roleType) => createRoleConfig(roleType)),
    updateRoleConfig: vi.fn(async (roleType) => createRoleConfig(roleType)),
    createRankJob: vi.fn(),
    findJobForApplicationRank: vi.fn(),
    listApplicationsForApplicationRank: vi.fn(),
    findRankJobById: vi.fn(),
    findRecoverableRankJobs: vi.fn(async () => []),
    updateRankJobStatus: vi.fn(),
    updateRankResultStatus: vi.fn(),
    completeRankResult: vi.fn(),
    ...overrides,
  }) as CvRankerRepository;

describe("cv ranker service", () => {
  it("retries default role config initialization after a failed seed attempt", async () => {
    let shouldFail = true;
    const upsertRoleConfig = vi.fn(async ({ roleType }: { roleType: "ML" | "Math" }) => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("database temporarily unavailable");
      }

      return createRoleConfig(roleType);
    });
    const repository = createRepository({ upsertRoleConfig });
    const service = createCvRankerService(repository);

    await expect(service.listRoleConfigs()).rejects.toThrow("database temporarily unavailable");
    await expect(service.listRoleConfigs()).resolves.toHaveLength(2);
    expect(upsertRoleConfig).toHaveBeenCalledTimes(4);
  });

  it("schedules queued rank jobs for recovery", async () => {
    vi.useFakeTimers();

    const repository = createRepository({
      findRecoverableRankJobs: vi.fn(async () => [createRankJob("rank-job-1")]),
    });
    const service = createCvRankerService(repository);
    const processRankJob = vi.fn(async () => undefined);

    service.processRankJob = processRankJob;

    await expect(service.recoverPendingRankJobs()).resolves.toBe(1);
    await vi.runAllTimersAsync();

    expect(processRankJob).toHaveBeenCalledWith("rank-job-1");

    vi.useRealTimers();
  });

  it("creates a rank job from existing job applications without requiring CV uploads", async () => {
    vi.useFakeTimers();

    const resumeStorageKey = `application-rank-${randomUUID()}.pdf`;
    const resumePath = resolveResumeStoragePath(resumeStorageKey);
    const savedCvPaths: string[] = [];

    await mkdir(dirname(resumePath), { recursive: true });
    await writeFile(resumePath, Buffer.from("%PDF-1.4 application resume"));

    const createRankJob = vi.fn(async (input: CreateCvRankJobRepositoryInput) => {
      savedCvPaths.push(...input.files.map((file) => file.storagePath));
      return createRankJobFromInput("rank-job-1", input);
    });
    const repository = createRepository({
      createRankJob,
      findJobForApplicationRank: vi.fn(async () => ({
        id: "job-1",
        title: "ML Intern",
        description: "Looking for Python and PyTorch project experience.",
        status: "open",
      })),
      listApplicationsForApplicationRank: vi.fn(async () => [
        {
          id: "application-1",
          resumeStorageKey,
          resumeFileName: "ada-resume.pdf",
          resumeMimeType: "application/pdf",
          resumeSizeBytes: 27,
          candidate: {
            firstName: "Ada",
            lastName: "Lovelace",
            email: "ada@example.com",
          },
        },
      ]),
    });
    const service = createCvRankerService(repository);
    const processRankJob = vi.fn(async () => undefined);

    service.processRankJob = processRankJob;

    try {
      const rankJob = await service.startApplicationRankJob("job-1", {
        roleType: "ML",
      });
      await vi.runAllTimersAsync();

      expect(rankJob.job_id).toBe("rank-job-1");
      expect(rankJob.job_description).toContain("ML Intern");
      expect(rankJob.results[0]).toMatchObject({
        application_id: "application-1",
        input_file_name: "ada-resume.pdf",
      });
      expect(createRankJob).toHaveBeenCalledWith(
        expect.objectContaining({
          roleType: "ML",
          files: [
            expect.objectContaining({
              applicationId: "application-1",
              originalName: "ada-resume.pdf",
            }),
          ],
        }),
      );
      expect(processRankJob).toHaveBeenCalledWith("rank-job-1");
    } finally {
      await Promise.allSettled([
        unlink(resumePath),
        ...savedCvPaths.map((path) => unlink(path)),
      ]);
      vi.useRealTimers();
    }
  });
});
