import { Prisma } from "@prisma/client";

import { logger } from "../../lib/logger.js";
import { BadRequestError, NotFoundError, ValidationError } from "../../shared/http/errors.js";
import {
  defaultMathJobDescription,
  defaultMathMetrics,
  defaultMlJobDescription,
  defaultMlMetrics,
} from "./cv-ranker.defaults.js";
import { extractStructuredCandidateData, extractTextFromCv } from "./cv-ranker.extract.js";
import { generateCandidateSummary, generateCustomMetricsWithLlm } from "./cv-ranker.llm.js";
import {
  createCvRankerRepository,
  type CvRankJobDetailRecord,
  type CvRankResultRecord,
  type CvRankerRepository,
  type CvRankerRoleConfigRecord,
} from "./cv-ranker.repository.js";
import { cvRankMetricSchema } from "./cv-ranker.schema.js";
import {
  combineMetricScores,
  generateHeuristicCustomMetrics,
  normalizeMetricDefinitions,
  scoreMetrics,
} from "./cv-ranker.scoring.js";
import type {
  CreateCvRankJobInput,
  CvRankJobResponse,
  CvRankMetricDefinition,
  CvRankResultResponse,
  CvRankerRoleConfigResponse,
  CvRankerRoleTypeValue,
  ExtractedCandidateData,
  UploadedCvFile,
  UpdateCvRankerRoleConfigInput,
} from "./cv-ranker.types.js";

export type CvRankerService = {
  repository: CvRankerRepository;
  listRoleConfigs(): Promise<CvRankerRoleConfigResponse[]>;
  getRoleConfig(
    roleType: Exclude<CvRankerRoleTypeValue, "Custom">,
  ): Promise<CvRankerRoleConfigResponse>;
  updateRoleConfig(
    roleType: Exclude<CvRankerRoleTypeValue, "Custom">,
    input: UpdateCvRankerRoleConfigInput,
  ): Promise<CvRankerRoleConfigResponse>;
  generateCustomMetrics(jobDescription: string): Promise<CvRankMetricDefinition[]>;
  startRankJob(input: CreateCvRankJobInput, files: UploadedCvFile[]): Promise<CvRankJobResponse>;
  getRankJob(id: string): Promise<CvRankJobResponse>;
  processRankJob(
    jobId: string,
    metrics: CvRankMetricDefinition[],
    filesByResultId: Map<string, UploadedCvFile>,
  ): Promise<void>;
};

const roleConfigDefaults = [
  {
    roleType: "ML" as const,
    defaultJobDescription: defaultMlJobDescription,
    metrics: defaultMlMetrics,
  },
  {
    roleType: "Math" as const,
    defaultJobDescription: defaultMathJobDescription,
    metrics: defaultMathMetrics,
  },
];

const parseMetricsFromJson = (value: unknown) => {
  const parsedMetrics = cvRankMetricSchema.array().safeParse(value);

  if (!parsedMetrics.success) {
    throw new Error("Stored CV ranker metrics are invalid.");
  }

  return normalizeMetricDefinitions(parsedMetrics.data);
};

const toRoleConfigResponse = (
  config: CvRankerRoleConfigRecord,
): CvRankerRoleConfigResponse => {
  if (config.roleType === "Custom") {
    throw new Error("Custom role does not have a stored default config.");
  }

  return {
    role_type: config.roleType,
    default_job_description: config.defaultJobDescription,
    metrics: parseMetricsFromJson(config.metrics),
  };
};

const readMetricScores = (value: unknown) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const scores: Record<string, number> = {};

  for (const [metricId, score] of Object.entries(value)) {
    if (typeof score === "number" && Number.isFinite(score)) {
      scores[metricId] = score;
    }
  }

  return scores;
};

const readExtractedData = (value: unknown): ExtractedCandidateData | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const data = value as Partial<ExtractedCandidateData>;

  return {
    skills: Array.isArray(data.skills)
      ? data.skills.filter((skill): skill is string => typeof skill === "string")
      : [],
    education: typeof data.education === "string" ? data.education : null,
    experience: Array.isArray(data.experience)
      ? data.experience.filter((item): item is string => typeof item === "string")
      : [],
    projects: Array.isArray(data.projects)
      ? data.projects.filter((item): item is string => typeof item === "string")
      : [],
  };
};

