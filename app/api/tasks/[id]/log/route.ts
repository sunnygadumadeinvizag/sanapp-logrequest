import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";
import {
  periodKeyFor,
  canLogOnTask,
  istDateFromString,
  istDateKey,
  type TaskSchedule,
} from "@/lib/tasks";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const RECURRENCES = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "HALF_YEARLY",
  "YEARLY",
  "ONE_TIME",
];

/**
 * POST /api/tasks/[id]/log — record time / complete / skip for a period.
 *
 * Body: {
 *   status: "COMPLETED" | "SKIPPED" | "PENDING",
 *   minutes?: number,
 *   note?: string,          // comment describing the work
 *   date?: string,          // YYYY-MM-DD — the calendar day the work applies to
 *                          // (defaults to today; past dates allowed for backfill)
 *   periodKey?: string      // advanced: target a specific period directly
 * }
 *
 * Each participant (creator or assignee) has their own row per period, so
 * several people can log independently against the same day/period.
 */
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

  const task = await prisma.recurringTask.findUnique({
    where: { id },
    include: { assignees: { select: { userId: true } } },
  });
  if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await canLogOnTask(task, me))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const status = ["COMPLETED", "SKIPPED", "PENDING"].includes(body.status)
    ? body.status
    : "COMPLETED";
  const minutes = Math.max(0, Math.min(Number(body.minutes ?? 0) || 0, 24 * 60));
  const note = typeof body.note === "string" ? body.note.trim() || null : null;

  // Which day does this log apply to? Past dates are allowed so users can
  // backfill work they forgot to record (with a comment).
  const schedule: TaskSchedule = {
    recurrence: task.recurrence,
    weekday: task.weekday,
    dayOfMonth: task.dayOfMonth,
    monthOfYear: task.monthOfYear,
    anchorMonth: task.anchorMonth,
    specificDate: task.specificDate,
  };

  let targetDate: Date;
  if (typeof body.date === "string" && body.date) {
    const parsed = istDateFromString(body.date);
    if (!parsed) return NextResponse.json({ error: "bad_date" }, { status: 400 });
    targetDate = parsed;
  } else {
    targetDate = istDateFromString(istDateKey()) ?? new Date();
  }

  // ONE_TIME tasks always log against their fixed date.
  let key: string;
  if (typeof body.periodKey === "string" && body.periodKey) {
    key = body.periodKey;
  } else if (task.recurrence === "ONE_TIME") {
    key = periodKeyFor(schedule, task.specificDate ?? targetDate);
  } else {
    key = periodKeyFor(schedule, targetDate);
  }

  const finishing = status === "COMPLETED" || status === "SKIPPED";

  const log = await prisma.recurringTaskLog.upsert({
    where: {
      taskId_periodKey_userId: { taskId: task.id, periodKey: key, userId: me.id },
    },
    update: {
      status,
      minutes: status === "COMPLETED" ? minutes : 0,
      note,
      logDate: finishing ? targetDate : null,
      loggedAt: finishing ? new Date() : null,
    },
    create: {
      taskId: task.id,
      userId: me.id,
      periodKey: key,
      status,
      minutes: status === "COMPLETED" ? minutes : 0,
      note,
      logDate: finishing ? targetDate : null,
      loggedAt: finishing ? new Date() : null,
    },
    include: { user: { select: { id: true, username: true, name: true } } },
  });

  return NextResponse.json({ log });
}

/**
 * GET /api/tasks/[id]/log — all logs for a task (participants only / admin).
 * Useful for showing who else logged the same period.
 */
export async function GET(_request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const task = await prisma.recurringTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await canLogOnTask(task, me))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const logs = await prisma.recurringTaskLog.findMany({
    where: { taskId: id },
    orderBy: [{ periodKey: "desc" }, { loggedAt: "desc" }],
    include: { user: { select: { id: true, username: true, name: true } } },
  });

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      userId: l.userId,
      user: l.user,
      periodKey: l.periodKey,
      status: l.status,
      minutes: l.minutes,
      note: l.note,
      logDate: l.logDate?.toISOString() ?? null,
      loggedAt: l.loggedAt?.toISOString() ?? null,
    })),
  });
}
