-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "directAssign" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SubCategory" ADD COLUMN     "directAssign" BOOLEAN NOT NULL DEFAULT false;
