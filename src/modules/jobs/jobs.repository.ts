import { Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "../../lib/prisma.js";
import type {
  AdminApplicationsListParams,
  AdminJobsListParams,
  ApplicationStatusValue,
  ApplyToJobInput,
  CreateJobInput,
  JobsListParams,
  SavedResumeFile,
  UpdateJobInput,
} from "./jobs.types.js";

export const publicJobSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  location: true,
  type: true,
  status: true,
  remoteStatus: true,
  experienceLevel: true,
  validThrough: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.JobSelect;

export const publicJobQuestionSelect = {
  id: true,
  type: true,
  label: true,
  description: true,
  required: true,
  options: true,
  displayOrder: true,
} satisfies Prisma.JobQuestionSelect;

export const publicJobDetailSelect = {
  ...publicJobSelect,
  questions: {
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: publicJobQuestionSelect,
  },
} satisfies Prisma.JobSelect;

export const adminJobSelect = {
  ...publicJobSelect,
  autoScoreOnApply: true,
} satisfies Prisma.JobSelect;

export const adminJobDetailSelect = {
  ...adminJobSelect,
  questions: {
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: publicJobQuestionSelect,
  },
  _count: {
    select: {
      applications: true,
    },
  },
} satisfies Prisma.JobSelect;

export const applicationTargetJobSelect = {
  id: true,
  title: true,
  slug: true,
  status: true,
  questions: {
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: publicJobQuestionSelect,
  },
} satisfies Prisma.JobSelect;

export const publicApplicationSubmissionSelect = {
  id: true,
  status: true,
  submittedAt: true,
  createdAt: true,
  job: {
    select: {
      id: true,
      slug: true,
      title: true,
    },
  },
  candidate: {
    select: {
      firstName: true,
      lastName: true,
      email: true,
    },
  },
} satisfies Prisma.ApplicationSelect;

export const candidateSummarySelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  linkedinUrl: true,
  portfolioUrl: true,
} satisfies Prisma.CandidateSelect;

export const adminApplicationSummarySelect = {
  id: true,
  status: true,
  submittedAt: true,
  createdAt: true,
  updatedAt: true,
  candidate: {
    select: candidateSummarySelect,
  },
} satisfies Prisma.ApplicationSelect;

export const adminApplicationDetailSelect = {
  ...adminApplicationSummarySelect,
  coverLetterText: true,
  resumeFileName: true,
  resumeMimeType: true,
  resumeSizeBytes: true,
  job: {
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
    },
  },
  questionResponses: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      value: true,
      createdAt: true,
      question: {
        select: publicJobQuestionSelect,
      },
    },
  },
} satisfies Prisma.ApplicationSelect;

export const adminApplicationResumeSelect = {
  id: true,
  resumeStorageKey: true,
  resumeFileName: true,
  resumeMimeType: true,
} satisfies Prisma.ApplicationSelect;

export type JobsRepository = {
  prisma: PrismaClient;
  listPublicJobs(params: JobsListParams): Promise<{
    jobs: PublicJobRecord[];
    totalItems: number;
  }>;
  findPublicJobBySlug(slug: string): Promise<PublicJobDetailRecord | null>;
  listAdminJobs(params: AdminJobsListParams): Promise<{
    jobs: AdminJobRecord[];
    totalItems: number;
  }>;
  findAdminJobById(id: string): Promise<AdminJobDetailRecord | null>;
  createJob(input: CreateJobInput): Promise<AdminJobDetailRecord>;
  updateJob(id: string, input: UpdateJobInput): Promise<AdminJobDetailRecord | null>;
  findJobBySlugForApplication(slug: string): Promise<ApplicationTargetJobRecord | null>;
  createApplicationSubmission(input: CreateApplicationSubmissionInput): Promise<PublicApplicationSubmissionRecord>;
  listApplicationsForAdminJob(
    jobId: string,
    params: AdminApplicationsListParams,
  ): Promise<{
    applications: AdminApplicationSummaryRecord[];
    totalItems: number;
  }>;
  findAdminApplicationById(id: string): Promise<AdminApplicationDetailRecord | null>;
  findAdminApplicationResumeById(id: string): Promise<AdminApplicationResumeRecord | null>;
  updateAdminApplicationStatus(
    id: string,
    status: ApplicationStatusValue,
  ): Promise<AdminApplicationDetailRecord | null>;
};

