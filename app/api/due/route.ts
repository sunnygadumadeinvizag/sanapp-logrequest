import { NextResponse } from "next/server";
import { sessionUser } from "@/lib/requests";
import { syncTaskLogs, sendDueReminders, periodKeyFor, reminderTimeOf } from "@/lib/tasks";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/due — tasks due for the signed-in user (current period still PENDING).
export async function GET() {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await syncTaskLogs(me.id);
  const tasks = await prisma.recurringTask.findMany({
    where: { userId: me.id, active: true },
    include: { logs: { orderBy: { periodKey: "desc" }, take: 3 } },
  });

  const mapped = tasks.map((t) => {
    const cur = periodKeyFor(t.recurrence as any);
    const current = t.logs.find((l) => l.periodKey === cur) ?? null;
    return { task: t, current };
  });

  const due = mapped.filter((x) => x.current && x.current.status === "PENDING");
  const missed = mapped.filter((x) => x.current && x.current.status === "MISSED");

  return NextResponse.json({
    due: due.map((x) => ({
      id: x.task.id,
      title: x.task.title,
      description: x.task.description,
      recurrence: x.task.recurrence,
      weekday: x.task.weekday,
      dayOfMonth: x.task.dayOfMonth,
      reminderTime: reminderTimeOf(x.task),
      logId: x.current!.id,
      periodKey: x.current!.periodKey,
      status: x.current!.status,
    })),
    dueCount: due.length,
    missedCount: missed.length,
  });
}

// POST /api/due — trigger reminder push (admin/POC can nudge others).
export async function POST() {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "ADMIN" && me.role !== "POC") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const sent = await sendDueReminders();
  return NextResponse.json({ ok: true, sent });
}
