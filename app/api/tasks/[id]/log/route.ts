import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";
import { periodKeyFor } from "@/lib/tasks";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// POST /api/tasks/[id]/log — record time / complete / skip for the current period.
// Body: { status: "COMPLETED"|"SKIPPED"|"PENDING", minutes?: number, note?: string, periodKey?: string }
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

  const task = await prisma.recurringTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (task.userId !== me.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const status = ["COMPLETED", "SKIPPED", "PENDING"].includes(body.status)
    ? body.status
    : "COMPLETED";
  const minutes = Math.max(0, Math.min(Number(body.minutes ?? 0) || 0, 24 * 60));
  const note = typeof body.note === "string" ? body.note.trim() || null : null;
  const key =
    typeof body.periodKey === "string" && body.periodKey
      ? body.periodKey
      : periodKeyFor(task.recurrence as any);

  const log = await prisma.recurringTaskLog.upsert({
    where: { taskId_periodKey: { taskId: task.id, periodKey: key } },
    update: {
      status,
      minutes: status === "COMPLETED" ? minutes : 0,
      note,
      loggedAt: status === "COMPLETED" || status === "SKIPPED" ? new Date() : null,
    },
    create: {
      taskId: task.id,
      periodKey: key,
      status,
      minutes: status === "COMPLETED" ? minutes : 0,
      note,
      loggedAt: status === "COMPLETED" || status === "SKIPPED" ? new Date() : null,
    },
  });

  return NextResponse.json({ log });
}