export type PublicJobRecord = Prisma.JobGetPayload<{
  select: typeof publicJobSelect;
}>;

export type PublicJobDetailRecord = Prisma.JobGetPayload<{
  select: typeof publicJobDetailSelect;
}>;

export type AdminJobRecord = Prisma.JobGetPayload<{
  select: typeof adminJobSelect;
}>;

export type AdminJobDetailRecord = Prisma.JobGetPayload<{
  select: typeof adminJobDetailSelect;
}>;

export type ApplicationTargetJobRecord = Prisma.JobGetPayload<{
  select: typeof applicationTargetJobSelect;
}>;

export type PublicApplicationSubmissionRecord = Prisma.ApplicationGetPayload<{
  select: typeof publicApplicationSubmissionSelect;
}>;

export type AdminApplicationSummaryRecord = Prisma.ApplicationGetPayload<{
  select: typeof adminApplicationSummarySelect;
}>;

export type AdminApplicationDetailRecord = Prisma.ApplicationGetPayload<{
  select: typeof adminApplicationDetailSelect;
}>;

export type AdminApplicationResumeRecord = Prisma.ApplicationGetPayload<{
  select: typeof adminApplicationResumeSelect;
}>;

export type CreateApplicationSubmissionInput = {
  jobId: string;
  candidate: ApplyToJobInput;
  resume: SavedResumeFile;
  questionResponses: Array<{
    questionId: string;
    value: Prisma.InputJsonValue;
  }>;
};

const mapJobQuestionCreateInput = (questions: NonNullable<CreateJobInput["questions"]>) => {
  return questions.map((question) => ({
    type: question.type,
    label: question.label,
    description: question.description,
    required: question.required,
    options: question.options ? question.options : Prisma.JsonNull,
    displayOrder: question.displayOrder,
  }));
};

const buildPublicJobsWhere = ({
  search,
  type,
  remoteStatus,
  experienceLevel,
  location,
}: Omit<JobsListParams, "page" | "pageSize" | "skip" | "take">): Prisma.JobWhereInput => {
  return {
    status: "open",
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(type ? { type } : {}),
    ...(remoteStatus ? { remoteStatus } : {}),
    ...(experienceLevel ? { experienceLevel } : {}),
    ...(location ? { location: { contains: location, mode: "insensitive" } } : {}),
  };
};

const buildAdminJobsWhere = ({
  search,
  type,
  status,
  remoteStatus,
  experienceLevel,
  location,
}: Omit<AdminJobsListParams, "page" | "pageSize" | "skip" | "take">): Prisma.JobWhereInput => {
  return {
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(type ? { type } : {}),
    ...(remoteStatus ? { remoteStatus } : {}),
    ...(experienceLevel ? { experienceLevel } : {}),
    ...(location ? { location: { contains: location, mode: "insensitive" } } : {}),
  };
};

