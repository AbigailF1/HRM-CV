ALTER TABLE "cv_rank_result"
ADD COLUMN "application_id" TEXT;

CREATE INDEX "cv_rank_result_application_id_idx"
ON "cv_rank_result"("application_id");

ALTER TABLE "cv_rank_result"
ADD CONSTRAINT "cv_rank_result_application_id_fkey"
FOREIGN KEY ("application_id") REFERENCES "application"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
