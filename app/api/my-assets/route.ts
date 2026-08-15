import { NextResponse } from "next/server";
import { sessionUser } from "@/lib/requests";
import { listMyAssets } from "@/lib/assets";

export const dynamic = "force-dynamic";

/**
 * GET /api/my-assets — the signed-in user's assets from the Inventory &
 * Asset Tracking app (same database, dedicated "inventory" schema).
 *
 * Users raise requests in Log Request "against my assets": the selected asset
 * auto-fills the request's section/category so the right POC queue handles it.
 * Both apps share sanapp_logrequest_db (logrequest = public schema,
 * inventory = "inventory" schema), so a raw schema-qualified query works.
 */
export async function GET() {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const assets = await listMyAssets(me.username, me.name);
  return NextResponse.json({ assets });
}
