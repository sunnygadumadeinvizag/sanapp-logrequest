-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "requireContactPhone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requireContactTime" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requireLocation" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "contactTime" TEXT,
ADD COLUMN     "location" TEXT;

-- AlterTable
ALTER TABLE "SubCategory" ADD COLUMN     "requireContactPhone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requireContactTime" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requireLocation" BOOLEAN NOT NULL DEFAULT false;
