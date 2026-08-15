import { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";

/**
 * Assets issued to a user, read from the Inventory & Asset Tracking app
 * (same database, dedicated "inventory" schema). Users raise requests in
 * Log Request "against my assets"; the selected asset auto-fills the
 * request's section/category so the right POC queue handles it.
 */
export type MyAsset = {
  id: string;
  tag: string;
  name: string;
  section: string | null;
  category: string | null;
  location: string | null;
  status: string;
};

export async function listMyAssets(username: string, name: string): Promise<MyAsset[]> {
  const rows = await prisma.$queryRaw<MyAsset[]>(
    Prisma.sql`
      SELECT a.id::text AS id,
             a.tag AS tag,
             a.name AS name,
             s.name AS section,
             c.name AS category,
             l.name AS location,
             a.status AS status
      FROM "inventory"."Asset" a
      JOIN "inventory"."AssetAssignment" aa
        ON aa."assetId" = a.id AND aa."active" = true
      LEFT JOIN "inventory"."InventoryUser" u ON u.id = aa."assignedToUserId"
      LEFT JOIN "inventory"."Section" s ON s.id = a."sectionId"
      LEFT JOIN "inventory"."AssetCategory" c ON c.id = a."categoryId"
      LEFT JOIN "inventory"."Location" l ON l.id = a."currentLocationId"
      WHERE u.username = ${username} OR aa."assignedToName" = ${name}
      ORDER BY a."updatedAt" DESC
      LIMIT 200
    `
  );
  return rows;
}

export async function findMyAsset(
  username: string,
  name: string,
  tag: string
): Promise<MyAsset | null> {
  const assets = await listMyAssets(username, name);
  return assets.find((a) => a.tag === tag) ?? null;
}
