import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// PATCH /api/notifications/[id] — { read: true|false }
export async function PATCH(request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const n = await prisma.notification.findFirst({ where: { id, userId: me.id } });
  if (!n) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.notification.update({
    where: { id },
    data: { read: body.read === true },
  });
  return NextResponse.json({ ok: true, read: body.read === true });
}
