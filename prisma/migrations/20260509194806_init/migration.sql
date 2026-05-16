/*
  Warnings:

  - You are about to drop the `cv_rank_job` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `cv_rank_result` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `cv_ranker_role_config` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "cv_rank_result" DROP CONSTRAINT "cv_rank_result_rank_job_id_fkey";

-- DropTable
DROP TABLE "cv_rank_job";

-- DropTable
DROP TABLE "cv_rank_result";

-- DropTable
DROP TABLE "cv_ranker_role_config";

-- DropEnum
DROP TYPE "cv_rank_job_status";

-- DropEnum
DROP TYPE "cv_rank_result_status";

-- DropEnum
DROP TYPE "cv_ranker_role_type";
