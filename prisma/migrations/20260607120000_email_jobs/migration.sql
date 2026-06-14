-- CreateEnum
CREATE TYPE "email_job_status" AS ENUM ('pending', 'processing', 'sent', 'retrying', 'failed');

-- CreateEnum
CREATE TYPE "email_event_type" AS ENUM (
    'application_received',
    'application_shortlisted',
    'application_offer',
    'application_hired',
    'application_rejected',
    'interview_scheduled',
    'interview_rescheduled',
    'interview_reminder'
);

-- CreateTable
CREATE TABLE "email_job" (
    "id" TEXT NOT NULL,
    "event_type" "email_event_type" NOT NULL,
    "template_key" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "recipient_name" TEXT,
    "payload_json" JSONB NOT NULL,
    "status" "email_job_status" NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_retry_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "provider_message_id" TEXT,
    "dedupe_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "email_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_log" (
    "id" TEXT NOT NULL,
    "email_job_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_job_dedupe_key_unique" ON "email_job"("dedupe_key");

-- CreateIndex
CREATE INDEX "email_job_status_next_retry_at_idx" ON "email_job"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "email_job_event_type_idx" ON "email_job"("event_type");

-- CreateIndex
CREATE INDEX "email_job_recipient_email_idx" ON "email_job"("recipient_email");

-- CreateIndex
CREATE INDEX "email_log_job_created_at_idx" ON "email_log"("email_job_id", "created_at");

-- AddForeignKey
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_email_job_id_fkey" FOREIGN KEY ("email_job_id") REFERENCES "email_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
