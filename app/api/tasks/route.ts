import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";
import {
  periodKeyFor,
  syncTaskLogs,
  reminderTimeOf,
  scheduleDescription,
  istDateFromString,
  type TaskSchedule,
} from "@/lib/tasks";

export const dynamic = "force-dynamic";

const RECURRENCES = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "HALF_YEARLY",
  "YEARLY",
  "ONE_TIME",
];

type LogRow = {
  id: string;
  userId: string;
  periodKey: string;
  status: string;
  minutes: number;
  note: string | null;
  logDate: Date | null;
  loggedAt: Date | null;
  user?: { id: string; username: string; name: string } | null;
};

function serializeLog(l: LogRow) {
  return {
    id: l.id,
    userId: l.userId,
    periodKey: l.periodKey,
    status: l.status,
    minutes: l.minutes,
    note: l.note,
    logDate: l.logDate?.toISOString?.() ?? l.logDate ?? null,
    loggedAt: l.loggedAt?.toISOString?.() ?? l.loggedAt,
    user: l.user ? { id: l.user.id, username: l.user.username, name: l.user.name } : undefined,
  };
}

function serialize(t: any, meId: string) {
  const schedule: TaskSchedule = {
    recurrence: t.recurrence,
    weekday: t.weekday,
    dayOfMonth: t.dayOfMonth,
    monthOfYear: t.monthOfYear,
    anchorMonth: t.anchorMonth,
    specificDate: t.specificDate,
  };
  const cur = periodKeyFor(schedule);
  const logs: LogRow[] = t.logs ?? [];
  const mine = logs.find((l) => l.periodKey === cur && l.userId === meId) ?? null;
  const participants = [
    t.user ? { id: t.user.id, username: t.user.username, name: t.user.name, role: "CREATOR" } : null,
    ...(t.assignees ?? []).map((a: any) =>
      a.user
        ? { id: a.user.id, username: a.user.username, name: a.user.name, role: "ASSIGNEE" }
        : null
    ),
  ].filter(Boolean);

  return {
    id: t.id,
    title: t.title,
    description: t.description,
    recurrence: t.recurrence,
    weekday: t.weekday,
    dayOfMonth: t.dayOfMonth,
    monthOfYear: t.monthOfYear,
    anchorMonth: t.anchorMonth,
    specificDate: t.specificDate?.toISOString?.() ?? t.specificDate ?? null,
    scheduleText: scheduleDescription(schedule),
    reminderEnabled: t.reminderEnabled,
    reminderTime: reminderTimeOf(t),
    active: t.active,
    createdAt: t.createdAt?.toISOString?.() ?? t.createdAt,
    updatedAt: t.updatedAt?.toISOString?.() ?? t.updatedAt,
    user: t.user ? { id: t.user.id, username: t.user.username, name: t.user.name } : undefined,
    assignees: (t.assignees ?? [])
      .map((a: any) =>
        a.user ? { id: a.user.id, username: a.user.username, name: a.user.name } : null
      )
      .filter(Boolean),
    participants,
    isCreator: t.userId === meId,
    currentLog: mine ? serializeLog(mine) : null,
    currentPeriod: cur,
    logs: logs.map(serializeLog),
    logCount: logs.length,
  };
}

// GET /api/tasks — tasks the signed-in user created or is assigned to.
export async function GET() {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await syncTaskLogs(me.id);
  const tasks = await prisma.recurringTask.findMany({
    where: { OR: [{ userId: me.id }, { assignees: { some: { userId: me.id } } }] },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, username: true, name: true } },
      assignees: { include: { user: { select: { id: true, username: true, name: true } } } },
      logs: {
        orderBy: { periodKey: "desc" },
        take: 60,
        include: { user: { select: { id: true, username: true, name: true } } },
      },
      _count: { select: { logs: true } },
    },
  });

  const serialized = tasks.map((t) => serialize(t, me.id));
  const dueCount = serialized.filter(
    (t) => t.active && t.currentLog && (t.currentLog.status === "PENDING" || t.currentLog.status === "MISSED")
  ).length;

  return NextResponse.json({ tasks: serialized, dueCount, meId: me.id });
}

