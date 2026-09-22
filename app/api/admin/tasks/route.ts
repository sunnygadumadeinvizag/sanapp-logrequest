import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";
import { syncTaskLogs, periodKeyFor } from "@/lib/tasks";

export const dynamic = "force-dynamic";

// GET /api/admin/tasks — every user's recurring tasks + completion/miss stats.
export async function GET(request: NextRequest) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await syncTaskLogs();

  const sp = request.nextUrl.searchParams;
  const userId = sp.get("userId") ?? "";
  const status = sp.get("status") ?? ""; // due | missed | completed
  const q = (sp.get("q") ?? "").trim();

  const where: any = {};
  if (userId) where.userId = userId;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { user: { name: { contains: q, mode: "insensitive" } } },
      { user: { username: { contains: q, mode: "insensitive" } } },
    ];
  }

  const tasks = await prisma.recurringTask.findMany({
    where,
    orderBy: [{ userId: "asc" }, { createdAt: "desc" }],
    include: {
      user: { select: { id: true, username: true, name: true, role: true } },
      logs: { orderBy: { periodKey: "desc" }, take: 40 },
    },
  });

  const enriched = tasks.map((t) => {
    const cur = periodKeyFor(t.recurrence as any);
    const current = t.logs.find((l) => l.periodKey === cur) ?? null;
    const completed = t.logs.filter((l) => l.status === "COMPLETED").length;
    const missed = t.logs.filter((l) => l.status === "MISSED").length;
    const totalMinutes = t.logs.reduce((sum, l) => sum + (l.minutes || 0), 0);
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      recurrence: t.recurrence,
      weekday: t.weekday,
      dayOfMonth: t.dayOfMonth,
      reminderEnabled: t.reminderEnabled,
      active: t.active,
      user: t.user,
      currentLog: current
        ? {
            periodKey: current.periodKey,
            status: current.status,
            minutes: current.minutes,
            note: current.note,
            loggedAt: current.loggedAt?.toISOString() ?? null,
          }
        : null,
      completed,
      missed,
      totalMinutes,
      logs: t.logs.map((l) => ({
        periodKey: l.periodKey,
        status: l.status,
        minutes: l.minutes,
        note: l.note,
        loggedAt: l.loggedAt?.toISOString() ?? null,
      })),
      createdAt: t.createdAt.toISOString(),
    };
  });

  let filtered = enriched;
  if (status === "due") filtered = filtered.filter((t) => t.active && t.currentLog?.status === "PENDING");
  else if (status === "missed") filtered = filtered.filter((t) => t.missed > 0);
  else if (status === "completed") filtered = filtered.filter((t) => t.currentLog?.status === "COMPLETED");

  // Per-user roll-up over EVERY task (not just the filtered slice), so the
  // summary stays meaningful while a status filter is applied.
  const byUser = new Map<string, {
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
  }>();
  for (const t of enriched) {
    let row = byUser.get(t.user.id);
    if (!row) {
      row = {
        id: t.user.id,
        name: t.user.name,
        username: t.user.username,
        role: t.user.role,
        tasks: 0,
        active: 0,
        due: 0,
        missed: 0,
        completed: 0,
        minutesThisPeriod: 0,
        minutesTotal: 0,
      };
      byUser.set(t.user.id, row);
    }
    row.tasks += 1;
    if (t.active) row.active += 1;
    if (t.active && t.currentLog?.status === "PENDING") row.due += 1;
    if (t.currentLog?.status === "MISSED") row.missed += 1;
    if (t.currentLog?.status === "COMPLETED") row.completed += 1;
    row.minutesThisPeriod += t.currentLog?.minutes || 0;
    row.minutesTotal += t.totalMinutes;
  }
  const userSummaries = [...byUser.values()].sort((a, b) => b.missed - a.missed || b.due - a.due);

  const users = await prisma.appUser.findMany({
    orderBy: { name: "asc" },
    select: { id: true, username: true, name: true, role: true },
  });

  const totals = {
    tasks: enriched.length,
    due: enriched.filter((t) => t.active && t.currentLog?.status === "PENDING").length,
    missed: enriched.filter((t) => t.missed > 0).length,
    completed: enriched.filter((t) => t.currentLog?.status === "COMPLETED").length,
    inactive: enriched.filter((t) => !t.active).length,
    minutesThisPeriod: enriched.reduce((s, t) => s + (t.currentLog?.minutes || 0), 0),
    activeUsers: userSummaries.filter((u) => u.active > 0).length,
  };

  return NextResponse.json({ tasks: filtered, users, totals, userSummaries });
}