const mapRankResultResponse = (result: CvRankResultRecord): CvRankResultResponse => {
  return {
    id: result.id,
    status: result.status,
    input_file_name: result.inputFileName,
    name: result.name,
    email: result.email,
    final_score: result.finalScore,
    metric_scores: readMetricScores(result.metricScores),
    llm_summary: result.llmSummary,
    extracted: readExtractedData(result.extracted),
    error_message: result.errorMessage,
  };
};

const sortRankResults = (results: CvRankResultResponse[]) => {
  return [...results].sort((left, right) => {
    if (left.final_score !== null && right.final_score !== null) {
      return right.final_score - left.final_score;
    }

    if (left.final_score !== null) {
      return -1;
    }

    if (right.final_score !== null) {
      return 1;
    }

    return left.input_file_name.localeCompare(right.input_file_name);
  });
};

const mapRankJobResponse = (job: CvRankJobDetailRecord): CvRankJobResponse => {
  return {
    job_id: job.id,
    status: job.status,
    role_type: job.roleType,
    job_description: job.jobDescription,
    metrics: parseMetricsFromJson(job.metrics),
    error_message: job.errorMessage,
    created_at: job.createdAt.toISOString(),
    updated_at: job.updatedAt.toISOString(),
    completed_at: job.completedAt?.toISOString() ?? null,
    results: sortRankResults(job.results.map(mapRankResultResponse)),
  };
};

const toStoredExtractedData = (
  extracted: ReturnType<typeof extractStructuredCandidateData>,
): Prisma.InputJsonValue => {
  return {
    skills: extracted.skills,
    education: extracted.education,
    experience: extracted.experience,
    projects: extracted.projects,
  };
};

const messageFromError = (error: unknown) => {
  return error instanceof Error ? error.message : "Unknown error.";
};

const sendWebhook = async (webhookUrl: string | null, payload: CvRankJobResponse) => {
  if (!webhookUrl) {
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    logger.warn(
      {
        jobId: payload.job_id,
        webhookUrl,
        err: error instanceof Error ? error : undefined,
      },
      "cv ranker webhook delivery failed",
    );
  }
};

