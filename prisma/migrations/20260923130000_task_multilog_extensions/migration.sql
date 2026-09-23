-- Expanded recurrence + multi-user task logging.
-- Safe to run whether or not the 20260923090000 migration has already been applied.

-- CreateEnum (if missing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TaskRecurrence') THEN
    CREATE TYPE "TaskRecurrence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'ONE_TIME');
  END IF;
END $$;

ALTER TYPE "TaskRecurrence" ADD VALUE IF NOT EXISTS 'QUARTERLY';
ALTER TYPE "TaskRecurrence" ADD VALUE IF NOT EXISTS 'HALF_YEARLY';
ALTER TYPE "TaskRecurrence" ADD VALUE IF NOT EXISTS 'YEARLY';
ALTER TYPE "TaskRecurrence" ADD VALUE IF NOT EXISTS 'ONE_TIME';

-- RecurringTask: new schedule columns
ALTER TABLE "RecurringTask" ADD COLUMN IF NOT EXISTS "reminderTime" TEXT;
ALTER TABLE "RecurringTask" ADD COLUMN IF NOT EXISTS "monthOfYear" INTEGER;
ALTER TABLE "RecurringTask" ADD COLUMN IF NOT EXISTS "anchorMonth" INTEGER;
ALTER TABLE "RecurringTask" ADD COLUMN IF NOT EXISTS "specificDate" TIMESTAMP(3);

-- RecurringTaskLog: per-user logs + calendar day
ALTER TABLE "RecurringTaskLog" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "RecurringTaskLog" ADD COLUMN IF NOT EXISTS "logDate" TIMESTAMP(3);

-- Backfill existing logs to the task creator, then make NOT NULL
UPDATE "RecurringTaskLog" l
SET "userId" = t."userId"
FROM "RecurringTask" t
WHERE l."taskId" = t."id" AND l."userId" IS NULL;

DELETE FROM "RecurringTaskLog" WHERE "userId" IS NULL;

ALTER TABLE "RecurringTaskLog" ALTER COLUMN "userId" SET NOT NULL;

-- New unique key: one log per (task, period, user)
DROP INDEX IF EXISTS "RecurringTaskLog_taskId_periodKey_key";
CREATE UNIQUE INDEX IF NOT EXISTS "RecurringTaskLog_taskId_periodKey_userId_key"
  ON "RecurringTaskLog"("taskId", "periodKey", "userId");
CREATE INDEX IF NOT EXISTS "RecurringTaskLog_userId_periodKey_idx"
  ON "RecurringTaskLog"("userId", "periodKey");

-- Assignees table
CREATE TABLE IF NOT EXISTS "TaskAssignee" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAssignee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TaskAssignee_taskId_userId_key" ON "TaskAssignee"("taskId", "userId");
CREATE INDEX IF NOT EXISTS "TaskAssignee_userId_idx" ON "TaskAssignee"("userId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskAssignee_taskId_fkey') THEN
    ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_taskId_fkey"
      FOREIGN KEY ("taskId") REFERENCES "RecurringTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskAssignee_userId_fkey') THEN
    ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecurringTaskLog_userId_fkey') THEN
    ALTER TABLE "RecurringTaskLog" ADD CONSTRAINT "RecurringTaskLog_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
