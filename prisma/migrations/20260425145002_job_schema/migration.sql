-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('draft', 'open', 'closed', 'archived');

-- CreateEnum
CREATE TYPE "job_type" AS ENUM ('full_time', 'part_time', 'contract', 'internship');

-- CreateEnum
CREATE TYPE "remote_status" AS ENUM ('onsite', 'hybrid', 'remote');

-- CreateEnum
CREATE TYPE "experience_level" AS ENUM ('junior', 'mid', 'senior', 'lead');

-- CreateEnum
CREATE TYPE "application_status" AS ENUM ('new', 'screening', 'exam', 'interview', 'offer', 'hired', 'rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "question_type" AS ENUM ('short_text', 'long_text', 'single_select', 'multi_select', 'number', 'date', 'url', 'checkbox');

-- CreateTable
CREATE TABLE "job" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "type" "job_type" NOT NULL DEFAULT 'full_time',
    "status" "job_status" NOT NULL DEFAULT 'draft',
    "remote_status" "remote_status",
    "experience_level" "experience_level",
    "valid_through" TIMESTAMP(3),
    "auto_score_on_apply" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "linkedin_url" TEXT,
    "portfolio_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "status" "application_status" NOT NULL DEFAULT 'new',
    "resume_file_url" TEXT NOT NULL,
    "resume_file_name" TEXT NOT NULL,
    "resume_mime_type" TEXT,
    "resume_size_bytes" INTEGER,
    "cover_letter_text" TEXT,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_question" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "type" "question_type" NOT NULL DEFAULT 'short_text',
    "label" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "options" JSONB,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_response" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_response_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_slug_key" ON "job"("slug");

-- CreateIndex
CREATE INDEX "job_status_idx" ON "job"("status");

-- CreateIndex
CREATE INDEX "job_type_idx" ON "job"("type");

-- CreateIndex
CREATE INDEX "job_created_at_idx" ON "job"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_email_unique" ON "candidate"("email");

-- CreateIndex
CREATE INDEX "candidate_created_at_idx" ON "candidate"("created_at");

-- CreateIndex
CREATE INDEX "application_job_id_idx" ON "application"("job_id");

-- CreateIndex
CREATE INDEX "application_candidate_id_idx" ON "application"("candidate_id");

-- CreateIndex
CREATE INDEX "application_status_idx" ON "application"("status");

-- CreateIndex
CREATE INDEX "application_job_submitted_at_idx" ON "application"("job_id", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "application_job_candidate_unique" ON "application"("job_id", "candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_id_job_id_unique" ON "application"("id", "job_id");

-- CreateIndex
CREATE INDEX "job_question_job_id_idx" ON "job_question"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_question_id_job_id_unique" ON "job_question"("id", "job_id");

-- CreateIndex
CREATE INDEX "question_response_application_id_idx" ON "question_response"("application_id");

-- CreateIndex
CREATE INDEX "question_response_job_id_idx" ON "question_response"("job_id");

-- CreateIndex
CREATE INDEX "question_response_question_id_idx" ON "question_response"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "question_response_application_question_unique" ON "question_response"("application_id", "question_id");

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_question" ADD CONSTRAINT "job_question_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_response" ADD CONSTRAINT "question_response_application_id_job_id_fkey" FOREIGN KEY ("application_id", "job_id") REFERENCES "application"("id", "job_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_response" ADD CONSTRAINT "question_response_question_id_job_id_fkey" FOREIGN KEY ("question_id", "job_id") REFERENCES "job_question"("id", "job_id") ON DELETE CASCADE ON UPDATE CASCADE;
