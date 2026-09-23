import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";

export const dynamic = "force-dynamic";

// GET /api/users — lightweight directory for pickers (assignee selection).
// Any signed-in user may read id/name/username/role (no emails/PII beyond that).
export async function GET() {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const users = await prisma.appUser.findMany({
    orderBy: { name: "asc" },
    select: { id: true, username: true, name: true, role: true },
  });

  return NextResponse.json({ users, meId: me.id });
}