// POST /api/tasks — create a task (optionally assigning other people).
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
  const recurrence = RECURRENCES.includes(body.recurrence) ? body.recurrence : null;
  if (!title || !recurrence) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  let weekday: number | null = null;
  let dayOfMonth: number | null = null;
  let monthOfYear: number | null = null;
  let anchorMonth: number | null = null;
  let specificDate: Date | null = null;

  if (recurrence === "WEEKLY") {
    weekday = Number(body.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return NextResponse.json({ error: "bad_weekday" }, { status: 400 });
    }
  }
  if (["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"].includes(recurrence)) {
    dayOfMonth = Number(body.dayOfMonth);
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      return NextResponse.json({ error: "bad_day_of_month" }, { status: 400 });
    }
  }
  if (recurrence === "QUARTERLY" || recurrence === "HALF_YEARLY") {
    anchorMonth = Number(body.anchorMonth);
    if (!Number.isInteger(anchorMonth) || anchorMonth < 1 || anchorMonth > 12) {
      anchorMonth = new Date().getUTCMonth() + 1; // default: this month
    }
  }
  if (recurrence === "YEARLY") {
    monthOfYear = Number(body.monthOfYear);
    if (!Number.isInteger(monthOfYear) || monthOfYear < 1 || monthOfYear > 12) {
      return NextResponse.json({ error: "bad_month_of_year" }, { status: 400 });
    }
  }
  if (recurrence === "ONE_TIME") {
    specificDate = istDateFromString(String(body.specificDate ?? ""));
    if (!specificDate) {
      return NextResponse.json({ error: "bad_specific_date" }, { status: 400 });
    }
  }

  // Assignees: other users who must log. Creator is always a participant for
  // viewing/editing, but only listed assignees (or the creator alone when the
  // list is empty) are considered "due".
  const rawAssignees: unknown[] = Array.isArray(body.assigneeIds) ? body.assigneeIds : [];
  const assigneeIds = [...new Set(rawAssignees.map((x) => String(x)).filter((x) => x && x !== me.id))];
  let assignees: { userId: string }[] = [];
  if (assigneeIds.length > 0) {
    const found = await prisma.appUser.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true },
    });
    assignees = found.map((u) => ({ userId: u.id }));
  }

  const reminderTime =
    typeof body.reminderTime === "string" && /^\d{2}:\d{2}$/.test(body.reminderTime)
      ? body.reminderTime
      : null;

  const schedule: TaskSchedule = {
    recurrence,
    weekday,
    dayOfMonth,
    monthOfYear,
    anchorMonth,
    specificDate,
  };
  const currentPeriod = periodKeyFor(schedule);

  // Due participants = assignees; creator-only when nobody else is assigned.
  const dueUserIds = assignees.length > 0 ? assignees.map((a) => a.userId) : [me.id];

  const task = await prisma.recurringTask.create({
    data: {
      userId: me.id,
      title,
      description,
      recurrence,
      weekday,
      dayOfMonth,
      monthOfYear,
      anchorMonth,
      specificDate,
      reminderEnabled: body.reminderEnabled !== false,
      reminderTime,
      assignees: { create: assignees },
      logs: {
        create: dueUserIds.map((uid) => ({
          userId: uid,
          periodKey: currentPeriod,
          status: "PENDING",
        })),
      },
    },
    include: {
      user: { select: { id: true, username: true, name: true } },
      assignees: { include: { user: { select: { id: true, username: true, name: true } } } },
      logs: { include: { user: { select: { id: true, username: true, name: true } } } },
    },
  });

  return NextResponse.json({ task: serialize(task, me.id) }, { status: 201 });
}
