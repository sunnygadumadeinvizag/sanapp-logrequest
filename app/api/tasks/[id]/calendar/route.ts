import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";
import { canViewTask, buildTaskCalendar, formatMinutes, type TaskSchedule } from "@/lib/tasks";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * GET /api/tasks/[id]/calendar?month=YYYY-MM&userId=
 * Month grid for the task calendar (day click → details).
 */
export async function GET(request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const task = await prisma.recurringTask.findUnique({
    where: { id },
    include: { assignees: { select: { userId: true } } },
  });
  if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await canViewTask(task, me))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const month =
    url.searchParams.get("month") ||
    new Date(Date.now() + (5 * 60 + 30) * 60000).toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "bad_month" }, { status: 400 });
  }
  const userId = url.searchParams.get("userId") || me.id;
  const participants = [task.userId, ...task.assignees.map((a) => a.userId)];
  if (
    userId !== me.id &&
    !participants.includes(userId) &&
    me.role !== "POC" &&
    me.role !== "ADMIN"
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const logs = await prisma.recurringTaskLog.findMany({
    where: { taskId: id, userId },
    select: {
      id: true,
      periodKey: true,
      status: true,
      minutes: true,
      note: true,
      logDate: true,
      loggedAt: true,
      userId: true,
      attachments: { select: { id: true } },
    },
  });

  const schedule: TaskSchedule = {
    recurrence: task.recurrence,
    weekday: task.weekday,
    dayOfMonth: task.dayOfMonth,
    monthOfYear: task.monthOfYear,
    anchorMonth: task.anchorMonth,
    specificDate: task.specificDate,
  };

  const attachmentsByLogId = new Map<string, number>();
  for (const l of logs) {
    attachmentsByLogId.set(l.id, l.attachments.length);
  }

  const days = buildTaskCalendar({
    schedule,
    logs: logs.map((l) => ({
      id: l.id,
      periodKey: l.periodKey,
      status: l.status,
      minutes: l.minutes,
      note: l.note,
      logDate: l.logDate,
      loggedAt: l.loggedAt,
      userId: l.userId,
    })),
    userId,
    month,
    attachmentsByLogId,
  });

  const monthMinutes = days.reduce((s, d) => s + (d.minutes || 0), 0);

  return NextResponse.json({
    month,
    userId,
    days,
    monthMinutes,
    monthMinutesLabel: formatMinutes(monthMinutes),
    task: {
      id: task.id,
      title: task.title,
      recurrence: task.recurrence,
      active: task.active,
    },
  });
}
