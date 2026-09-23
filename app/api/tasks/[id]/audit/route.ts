import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";
import { canViewTask } from "@/lib/tasks";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * GET /api/tasks/[id]/audit — who updated what on this task, and when.
 * Visible to participants, POC, and ADMIN.
 */
export async function GET(request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const task = await prisma.recurringTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await canViewTask(task, me))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const take = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 100) || 100));
  const type = url.searchParams.get("type");
  const userId = url.searchParams.get("userId");

  const events = await prisma.taskLogEvent.findMany({
    where: {
      taskId: id,
      ...(type ? { type } : {}),
      ...(userId ? { userId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      user: { select: { id: true, username: true, name: true, role: true } },
    },
  });

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      logId: e.logId,
      userId: e.userId,
      user: e.user,
      periodKey: e.periodKey,
      type: e.type,
      message: e.message,
      minutes: e.minutes,
      status: e.status,
      createdAt: e.createdAt.toISOString(),
    })),
  });
}