const buildAdminApplicationsWhere = (
  jobId: string,
  {
    search,
    status,
  }: Omit<AdminApplicationsListParams, "page" | "pageSize" | "skip" | "take">,
): Prisma.ApplicationWhereInput => {
  return {
    jobId,
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { candidate: { firstName: { contains: search, mode: "insensitive" } } },
            { candidate: { lastName: { contains: search, mode: "insensitive" } } },
            { candidate: { email: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
};

export const createJobsRepository = (prisma: PrismaClient = getPrisma()): JobsRepository => {
  return {
    prisma,
    async listPublicJobs(params) {
      const where = buildPublicJobsWhere(params);
      const [jobs, totalItems] = await prisma.$transaction([
        prisma.job.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: params.skip,
          take: params.take,
          select: publicJobSelect,
        }),
        prisma.job.count({ where }),
      ]);

      return { jobs, totalItems };
    },
    async findPublicJobBySlug(slug) {
      return prisma.job.findFirst({
        where: {
          slug,
          status: "open",
        },
        select: publicJobDetailSelect,
      });
    },
    async listAdminJobs(params) {
      const where = buildAdminJobsWhere(params);
      const [jobs, totalItems] = await prisma.$transaction([
        prisma.job.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: params.skip,
          take: params.take,
          select: adminJobSelect,
        }),
        prisma.job.count({ where }),
      ]);

      return { jobs, totalItems };
    },
    async findAdminJobById(id) {
      return prisma.job.findUnique({
        where: { id },
        select: adminJobDetailSelect,
      });
    },
    async createJob(input) {
      return prisma.job.create({
        data: {
          title: input.title,
          slug: input.slug,
          description: input.description,
          location: input.location,
          type: input.type,
          status: input.status,
          remoteStatus: input.remoteStatus,
          experienceLevel: input.experienceLevel,
          validThrough: input.validThrough,
          autoScoreOnApply: input.autoScoreOnApply,
          questions: input.questions?.length
            ? {
                create: mapJobQuestionCreateInput(input.questions),
              }
            : undefined,
        },
        select: adminJobDetailSelect,
      });
    },
    async updateJob(id, input) {
      const existingJob = await prisma.job.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!existingJob) {
        return null;
      }

      await prisma.$transaction(async (tx) => {
        await tx.job.update({
          where: { id },
          data: {
            title: input.title,
            slug: input.slug,
            description: input.description,
            location: input.location,
            type: input.type,
            status: input.status,
            remoteStatus: input.remoteStatus,
            experienceLevel: input.experienceLevel,
            validThrough: input.validThrough,
            autoScoreOnApply: input.autoScoreOnApply,
            ...(input.questions
              ? {
                  questions: {
                    deleteMany: {},
                    ...(input.questions.length > 0
                      ? {
                          create: mapJobQuestionCreateInput(input.questions),
                        }
                      : {}),
                  },
                }
              : {}),
          },
        });
      });

      return prisma.job.findUnique({
        where: { id },
        select: adminJobDetailSelect,
      });
    },
    async findJobBySlugForApplication(slug) {
      return prisma.job.findUnique({
        where: { slug },
        select: applicationTargetJobSelect,
      });
    },
    async createApplicationSubmission(input) {
      return prisma.$transaction(async (tx) => {
        const candidate = await tx.candidate.upsert({
          where: { email: input.candidate.email },
          update: {
            firstName: input.candidate.firstName,
            lastName: input.candidate.lastName,
            phone: input.candidate.phone,
            linkedinUrl: input.candidate.linkedinUrl,
            portfolioUrl: input.candidate.portfolioUrl,
          },
          create: {
            firstName: input.candidate.firstName,
            lastName: input.candidate.lastName,
            email: input.candidate.email,
            phone: input.candidate.phone,
            linkedinUrl: input.candidate.linkedinUrl,
            portfolioUrl: input.candidate.portfolioUrl,
          },
        });

        return tx.application.create({
          data: {
            jobId: input.jobId,
            candidateId: candidate.id,
            status: "new",
            resumeStorageKey: input.resume.storageKey,
            resumeFileName: input.resume.fileName,
            resumeMimeType: input.resume.mimeType,
            resumeSizeBytes: input.resume.sizeBytes,
            coverLetterText: input.candidate.coverLetterText,
            submittedAt: new Date(),
            questionResponses: input.questionResponses.length
              ? {
                  create: input.questionResponses.map((response) => ({
                    questionId: response.questionId,
                    value: response.value,
                  })),
                }
              : undefined,
          },
          select: publicApplicationSubmissionSelect,
        });
      });
    },
    async listApplicationsForAdminJob(jobId, params) {
      const where = buildAdminApplicationsWhere(jobId, params);
      const [applications, totalItems] = await prisma.$transaction([
        prisma.application.findMany({
          where,
          orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
          skip: params.skip,
          take: params.take,
          select: adminApplicationSummarySelect,
        }),
        prisma.application.count({ where }),
      ]);

      return { applications, totalItems };
    },
    async findAdminApplicationById(id) {
      return prisma.application.findUnique({
        where: { id },
        select: adminApplicationDetailSelect,
      });
    },
    async findAdminApplicationResumeById(id) {
      return prisma.application.findUnique({
        where: { id },
        select: adminApplicationResumeSelect,
      });
    },
    async updateAdminApplicationStatus(id, status) {
      const existingApplication = await prisma.application.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!existingApplication) {
        return null;
      }

      await prisma.application.update({
        where: { id },
        data: { status },
      });

      return prisma.application.findUnique({
        where: { id },
        select: adminApplicationDetailSelect,
      });
    },
  };
};
