-- Task log PDF attachments + immutable audit trail.

-- CreateTable
CREATE TABLE IF NOT EXISTS "TaskLogAttachment" (
    "id" TEXT NOT NULL,
    "logId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskLogAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TaskLogEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "logId" TEXT,
    "userId" TEXT NOT NULL,
    "periodKey" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "minutes" INTEGER,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskLogEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TaskLogAttachment_logId_idx" ON "TaskLogAttachment"("logId");
CREATE INDEX IF NOT EXISTS "TaskLogEvent_taskId_createdAt_idx" ON "TaskLogEvent"("taskId", "createdAt");
CREATE INDEX IF NOT EXISTS "TaskLogEvent_logId_idx" ON "TaskLogEvent"("logId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskLogAttachment_logId_fkey') THEN
    ALTER TABLE "TaskLogAttachment" ADD CONSTRAINT "TaskLogAttachment_logId_fkey"
      FOREIGN KEY ("logId") REFERENCES "RecurringTaskLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskLogAttachment_uploadedById_fkey') THEN
    ALTER TABLE "TaskLogAttachment" ADD CONSTRAINT "TaskLogAttachment_uploadedById_fkey"
      FOREIGN KEY ("uploadedById") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskLogEvent_taskId_fkey') THEN
    ALTER TABLE "TaskLogEvent" ADD CONSTRAINT "TaskLogEvent_taskId_fkey"
      FOREIGN KEY ("taskId") REFERENCES "RecurringTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskLogEvent_userId_fkey') THEN
    ALTER TABLE "TaskLogEvent" ADD CONSTRAINT "TaskLogEvent_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
