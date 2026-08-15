-- Intranet Issue consolidation: requests raised from Main's "Technical
-- Issues" page (and directly here) carry the application name + resolution.
ALTER TABLE "Request" ADD COLUMN "appName" TEXT;
ALTER TABLE "Request" ADD COLUMN "resolution" TEXT;
ALTER TABLE "Request" ADD COLUMN "resolvedAt" TIMESTAMP(3);
