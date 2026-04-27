ALTER TABLE "application"
ADD COLUMN "resume_storage_key" TEXT;

UPDATE "application"
SET "resume_storage_key" = regexp_replace("resume_file_url", '^.*/', '');

ALTER TABLE "application"
ALTER COLUMN "resume_storage_key" SET NOT NULL;

ALTER TABLE "application"
DROP COLUMN "resume_file_url";
