/*
  Warnings:

  - You are about to drop the column `ayrshareId` on the `ScheduledPost` table. All the data in the column will be lost.
  - You are about to drop the `RateLimitState` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "ScheduledPost" DROP COLUMN "ayrshareId";

-- DropTable
DROP TABLE "RateLimitState";
