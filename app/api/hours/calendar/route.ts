import { NextRequest, NextResponse } from "next/server";
import { sessionUser } from "@/lib/requests";
import { loadHoursCalendar } from "@/lib/hours";

export const dynamic = "force-dynamic";

/**
 * GET /api/hours/calendar?month=YYYY-MM&userId=
 * Month grid of a person's request + task hours (IST).
 */
export async function GET(request: NextRequest) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const month =
    url.searchParams.get("month") ||
    new Date(Date.now() + (5 * 60 + 30) * 60000).toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "bad_month" }, { status: 400 });
  }
  const userId = url.searchParams.get("userId") || me.id;
  if (userId !== me.id && me.role !== "POC" && me.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const data = await loadHoursCalendar({ userId, month });
  return NextResponse.json(data);
}
