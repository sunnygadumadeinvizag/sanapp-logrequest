-- AlterTable
ALTER TABLE "WorkLog" ADD COLUMN     "inCampus" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "location" TEXT;

-- CreateTable
CREATE TABLE "RequestWorker" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestWorker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RequestWorker_requestId_userId_key" ON "RequestWorker"("requestId", "userId");

-- AddForeignKey
ALTER TABLE "RequestWorker" ADD CONSTRAINT "RequestWorker_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestWorker" ADD CONSTRAINT "RequestWorker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestWorker" ADD CONSTRAINT "RequestWorker_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
