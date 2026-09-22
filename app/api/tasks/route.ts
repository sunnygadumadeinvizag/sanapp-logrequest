import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";
import { periodKeyFor, syncTaskLogs, reminderTimeOf } from "@/lib/tasks";

export const dynamic = "force-dynamic";

function serialize(t: any) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    recurrence: t.recurrence,
    weekday: t.weekday,
    dayOfMonth: t.dayOfMonth,
    reminderEnabled: t.reminderEnabled,
    reminderTime: reminderTimeOf(t),
    active: t.active,
    createdAt: t.createdAt?.toISOString?.() ?? t.createdAt,
    updatedAt: t.updatedAt?.toISOString?.() ?? t.updatedAt,
    user: t.user ? { id: t.user.id, username: t.user.username, name: t.user.name } : undefined,
    currentLog: t.currentLog
      ? {
          id: t.currentLog.id,
          periodKey: t.currentLog.periodKey,
          status: t.currentLog.status,
          minutes: t.currentLog.minutes,
          note: t.currentLog.note,
          loggedAt: t.currentLog.loggedAt?.toISOString?.() ?? t.currentLog.loggedAt,
        }
      : null,
    logCount: t._count?.logs,
  };
}

// GET /api/tasks — signed-in user's tasks (with current-period log).
export async function GET() {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await syncTaskLogs(me.id);
  const key = periodKeyFor("DAILY");
  // Current key depends on each task's recurrence — fetch and filter.
  const tasks = await prisma.recurringTask.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: "desc" },
    include: {
      logs: { orderBy: { periodKey: "desc" }, take: 12 },
      _count: { select: { logs: true } },
    },
  });

  const withCurrent = tasks.map((t) => {
    const cur = periodKeyFor(t.recurrence as any);
    const current = t.logs.find((l) => l.periodKey === cur) ?? null;
    return { ...t, currentLog: current, logs: t.logs };
  });

  const dueCount = withCurrent.filter(
    (t) => t.active && t.currentLog?.status === "PENDING"
  ).length;

  return NextResponse.json({
    tasks: withCurrent.map(serialize),
    dueCount,
    periodKey: key,
  });
}

// POST /api/tasks — create a recurring task.
export async function POST(request: NextRequest) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const description = typeof body.description === "string" ? body.description.trim() || null : null;
  const recurrence = ["DAILY", "WEEKLY", "MONTHLY"].includes(body.recurrence)
    ? body.recurrence
    : null;
  if (!title || !recurrence) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  let weekday: number | null = null;
  let dayOfMonth: number | null = null;
  if (recurrence === "WEEKLY") {
    weekday = Number(body.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return NextResponse.json({ error: "bad_weekday" }, { status: 400 });
    }
  }
  if (recurrence === "MONTHLY") {
    dayOfMonth = Number(body.dayOfMonth);
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      return NextResponse.json({ error: "bad_day_of_month" }, { status: 400 });
    }
  }

  const reminderTime =
    typeof body.reminderTime === "string" && /^\d{2}:\d{2}$/.test(body.reminderTime)
      ? body.reminderTime
      : null;

  const task = await prisma.recurringTask.create({
    data: {
      userId: me.id,
      title,
      description,
      recurrence,
      weekday,
      dayOfMonth,
      reminderEnabled: body.reminderEnabled !== false,
      reminderTime,
    },
  });

  // Seed the current-period log so it shows as due immediately.
  await prisma.recurringTaskLog.create({
    data: {
      taskId: task.id,
      periodKey: periodKeyFor(recurrence as any),
      status: "PENDING",
    },
  });

  return NextResponse.json({ task: serialize(task) }, { status: 201 });
}
