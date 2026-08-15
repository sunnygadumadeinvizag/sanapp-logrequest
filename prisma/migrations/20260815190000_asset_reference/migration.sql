-- Optional reference to an asset from the Inventory & Asset Tracking app
-- (same database, dedicated "inventory" schema). The request is then handled
-- by the POC queue of the section/category the asset belongs to.
ALTER TABLE "Request" ADD COLUMN "assetTag" TEXT;
ALTER TABLE "Request" ADD COLUMN "assetName" TEXT;
