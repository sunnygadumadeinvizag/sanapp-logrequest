import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser, notify, fmtRequestNumber } from "@/lib/requests";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/requests/[id]/workers — co-workers on a request.
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const r = await prisma.request.findUnique({
    where: { id },
    select: {
      requestedById: true,
      requestedForId: true,
      assignedPocId: true,
      number: true,
    },
  });
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const canView =
    me.role === "ADMIN" ||
    r.requestedById === me.id ||
    r.requestedForId === me.id ||
    r.assignedPocId === me.id ||
    (await prisma.requestWorker.count({ where: { requestId: id, userId: me.id } })) > 0;
  if (!canView) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const workers = await prisma.requestWorker.findMany({
    where: { requestId: id },
    include: { user: { select: { id: true, username: true, name: true, primaryRole: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    workers: workers.map((w) => ({
      id: w.id,
      userId: w.userId,
      username: w.user.username,
      name: w.user.name,
      primaryRole: w.user.primaryRole ?? "",
    })),
  });
}

// POST /api/requests/[id]/workers — { userId } adds a co-worker (assignee or ADMIN).
export async function POST(request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const userId = String(body.userId ?? "");

  const r = await prisma.request.findUnique({
    where: { id },
    include: { category: true, subCategory: true },
  });
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const isAssignee = r.assignedPocId === me.id;
  if (me.role !== "ADMIN" && !isAssignee) {
    return NextResponse.json({ error: "only_assignee_or_admin_can_add" }, { status: 403 });
  }

  const target = await prisma.appUser.findUnique({ where: { id: userId } });
  if (!target) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const existing = await prisma.requestWorker.findUnique({
    where: { requestId_userId: { requestId: id, userId } },
  });
  if (existing) return NextResponse.json({ error: "already_worker" }, { status: 400 });

  await prisma.requestWorker.create({
    data: { requestId: id, userId, addedById: me.id },
  });
  await prisma.requestEvent.create({
    data: {
      requestId: id,
      userId: me.id,
      type: "WORKER",
      message: `${me.name} added ${target.name} as a co-worker`,
    },
  });
  await notify(
    [target.id],
    "ASSIGNED",
    "You were added as a co-worker",
    `${fmtRequestNumber(r.number)} — ${r.title}. You can now log hours on it.`,
    id
  );

  return NextResponse.json({ ok: true }, { status: 201 });
}

// DELETE /api/requests/[id]/workers?userId=... — remove a co-worker
// (assignee/ADMIN can remove anyone; a co-worker can remove themselves).
export async function DELETE(request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const userId = request.nextUrl.searchParams.get("userId") ?? "";

  const r = await prisma.request.findUnique({
    where: { id },
    select: { assignedPocId: true, number: true },
  });
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const isAssignee = r.assignedPocId === me.id;
  const removingSelf = userId === me.id;
  if (me.role !== "ADMIN" && !isAssignee && !removingSelf) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const w = await prisma.requestWorker.findUnique({
    where: { requestId_userId: { requestId: id, userId } },
    include: { user: { select: { name: true } } },
  });
  if (!w) return NextResponse.json({ error: "not_a_worker" }, { status: 404 });

  await prisma.requestWorker.delete({ where: { id: w.id } });
  await prisma.requestEvent.create({
    data: {
      requestId: id,
      userId: me.id,
      type: "WORKER",
      message: `${me.name} removed ${w.user.name} from the request`,
    },
  });

  return NextResponse.json({ ok: true });
}
