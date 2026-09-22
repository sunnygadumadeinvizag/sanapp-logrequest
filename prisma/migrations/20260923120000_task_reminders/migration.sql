-- Recurring tasks: per-task reminder time (IST "HH:MM") and a per-log marker so
-- the same period is never reminded twice.

-- AlterTable
ALTER TABLE "RecurringTask" ADD COLUMN "reminderTime" TEXT;

-- AlterTable
ALTER TABLE "RecurringTaskLog" ADD COLUMN "remindedAt" TIMESTAMP(3);
