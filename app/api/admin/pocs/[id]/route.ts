import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// PATCH /api/admin/pocs/[id] — update queueOrder / active.
export async function PATCH(request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const data: any = {};
  if (body.queueOrder !== undefined) data.queueOrder = Math.max(0, Number(body.queueOrder) || 0);
  if (typeof body.active === "boolean") data.active = body.active;

  const existing = await prisma.pocAssignment.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.pocAssignment.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/pocs/[id] — remove the assignment.
export async function DELETE(_request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;

  await prisma.pocAssignment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
