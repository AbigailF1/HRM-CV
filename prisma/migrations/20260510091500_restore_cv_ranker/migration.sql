-- CreateEnum
CREATE TYPE "cv_ranker_role_type" AS ENUM ('ML', 'Math', 'Custom');

-- CreateEnum
CREATE TYPE "cv_rank_job_status" AS ENUM ('queued', 'processing', 'completed', 'failed', 'partial');

-- CreateEnum
CREATE TYPE "cv_rank_result_status" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "cv_ranker_role_config" (
    "id" TEXT NOT NULL,
    "role_type" "cv_ranker_role_type" NOT NULL,
    "default_job_description" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cv_ranker_role_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_rank_job" (
    "id" TEXT NOT NULL,
    "role_type" "cv_ranker_role_type" NOT NULL,
    "job_description" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "status" "cv_rank_job_status" NOT NULL DEFAULT 'queued',
    "webhook_url" TEXT,
    "error_message" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cv_rank_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_rank_result" (
    "id" TEXT NOT NULL,
    "rank_job_id" TEXT NOT NULL,
    "input_file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "status" "cv_rank_result_status" NOT NULL DEFAULT 'pending',
    "name" TEXT,
    "email" TEXT,
    "final_score" DOUBLE PRECISION,
    "metric_scores" JSONB,
    "llm_summary" TEXT,
    "extracted" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cv_rank_result_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cv_ranker_role_config_role_type_key" ON "cv_ranker_role_config"("role_type");

-- CreateIndex
CREATE INDEX "cv_rank_job_status_idx" ON "cv_rank_job"("status");

-- CreateIndex
CREATE INDEX "cv_rank_job_created_at_idx" ON "cv_rank_job"("created_at");

-- CreateIndex
CREATE INDEX "cv_rank_result_job_id_idx" ON "cv_rank_result"("rank_job_id");

-- CreateIndex
CREATE INDEX "cv_rank_result_status_idx" ON "cv_rank_result"("status");

-- CreateIndex
CREATE INDEX "cv_rank_result_final_score_idx" ON "cv_rank_result"("final_score");

-- AddForeignKey
ALTER TABLE "cv_rank_result" ADD CONSTRAINT "cv_rank_result_rank_job_id_fkey" FOREIGN KEY ("rank_job_id") REFERENCES "cv_rank_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
