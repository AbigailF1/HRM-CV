import { Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "../../lib/prisma.js";
import type {
  CvRankJobStatusValue,
  CvRankMetricDefinition,
  CvRankResultStatusValue,
  CvRankerRoleTypeValue,
  UploadedCvFile,
} from "./cv-ranker.types.js";

export const cvRankerRoleConfigSelect = {
  id: true,
  roleType: true,
  defaultJobDescription: true,
  metrics: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CvRankerRoleConfigSelect;

export const cvRankResultSelect = {
  id: true,
  rankJobId: true,
  inputFileName: true,
  mimeType: true,
  status: true,
  name: true,
  email: true,
  finalScore: true,
  metricScores: true,
  llmSummary: true,
  extracted: true,
  errorMessage: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CvRankResultSelect;

export const cvRankJobDetailSelect = {
  id: true,
  roleType: true,
  jobDescription: true,
  metrics: true,
  status: true,
  webhookUrl: true,
  errorMessage: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  results: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: cvRankResultSelect,
  },
} satisfies Prisma.CvRankJobSelect;

export type CvRankerRoleConfigRecord = Prisma.CvRankerRoleConfigGetPayload<{
  select: typeof cvRankerRoleConfigSelect;
}>;

export type CvRankResultRecord = Prisma.CvRankResultGetPayload<{
  select: typeof cvRankResultSelect;
}>;

export type CvRankJobDetailRecord = Prisma.CvRankJobGetPayload<{
  select: typeof cvRankJobDetailSelect;
}>;

export type CreateCvRankJobRepositoryInput = {
  roleType: CvRankerRoleTypeValue;
  jobDescription: string;
  metrics: CvRankMetricDefinition[];
  webhookUrl?: string;
  files: UploadedCvFile[];
};

export type CompleteCvRankResultInput = {
  name: string | null;
  email: string | null;
  finalScore: number;
  metricScores: Record<string, number>;
  llmSummary: string | null;
  extracted: Prisma.InputJsonValue;
};

export type CvRankerRepository = {
  prisma: PrismaClient;
  upsertRoleConfig(input: {
    roleType: Exclude<CvRankerRoleTypeValue, "Custom">;
    defaultJobDescription: string;
    metrics: CvRankMetricDefinition[];
  }): Promise<CvRankerRoleConfigRecord>;
  listRoleConfigs(): Promise<CvRankerRoleConfigRecord[]>;
  findRoleConfig(
    roleType: Exclude<CvRankerRoleTypeValue, "Custom">,
  ): Promise<CvRankerRoleConfigRecord | null>;
  updateRoleConfig(
    roleType: Exclude<CvRankerRoleTypeValue, "Custom">,
    input: {
      defaultJobDescription?: string;
      metrics?: CvRankMetricDefinition[];
    },
  ): Promise<CvRankerRoleConfigRecord>;
  createRankJob(input: CreateCvRankJobRepositoryInput): Promise<CvRankJobDetailRecord>;
  findRankJobById(id: string): Promise<CvRankJobDetailRecord | null>;
  updateRankJobStatus(
    id: string,
    input: {
      status: CvRankJobStatusValue;
      errorMessage?: string | null;
      completedAt?: Date | null;
    },
  ): Promise<void>;
  updateRankResultStatus(
    id: string,
    status: CvRankResultStatusValue,
    errorMessage?: string | null,
  ): Promise<void>;
  completeRankResult(id: string, input: CompleteCvRankResultInput): Promise<void>;
};

const toJson = (value: unknown) => value as Prisma.InputJsonValue;

export const createCvRankerRepository = (
  prisma: PrismaClient = getPrisma(),
): CvRankerRepository => {
  return {
    prisma,
    async upsertRoleConfig(input) {
      return prisma.cvRankerRoleConfig.upsert({
        where: { roleType: input.roleType },
        update: {},
        create: {
          roleType: input.roleType,
          defaultJobDescription: input.defaultJobDescription,
          metrics: toJson(input.metrics),
        },
        select: cvRankerRoleConfigSelect,
      });
    },
    async listRoleConfigs() {
      return prisma.cvRankerRoleConfig.findMany({
        where: {
          roleType: {
            in: ["ML", "Math"],
          },
        },
        orderBy: [{ roleType: "asc" }],
        select: cvRankerRoleConfigSelect,
      });
    },
    async findRoleConfig(roleType) {
      return prisma.cvRankerRoleConfig.findUnique({
        where: { roleType },
        select: cvRankerRoleConfigSelect,
      });
    },
    async updateRoleConfig(roleType, input) {
      return prisma.cvRankerRoleConfig.update({
        where: { roleType },
        data: {
          defaultJobDescription: input.defaultJobDescription,
          metrics: input.metrics ? toJson(input.metrics) : undefined,
        },
        select: cvRankerRoleConfigSelect,
      });
    },
    async createRankJob(input) {
      return prisma.$transaction(async (tx) => {
        const rankJob = await tx.cvRankJob.create({
          data: {
            roleType: input.roleType,
            jobDescription: input.jobDescription,
            metrics: toJson(input.metrics),
            webhookUrl: input.webhookUrl,
          },
          select: {
            id: true,
          },
        });
        const results: CvRankResultRecord[] = [];

        for (const file of input.files) {
          results.push(
            await tx.cvRankResult.create({
              data: {
                rankJobId: rankJob.id,
                inputFileName: file.originalName,
                mimeType: file.mimeType,
              },
              select: cvRankResultSelect,
            }),
          );
        }

        const createdJob = await tx.cvRankJob.findUniqueOrThrow({
          where: { id: rankJob.id },
          select: cvRankJobDetailSelect,
        });

        return {
          ...createdJob,
          results,
        };
      });
    },
    async findRankJobById(id) {
      return prisma.cvRankJob.findUnique({
        where: { id },
        select: cvRankJobDetailSelect,
      });
    },
    async updateRankJobStatus(id, input) {
      await prisma.cvRankJob.update({
        where: { id },
        data: {
          status: input.status,
          errorMessage: input.errorMessage,
          completedAt: input.completedAt,
        },
      });
    },
    async updateRankResultStatus(id, status, errorMessage = null) {
      await prisma.cvRankResult.update({
        where: { id },
        data: {
          status,
          errorMessage,
        },
      });
    },
    async completeRankResult(id, input) {
      await prisma.cvRankResult.update({
        where: { id },
        data: {
          status: "completed",
          name: input.name,
          email: input.email,
          finalScore: input.finalScore,
          metricScores: toJson(input.metricScores),
          llmSummary: input.llmSummary,
          extracted: input.extracted,
          errorMessage: null,
        },
      });
    },
  };
};
