import type { PaginationMeta } from "../../shared/http/response.js";

export const cvRankerRoleTypeValues = ["ML", "Math", "Custom"] as const;
export const cvRankJobStatusValues = [
  "queued",
  "processing",
  "completed",
  "failed",
  "partial",
] as const;
export const cvRankResultStatusValues = [
  "pending",
  "processing",
  "completed",
  "failed",
] as const;

export type CvRankerRoleTypeValue = (typeof cvRankerRoleTypeValues)[number];
export type CvRankJobStatusValue = (typeof cvRankJobStatusValues)[number];
export type CvRankResultStatusValue = (typeof cvRankResultStatusValues)[number];

export type CvRankMetricDefinition = {
  id: string;
  name: string;
  description: string;
  weight: number;
};

export type CvRankMetricWeightOverrides = Record<string, number>;

export type UploadedCvFile = {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
};

export type CreateCvRankJobInput = {
  roleType: CvRankerRoleTypeValue;
  jobDescription?: string;
  metrics?: CvRankMetricDefinition[];
  weights?: CvRankMetricWeightOverrides;
  webhookUrl?: string;
};

export type UpdateCvRankerRoleConfigInput = {
  defaultJobDescription?: string;
  metrics?: CvRankMetricDefinition[];
};

export type CvRankerRoleConfigResponse = {
  role_type: Exclude<CvRankerRoleTypeValue, "Custom">;
  default_job_description: string;
  metrics: CvRankMetricDefinition[];
};

export type ExtractedCandidateData = {
  skills: string[];
  education: string | null;
  experience: string[];
  projects: string[];
};

export type FullExtractedCandidateData = ExtractedCandidateData & {
  name: string | null;
  email: string | null;
};

export type CvRankResultResponse = {
  id: string;
  status: CvRankResultStatusValue;
  input_file_name: string;
  name: string | null;
  email: string | null;
  final_score: number | null;
  metric_scores: Record<string, number> | null;
  llm_summary: string | null;
  extracted: ExtractedCandidateData | null;
  error_message: string | null;
};

export type CvRankJobResponse = {
  job_id: string;
  status: CvRankJobStatusValue;
  role_type: CvRankerRoleTypeValue;
  job_description: string;
  metrics: CvRankMetricDefinition[];
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  results: CvRankResultResponse[];
};

export type CvRankJobsPaginationMeta = PaginationMeta;
