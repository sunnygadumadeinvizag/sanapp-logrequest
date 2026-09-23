import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";
import { syncTaskLogs, periodKeyFor, scheduleDescription, type TaskSchedule } from "@/lib/tasks";

export const dynamic = "force-dynamic";

// GET /api/admin/tasks — every task across users + per-person completion stats.
// Visible to ADMIN and POC (so POCs can track their team's work frequency).
export async function GET(request: NextRequest) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "ADMIN" && me.role !== "POC") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await syncTaskLogs();

  const sp = request.nextUrl.searchParams;
  const userId = sp.get("userId") ?? "";
  const status = sp.get("status") ?? ""; // due | missed | completed
  const q = (sp.get("q") ?? "").trim();

  const where: any = {};
  if (userId) {
    where.OR = [
      { userId },
      { assignees: { some: { userId } } },
      { logs: { some: { userId } } },
    ];
  }
  if (q) {
    where.OR = [
      ...(where.OR ?? []),
      { title: { contains: q, mode: "insensitive" } },
      { user: { name: { contains: q, mode: "insensitive" } } },
      { user: { username: { contains: q, mode: "insensitive" } } },
      { assignees: { some: { user: { name: { contains: q, mode: "insensitive" } } } } },
    ];
  }

  const tasks = await prisma.recurringTask.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    include: {
      user: { select: { id: true, username: true, name: true, role: true } },
      assignees: { include: { user: { select: { id: true, username: true, name: true, role: true } } } },
      logs: {
        orderBy: [{ periodKey: "desc" }, { loggedAt: "desc" }],
        take: 80,
        include: { user: { select: { id: true, username: true, name: true, role: true } } },
      },
    },
  });

  const enriched = tasks.map((t) => {
    const schedule: TaskSchedule = {
      recurrence: t.recurrence,
      weekday: t.weekday,
      dayOfMonth: t.dayOfMonth,
      monthOfYear: t.monthOfYear,
      anchorMonth: t.anchorMonth,
      specificDate: t.specificDate,
    };
    const cur = periodKeyFor(schedule);
    const currentAll = t.logs.filter((l) => l.periodKey === cur);
    const completedPeriods = new Set(t.logs.filter((l) => l.status === "COMPLETED").map((l) => l.periodKey));
    const missedPeriods = new Set(t.logs.filter((l) => l.status === "MISSED").map((l) => l.periodKey));
    const totalMinutes = t.logs.reduce((sum, l) => sum + (l.minutes || 0), 0);
    const currentMinutes = currentAll.reduce((s, l) => s + (l.minutes || 0), 0);
    const anyoneCompleted = currentAll.some((l) => l.status === "COMPLETED" || l.status === "SKIPPED");

    return {
      id: t.id,
      title: t.title,
      description: t.description,
      recurrence: t.recurrence,
      weekday: t.weekday,
      dayOfMonth: t.dayOfMonth,
      monthOfYear: t.monthOfYear,
      anchorMonth: t.anchorMonth,
      specificDate: t.specificDate?.toISOString() ?? null,
      scheduleText: scheduleDescription(schedule),
      reminderEnabled: t.reminderEnabled,
      active: t.active,
      user: t.user,
      assignees: t.assignees.map((a) => a.user),
      currentPeriod: cur,
      currentLogs: currentAll.map((l) => ({
        userId: l.userId,
        user: l.user,
        status: l.status,
        minutes: l.minutes,
        note: l.note,
        logDate: l.logDate?.toISOString() ?? null,
        loggedAt: l.loggedAt?.toISOString() ?? null,
      })),
      anyoneCompleted,
      completed: completedPeriods.size,
      missed: missedPeriods.size,
      totalMinutes,
      currentMinutes,
      logs: t.logs.map((l) => ({
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
      createdAt: t.createdAt.toISOString(),
    };
  });

  let filtered = enriched;
  if (status === "due")
    filtered = filtered.filter((t) => t.active && t.currentLogs.some((l) => l.status === "PENDING"));
  else if (status === "missed") filtered = filtered.filter((t) => t.missed > 0);
  else if (status === "completed") filtered = filtered.filter((t) => t.anyoneCompleted);

  // Per-person roll-up over EVERY task (not just the filtered slice).
  const byUser = new Map<
    string,
    {
      id: string;
      name: string;
      username: string;
      role: string;
      tasks: number;
      active: number;
      due: number;
      missed: number;
      completed: number;
      minutesThisPeriod: number;
      minutesTotal: number;
      lastLogAt: string | null;
    }
  >();
  const ensure = (u: { id: string; name: string; username: string; role: string }) => {
    let row = byUser.get(u.id);
    if (!row) {
      row = {
        id: u.id,
        name: u.name,
        username: u.username,
        role: u.role,
        tasks: 0,
        active: 0,
        due: 0,
        missed: 0,
        completed: 0,
        minutesThisPeriod: 0,
        minutesTotal: 0,
        lastLogAt: null,
      };
      byUser.set(u.id, row);
    }
    return row;
  };

  for (const t of enriched) {
    const participants = [t.user, ...t.assignees];
    const seen = new Set<string>();
    for (const p of participants) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const row = ensure(p);
      row.tasks += 1;
      if (t.active) row.active += 1;
      const mine = t.currentLogs.filter((l) => l.userId === p.id);
      if (mine.some((l) => l.status === "PENDING")) row.due += 1;
      if (mine.some((l) => l.status === "MISSED")) row.missed += 1;
      if (mine.some((l) => l.status === "COMPLETED" || l.status === "SKIPPED")) row.completed += 1;
      row.minutesThisPeriod += mine.reduce((s, l) => s + (l.minutes || 0), 0);
    }
    for (const l of t.logs) {
      const row = byUser.get(l.userId) ?? ensure(l.user);
      row.minutesTotal += l.minutes || 0;
      if (l.loggedAt && (!row.lastLogAt || l.loggedAt > row.lastLogAt)) row.lastLogAt = l.loggedAt;
    }
  }
  const userSummaries = [...byUser.values()].sort(
    (a, b) => b.missed - a.missed || b.due - a.due
  );

  const users = await prisma.appUser.findMany({
    orderBy: { name: "asc" },
    select: { id: true, username: true, name: true, role: true },
  });

  const totals = {
    tasks: enriched.length,
    due: enriched.filter(
      (t) => t.active && t.currentLogs.some((l) => l.status === "PENDING")
    ).length,
    missed: enriched.filter((t) => t.missed > 0).length,
    completed: enriched.filter((t) => t.anyoneCompleted).length,
    inactive: enriched.filter((t) => !t.active).length,
    minutesThisPeriod: enriched.reduce((s, t) => s + t.currentMinutes, 0),
    activeUsers: userSummaries.filter((u) => u.active > 0).length,
  };

  return NextResponse.json({ tasks: filtered, users, totals, userSummaries });
}
