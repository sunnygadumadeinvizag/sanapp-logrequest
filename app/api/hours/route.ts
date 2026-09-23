import { NextRequest, NextResponse } from "next/server";
import { sessionUser } from "@/lib/requests";
import { loadPersonHours, loadTeamHours } from "@/lib/hours";

export const dynamic = "force-dynamic";

/**
 * GET /api/hours?userId=&from=YYYY-MM-DD&to=YYYY-MM-DD&team=1
 *
 * - Without userId (or with own id): personal request+task hours.
 * - With userId: requires POC/ADMIN (or self).
 * - team=1: POC/ADMIN cross-person rollup.
 */
export async function GET(request: NextRequest) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const userId = url.searchParams.get("userId");
  const team = url.searchParams.get("team") === "1";

  if (team) {
    if (me.role !== "POC" && me.role !== "ADMIN") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const data = await loadTeamHours({ from, to });
    return NextResponse.json(data);
  }

  const targetId = userId || me.id;
  if (targetId !== me.id && me.role !== "POC" && me.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const data = await loadPersonHours({
    userId: targetId,
    from,
    to,
    limitEntries: 250,
  });
  return NextResponse.json({ ...data, canViewOthers: me.role === "POC" || me.role === "ADMIN" });
}
