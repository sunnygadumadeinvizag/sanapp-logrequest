-- CreateEnum
CREATE TYPE "TaskRecurrence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "TaskLogStatus" AS ENUM ('PENDING', 'COMPLETED', 'MISSED', 'SKIPPED');

-- CreateTable
CREATE TABLE "RecurringTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "recurrence" "TaskRecurrence" NOT NULL,
    "weekday" INTEGER,
    "dayOfMonth" INTEGER,
    "reminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringTaskLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "status" "TaskLogStatus" NOT NULL DEFAULT 'PENDING',
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "loggedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringTaskLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringTask_userId_active_idx" ON "RecurringTask"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringTaskLog_taskId_periodKey_key" ON "RecurringTaskLog"("taskId", "periodKey");

-- CreateIndex
CREATE INDEX "RecurringTaskLog_taskId_periodKey_idx" ON "RecurringTaskLog"("taskId", "periodKey");

-- AddForeignKey
ALTER TABLE "RecurringTask" ADD CONSTRAINT "RecurringTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTaskLog" ADD CONSTRAINT "RecurringTaskLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "RecurringTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
