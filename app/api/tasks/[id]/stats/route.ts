import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";
import {
  canViewTask,
  computeTaskStats,
  formatMinutes,
  istDateFromString,
  type TaskSchedule,
} from "@/lib/tasks";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * GET /api/tasks/[id]/stats?userId=&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Monitoring stats for one participant: days worked/missed, hours per day.
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
  const userId = url.searchParams.get("userId") || me.id;
  const participants = [task.userId, ...task.assignees.map((a) => a.userId)];
  if (userId !== me.id && !participants.includes(userId) && me.role !== "POC" && me.role !== "ADMIN") {
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

  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const from = fromParam ? istDateFromString(fromParam) : undefined;
  const to = toParam ? istDateFromString(toParam) : undefined;

  const logsForStats = logs.map((l) => ({
    id: l.id,
    periodKey: l.periodKey,
    status: l.status,
    minutes: l.minutes,
    note: l.note,
    logDate: l.logDate,
    loggedAt: l.loggedAt,
    userId: l.userId,
    _has: l.attachments.length > 0,
  }));
  // computeTaskStats reads attachmentsByLogId as a set of log ids that have a PDF.
  const logIdsWithPdf = new Set(logs.filter((l) => l.attachments.length > 0).map((l) => l.id));

  const stats = computeTaskStats({
    schedule,
    logs: logsForStats,
    userId,
    from: from || undefined,
    to: to || undefined,
    createdAt: task.createdAt,
    attachmentsByLogId: logIdsWithPdf,
  });

  return NextResponse.json({
    ...stats,
    totalMinutesLabel: formatMinutes(stats.totalMinutes),
    task: {
      id: task.id,
      title: task.title,
      recurrence: task.recurrence,
      scheduleText: null,
      active: task.active,
      createdAt: task.createdAt.toISOString(),
    },
  });
}