export const createCvRankerService = (
  repository: CvRankerRepository = createCvRankerRepository(),
): CvRankerService => {
  let defaultsEnsured: Promise<void> | null = null;

  const ensureDefaultConfigs = async () => {
    defaultsEnsured ??= Promise.all(
      roleConfigDefaults.map((config) => repository.upsertRoleConfig(config)),
    ).then(() => undefined);

    return defaultsEnsured;
  };

  const getStoredRoleConfig = async (roleType: Exclude<CvRankerRoleTypeValue, "Custom">) => {
    await ensureDefaultConfigs();
    const config = await repository.findRoleConfig(roleType);

    if (!config) {
      throw new NotFoundError("CV ranker role config not found.", "CV_RANKER_CONFIG_NOT_FOUND");
    }

    return config;
  };

  const service: CvRankerService = {
    repository,
    async listRoleConfigs() {
      await ensureDefaultConfigs();
      const configs = await repository.listRoleConfigs();
      return configs.map(toRoleConfigResponse);
    },
    async getRoleConfig(roleType) {
      return toRoleConfigResponse(await getStoredRoleConfig(roleType));
    },
    async updateRoleConfig(roleType, input) {
      await ensureDefaultConfigs();
      const currentConfig = await getStoredRoleConfig(roleType);
      const metrics = input.metrics
        ? normalizeMetricDefinitions(input.metrics)
        : parseMetricsFromJson(currentConfig.metrics);

      if (input.defaultJobDescription !== undefined && !input.defaultJobDescription.trim()) {
        throw new ValidationError(
          "Default job description cannot be empty.",
          "EMPTY_JOB_DESCRIPTION",
        );
      }

      const updatedConfig = await repository.updateRoleConfig(roleType, {
        defaultJobDescription: input.defaultJobDescription,
        metrics,
      });

      return toRoleConfigResponse(updatedConfig);
    },
    async generateCustomMetrics(jobDescription) {
      const trimmedJobDescription = jobDescription.trim();

      if (!trimmedJobDescription) {
        throw new BadRequestError(
          "Custom role job description is required.",
          "CUSTOM_JOB_DESCRIPTION_REQUIRED",
        );
      }

      const llmMetrics = await generateCustomMetricsWithLlm(trimmedJobDescription);

      return normalizeMetricDefinitions(
        llmMetrics ?? generateHeuristicCustomMetrics(trimmedJobDescription),
      );
    },
    async startRankJob(input, files) {
      if (files.length === 0) {
        throw new ValidationError("At least one CV file is required.", "MISSING_CV_FILES");
      }

      let jobDescription = input.jobDescription?.trim();
      let metrics = input.metrics;

      if (input.roleType === "Custom") {
        if (!jobDescription) {
          throw new BadRequestError(
            "Custom role job description is required.",
            "CUSTOM_JOB_DESCRIPTION_REQUIRED",
          );
        }

        metrics ??= await service.generateCustomMetrics(jobDescription);
      } else {
        const config = await getStoredRoleConfig(input.roleType);
        jobDescription ||= config.defaultJobDescription;
        metrics ??= parseMetricsFromJson(config.metrics);
      }

      if (!jobDescription) {
        throw new ValidationError("Job description is required.", "JOB_DESCRIPTION_REQUIRED");
      }

      const normalizedMetrics = normalizeMetricDefinitions(metrics, input.weights);
      const rankJob = await repository.createRankJob({
        roleType: input.roleType,
        jobDescription,
        metrics: normalizedMetrics,
        webhookUrl: input.webhookUrl,
        files,
      });
      const filesByResultId = new Map<string, UploadedCvFile>();

      rankJob.results.forEach((result, index) => {
        const file = files[index];

        if (file) {
          filesByResultId.set(result.id, file);
        }
      });

      setTimeout(() => {
        void service.processRankJob(rankJob.id, normalizedMetrics, filesByResultId);
      }, 0);

      return mapRankJobResponse(rankJob);
    },
    async getRankJob(id) {
      const rankJob = await repository.findRankJobById(id);

      if (!rankJob) {
        throw new NotFoundError("CV rank job not found.", "CV_RANK_JOB_NOT_FOUND");
      }

      return mapRankJobResponse(rankJob);
    },
    async processRankJob(jobId, metrics, filesByResultId) {
      let completedCount = 0;
      let failedCount = 0;
      let finalJob: CvRankJobDetailRecord | null = null;

      try {
        await repository.updateRankJobStatus(jobId, {
          status: "processing",
          errorMessage: null,
        });

        const rankJob = await repository.findRankJobById(jobId);

        if (!rankJob) {
          throw new NotFoundError("CV rank job not found.", "CV_RANK_JOB_NOT_FOUND");
        }

        for (const result of rankJob.results) {
          const file = filesByResultId.get(result.id);

          if (!file) {
            failedCount += 1;
            await repository.updateRankResultStatus(
              result.id,
              "failed",
              "Uploaded CV buffer was not available for processing.",
            );
            continue;
          }

          try {
            await repository.updateRankResultStatus(result.id, "processing");

            const cvText = await extractTextFromCv(file);

            if (cvText.length < 20) {
              throw new Error("CV text could not be extracted.");
            }

            const extracted = extractStructuredCandidateData(cvText);
            const metricScores = scoreMetrics(cvText, metrics, extracted);
            const finalScore = combineMetricScores(metricScores, metrics);
            const llmSummary = await generateCandidateSummary({
              roleType: rankJob.roleType,
              jobDescription: rankJob.jobDescription,
              metrics,
              metricScores,
              finalScore,
              extracted,
            });

            await repository.completeRankResult(result.id, {
              name: extracted.name,
              email: extracted.email,
              finalScore,
              metricScores,
              llmSummary,
              extracted: toStoredExtractedData(extracted),
            });
            completedCount += 1;
          } catch (error) {
            failedCount += 1;
            await repository.updateRankResultStatus(result.id, "failed", messageFromError(error));
          }
        }

        const status =
          completedCount > 0 ? (failedCount > 0 ? "partial" : "completed") : "failed";

        await repository.updateRankJobStatus(jobId, {
          status,
          errorMessage:
            status === "failed" ? "All CV files failed to process." : failedCount > 0 ? null : null,
          completedAt: new Date(),
        });

        finalJob = await repository.findRankJobById(jobId);

        if (finalJob) {
          await sendWebhook(rankJob.webhookUrl, mapRankJobResponse(finalJob));
        }
      } catch (error) {
        logger.error(
          { jobId, err: error instanceof Error ? error : undefined },
          "cv ranker job failed",
        );
        await repository.updateRankJobStatus(jobId, {
          status: "failed",
          errorMessage: messageFromError(error),
          completedAt: new Date(),
        });
      }
    },
  };

  return service;
};
