import type { PaginationParams } from "../../shared/http/pagination.js";
import type { PaginationMeta } from "../../shared/http/response.js";

export const jobStatusValues = ["draft", "open", "closed", "archived"] as const;
export const jobTypeValues = ["full_time", "part_time", "contract", "internship"] as const;
export const remoteStatusValues = ["onsite", "hybrid", "remote"] as const;
export const experienceLevelValues = ["junior", "mid", "senior", "lead"] as const;
export const applicationStatusValues = [
  "new",
  "screening",
  "exam",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
] as const;
export const questionTypeValues = [
  "short_text",
  "long_text",
  "single_select",
  "multi_select",
  "number",
  "date",
  "url",
  "checkbox",
] as const;

export type JobStatusValue = (typeof jobStatusValues)[number];
export type JobTypeValue = (typeof jobTypeValues)[number];
export type RemoteStatusValue = (typeof remoteStatusValues)[number];
export type ExperienceLevelValue = (typeof experienceLevelValues)[number];
export type ApplicationStatusValue = (typeof applicationStatusValues)[number];
export type QuestionTypeValue = (typeof questionTypeValues)[number];

export type JobsListQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  type?: JobTypeValue;
  remoteStatus?: RemoteStatusValue;
  experienceLevel?: ExperienceLevelValue;
  location?: string;
};

export type JobsListParams = Omit<JobsListQuery, "page" | "pageSize"> & PaginationParams;

export type AdminJobsListQuery = JobsListQuery & {
  status?: JobStatusValue;
};

export type AdminJobsListParams = Omit<AdminJobsListQuery, "page" | "pageSize"> &
  PaginationParams;

export type AdminApplicationsListQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: ApplicationStatusValue;
};

export type AdminApplicationsListParams = Omit<
  AdminApplicationsListQuery,
  "page" | "pageSize"
> &
  PaginationParams;

export type JobQuestionOption = {
  label: string;
  value: string;
};

export type JobQuestionInput = {
  type?: QuestionTypeValue;
  label: string;
  description?: string;
  required?: boolean;
  options?: JobQuestionOption[];
  displayOrder?: number;
};

export type CreateJobInput = {
  title: string;
  slug: string;
  description?: string;
  location?: string;
  type?: JobTypeValue;
  status?: JobStatusValue;
  remoteStatus?: RemoteStatusValue;
  experienceLevel?: ExperienceLevelValue;
  validThrough?: Date;
  autoScoreOnApply?: boolean;
  questions?: JobQuestionInput[];
};

export type UpdateJobInput = Partial<Omit<CreateJobInput, "questions">> & {
  questions?: JobQuestionInput[];
};

export type ApplicationQuestionResponseInput = {
  questionId: string;
  value: string | number | boolean | string[] | null;
};

export type ApplyToJobInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  coverLetterText?: string;
  questionResponses?: ApplicationQuestionResponseInput[];
};

export type UploadedResume = {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
};

export type SavedResumeFile = {
  storagePath: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type PatchApplicationInput = {
  status: ApplicationStatusValue;
};

export type JobQuestionDefinition = {
  id: string;
  type: QuestionTypeValue;
  label: string;
  description?: string | null;
  required: boolean;
  options?: JobQuestionOption[] | null;
  displayOrder: number;
};

export type PublicJobSummary = {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  location?: string | null;
  type: JobTypeValue;
  status: "open";
  remoteStatus?: RemoteStatusValue | null;
  experienceLevel?: ExperienceLevelValue | null;
  validThrough?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicJobDetail = PublicJobSummary & {
  questions: JobQuestionDefinition[];
};

export type PublicJobApplicationSubmission = {
  id: string;
  status: ApplicationStatusValue;
  submittedAt: string;
  createdAt: string;
  job: {
    id: string;
    slug: string;
    title: string;
  };
  candidate: {
    firstName: string;
    lastName: string;
    email: string;
  };
};

export type AdminJobSummary = {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  location?: string | null;
  type: JobTypeValue;
  status: JobStatusValue;
  remoteStatus?: RemoteStatusValue | null;
  experienceLevel?: ExperienceLevelValue | null;
  validThrough?: string | null;
  autoScoreOnApply: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminJobDetail = AdminJobSummary & {
  questions: JobQuestionDefinition[];
  applicationCount?: number;
};

export type CandidateSummary = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  linkedinUrl?: string | null;
  portfolioUrl?: string | null;
};

export type ApplicationSummary = {
  id: string;
  status: ApplicationStatusValue;
  submittedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  candidate: CandidateSummary;
};

export type ApplicationQuestionResponseDetail = {
  id: string;
  value: unknown;
  createdAt: string;
  question: JobQuestionDefinition;
};

export type ApplicationDetail = ApplicationSummary & {
  job: {
    id: string;
    slug: string;
    title: string;
    status: JobStatusValue;
  };
  coverLetterText?: string | null;
  resumeFileUrl: string;
  resumeFileName: string;
  resumeMimeType?: string | null;
  resumeSizeBytes?: number | null;
  questionResponses: ApplicationQuestionResponseDetail[];
};

export type JobsPaginationMeta = PaginationMeta;
