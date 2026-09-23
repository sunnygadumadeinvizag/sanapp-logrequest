import { prisma } from "@/lib/prisma";
import { fmtMinutes } from "@/lib/labels";
import { istDateKey, istDateFromString } from "@/lib/tasks";

export type HoursSource = "REQUEST" | "TASK";

export type HoursEntry = {
  id: string;
  source: HoursSource;
  date: string; // YYYY-MM-DD IST
  minutes: number;
  title: string;
  refId: string; // requestId or taskId
  note: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  periodKey?: string | null;
  status?: string | null;
  number?: number | null; // request number when source=REQUEST
};

export type DayHours = {
  date: string;
  requestMinutes: number;
  taskMinutes: number;
  totalMinutes: number;
  entries: HoursEntry[];
};

export type PersonHoursSummary = {
  userId: string;
  name: string;
  username: string;
  role: string;
  from: string;
  to: string;
  requestMinutes: number;
  taskMinutes: number;
  totalMinutes: number;
  totalMinutesLabel: string;
  requestMinutesLabel: string;
  taskMinutesLabel: string;
  activeDays: number;
  sessions: number;
  taskLogs: number;
  byDay: DayHours[];
  byRequest: Array<{ id: string; number: number; title: string; minutes: number; sessions: number }>;
  byTask: Array<{ id: string; title: string; minutes: number; logs: number }>;
  entries: HoursEntry[];
};

/** IST YYYY-MM-DD of a WorkLog day (prefer end, else start). */
function workLogDayKey(startedAt: Date, endedAt: Date | null): string {
  return istDateKey(endedAt ?? startedAt);
}

/**
 * Unified hours for one person: request WorkLogs + completed task logs.
 * Window defaults to the last 90 days (inclusive of today).
 */
export async function loadPersonHours(options: {
  userId: string;
  from?: string | null;
  to?: string | null;
  limitEntries?: number;
}): Promise<PersonHoursSummary> {
  const { userId } = options;
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 89 * 86400000);
  const fromKey = options.from || istDateKey(defaultFrom);
  const toKey = options.to || istDateKey(now);
  const fromDate = istDateFromString(fromKey) ?? defaultFrom;
  const toDate = (istDateFromString(toKey) ?? now);
  // Inclusive end-of-day window in UTC for queries.
  const fromUtc = new Date(fromDate.getTime());
  const toUtc = new Date(toDate.getTime() + 86400000 - 1);

  const [user, workLogs, taskLogs] = await Promise.all([
    prisma.appUser.findUnique({
      where: { id: userId },
      select: { id: true, name: true, username: true, role: true },
    }),
    prisma.workLog.findMany({
      where: {
        pocId: userId,
        OR: [
          { endedAt: { gte: fromUtc, lte: toUtc } },
          { endedAt: null, startedAt: { gte: fromUtc, lte: toUtc } },
        ],
      },
      orderBy: { startedAt: "desc" },
      include: {
        request: { select: { id: true, number: true, title: true } },
      },
    }),
    prisma.recurringTaskLog.findMany({
      where: {
        userId,
        status: "COMPLETED",
        minutes: { gt: 0 },
        OR: [
          { logDate: { gte: fromUtc, lte: toUtc } },
          // Daily/one-time periodKey is YYYY-MM-DD — parse roughly via string compare
          { AND: [{ logDate: null }, { periodKey: { gte: fromKey, lte: toKey } }] },
        ],
      },
      orderBy: { periodKey: "desc" },
      include: { task: { select: { id: true, title: true } } },
    }),
  ]);

  const entries: HoursEntry[] = [];

  for (const w of workLogs) {
    const date = workLogDayKey(w.startedAt, w.endedAt);
    if (date < fromKey || date > toKey) continue;
    const minutes =
      w.endedAt != null
        ? w.minutes
        : Math.max(0, Math.floor((now.getTime() - w.startedAt.getTime()) / 60000));
    if (minutes <= 0 && w.endedAt == null) continue;
    entries.push({
      id: w.id,
      source: "REQUEST",
      date,
      minutes: w.endedAt != null ? w.minutes : minutes,
      title: w.request.title,
      refId: w.requestId,
      note: w.note,
      startedAt: w.startedAt.toISOString(),
      endedAt: w.endedAt?.toISOString() ?? null,
      number: w.request.number,
    });
  }

  for (const l of taskLogs) {
    let date = "";
    if (l.logDate) date = istDateKey(l.logDate);
    else if (/^\d{4}-\d{2}-\d{2}$/.test(l.periodKey)) date = l.periodKey;
    else continue; // multi-day period without work date — skip day grid
    if (date < fromKey || date > toKey) continue;
    entries.push({
      id: `${l.taskId}:${l.periodKey}`,
      source: "TASK",
      date,
      minutes: l.minutes,
      title: l.task.title,
      refId: l.taskId,
      note: l.note,
      periodKey: l.periodKey,
      status: l.status,
    });
  }

  entries.sort((a, b) => b.date.localeCompare(a.date) || a.source.localeCompare(b.source));

  const byDayMap = new Map<string, DayHours>();
  const byReq = new Map<string, { id: string; number: number; title: string; minutes: number; sessions: number }>();
  const byTask = new Map<string, { id: string; title: string; minutes: number; logs: number }>();

  let requestMinutes = 0;
  let taskMinutes = 0;
  let sessions = 0;
  let taskLogCount = 0;

  for (const e of entries) {
    const day =
      byDayMap.get(e.date) ??
      { date: e.date, requestMinutes: 0, taskMinutes: 0, totalMinutes: 0, entries: [] as HoursEntry[] };
    if (e.source === "REQUEST") {
      day.requestMinutes += e.minutes;
      requestMinutes += e.minutes;
      sessions += 1;
      const key = e.refId;
      const cur = byReq.get(key) ?? {
        id: key,
        number: e.number ?? 0,
        title: e.title,
        minutes: 0,
        sessions: 0,
      };
      cur.minutes += e.minutes;
      cur.sessions += 1;
      byReq.set(key, cur);
    } else {
      day.taskMinutes += e.minutes;
      taskMinutes += e.minutes;
      taskLogCount += 1;
      const cur = byTask.get(e.refId) ?? { id: e.refId, title: e.title, minutes: 0, logs: 0 };
      cur.minutes += e.minutes;
      cur.logs += 1;
      byTask.set(e.refId, cur);
    }
    day.totalMinutes = day.requestMinutes + day.taskMinutes;
    day.entries.push(e);
    byDayMap.set(e.date, day);
  }

  const byDay = [...byDayMap.values()].sort((a, b) => b.date.localeCompare(a.date));
  const totalMinutes = requestMinutes + taskMinutes;

  return {
    userId,
    name: user?.name ?? "Unknown",
    username: user?.username ?? "",
    role: user?.role ?? "USER",
    from: fromKey,
    to: toKey,
    requestMinutes,
    taskMinutes,
    totalMinutes,
    totalMinutesLabel: fmtMinutes(totalMinutes),
    requestMinutesLabel: fmtMinutes(requestMinutes),
    taskMinutesLabel: fmtMinutes(taskMinutes),
    activeDays: byDay.length,
    sessions,
    taskLogs: taskLogCount,
    byDay,
    byRequest: [...byReq.values()].sort((a, b) => b.minutes - a.minutes),
    byTask: [...byTask.values()].sort((a, b) => b.minutes - a.minutes),
    entries: entries.slice(0, options.limitEntries ?? 200),
  };
}

export type HoursCalendarDay = {
  date: string;
  requestMinutes: number;
  taskMinutes: number;
  totalMinutes: number;
  entries: HoursEntry[];
};

/** Month grid (IST) of a person's request + task hours. */
export async function loadHoursCalendar(options: {
  userId: string;
  month: string; // YYYY-MM
}): Promise<{
  month: string;
  userId: string;
  days: HoursCalendarDay[];
  monthMinutes: number;
  monthMinutesLabel: string;
  requestMinutes: number;
  taskMinutes: number;
}> {
  const [y, m] = options.month.split("-").map((n) => parseInt(n, 10));
  if (!y || !m) {
    return {
      month: options.month,
      userId: options.userId,
      days: [],
      monthMinutes: 0,
      monthMinutesLabel: fmtMinutes(0),
      requestMinutes: 0,
      taskMinutes: 0,
    };
  }
  const first = `${options.month}-01`;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const nextFirst = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
  // Window covers the full month in IST.
  const fromUtc = istDateFromString(first) ?? new Date(Date.UTC(y, m - 1, 1));
  const toUtc = new Date((istDateFromString(nextFirst)?.getTime() ?? Date.UTC(nextY, nextM - 1, 1)) - 1);

  const [workLogs, taskLogs] = await Promise.all([
    prisma.workLog.findMany({
      where: {
        pocId: options.userId,
        OR: [
          { endedAt: { gte: fromUtc, lte: toUtc } },
          { endedAt: null, startedAt: { gte: fromUtc, lte: toUtc } },
        ],
      },
      include: { request: { select: { id: true, number: true, title: true } } },
    }),
    prisma.recurringTaskLog.findMany({
      where: {
        userId: options.userId,
        status: "COMPLETED",
        minutes: { gt: 0 },
        OR: [
          { logDate: { gte: fromUtc, lte: toUtc } },
          {
            AND: [
              { logDate: null },
              { periodKey: { gte: first.slice(0, 7), lte: first.slice(0, 7) } },
            ],
          },
        ],
      },
      include: { task: { select: { id: true, title: true } } },
    }),
  ]);

  const dayMap = new Map<string, HoursCalendarDay>();
  const ensure = (date: string) => {
    let d = dayMap.get(date);
    if (!d) {
      d = { date, requestMinutes: 0, taskMinutes: 0, totalMinutes: 0, entries: [] };
      dayMap.set(date, d);
    }
    return d;
  };

  const now = new Date();
  for (const w of workLogs) {
    const date = workLogDayKey(w.startedAt, w.endedAt);
    if (!date.startsWith(options.month)) continue;
    const minutes =
      w.endedAt != null
        ? w.minutes
        : Math.max(1, Math.floor((now.getTime() - w.startedAt.getTime()) / 60000));
    const day = ensure(date);
    day.requestMinutes += minutes;
    day.totalMinutes += minutes;
    day.entries.push({
      id: w.id,
      source: "REQUEST",
      date,
      minutes,
      title: w.request.title,
      refId: w.requestId,
      note: w.note,
      startedAt: w.startedAt.toISOString(),
      endedAt: w.endedAt?.toISOString() ?? null,
      number: w.request.number,
    });
  }

  for (const l of taskLogs) {
    let date = "";
    if (l.logDate) date = istDateKey(l.logDate);
    else if (/^\d{4}-\d{2}-\d{2}$/.test(l.periodKey)) date = l.periodKey;
    else if (l.periodKey.slice(0, 7) === options.month) {
      // Attribute multi-day period logs to the scheduled day if we have one —
      // skip without logDate rather than smear across the month.
      continue;
    }
    if (!date || !date.startsWith(options.month)) continue;
    const day = ensure(date);
    day.taskMinutes += l.minutes;
    day.totalMinutes += l.minutes;
    day.entries.push({
      id: `${l.taskId}:${l.periodKey}`,
      source: "TASK",
      date,
      minutes: l.minutes,
      title: l.task.title,
      refId: l.taskId,
      note: l.note,
      periodKey: l.periodKey,
      status: l.status,
    });
  }

  // Fill empty days so the grid is complete.
  const days: HoursCalendarDay[] = [];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let d = 1; d <= lastDay; d++) {
    const key = `${options.month}-${String(d).padStart(2, "0")}`;
    days.push(
      dayMap.get(key) ?? { date: key, requestMinutes: 0, taskMinutes: 0, totalMinutes: 0, entries: [] }
    );
  }

  const monthMinutes = days.reduce((s, d) => s + d.totalMinutes, 0);
  const requestMinutes = days.reduce((s, d) => s + d.requestMinutes, 0);
  const taskMinutes = days.reduce((s, d) => s + d.taskMinutes, 0);

  return {
    month: options.month,
    userId: options.userId,
    days,
    monthMinutes,
    monthMinutesLabel: fmtMinutes(monthMinutes),
    requestMinutes,
    taskMinutes,
  };
}

/** Cross-person rollup for POC/ADMIN oversight (same window). */
export async function loadTeamHours(options?: {
  from?: string | null;
  to?: string | null;
}): Promise<{
  from: string;
  to: string;
  people: Array<{
    userId: string;
    name: string;
    username: string;
    role: string;
    requestMinutes: number;
    taskMinutes: number;
    totalMinutes: number;
    totalMinutesLabel: string;
    requestMinutesLabel: string;
    taskMinutesLabel: string;
    activeDays: number;
    sessions: number;
    taskLogs: number;
    lastActivityAt: string | null;
  }>;
  totals: {
    requestMinutes: number;
    taskMinutes: number;
    totalMinutes: number;
    totalMinutesLabel: string;
  };
}> {
  const now = new Date();
  const fromKey = options?.from || istDateKey(new Date(now.getTime() - 89 * 86400000));
  const toKey = options?.to || istDateKey(now);
  const users = await prisma.appUser.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, username: true, role: true },
  });

  const people = await Promise.all(
    users.map(async (u) => {
      const s = await loadPersonHours({ userId: u.id, from: fromKey, to: toKey, limitEntries: 1 });
      const last = s.entries[0]?.date ?? null;
      // last activity timestamp from either source
      const [lastWork, lastTask] = await Promise.all([
        prisma.workLog.findFirst({
          where: { pocId: u.id, endedAt: { not: null } },
          orderBy: { endedAt: "desc" },
          select: { endedAt: true },
        }),
        prisma.recurringTaskLog.findMany({
          where: { userId: u.id, status: "COMPLETED", loggedAt: { not: null } },
          orderBy: { loggedAt: "desc" },
          take: 1,
          select: { loggedAt: true },
        }),
      ]);
      const stamps = [
        lastWork?.endedAt?.getTime() ?? 0,
        lastTask[0]?.loggedAt?.getTime() ?? 0,
      ].filter((n) => n > 0);
      const lastAt = stamps.length ? new Date(Math.max(...stamps)).toISOString() : null;
      void last;
      return {
        userId: u.id,
        name: u.name,
        username: u.username,
        role: u.role,
        requestMinutes: s.requestMinutes,
        taskMinutes: s.taskMinutes,
        totalMinutes: s.totalMinutes,
        totalMinutesLabel: s.totalMinutesLabel,
        requestMinutesLabel: s.requestMinutesLabel,
        taskMinutesLabel: s.taskMinutesLabel,
        activeDays: s.activeDays,
        sessions: s.sessions,
        taskLogs: s.taskLogs,
        lastActivityAt: lastAt,
      };
    })
  );

  // Keep people with any history, or all if empty result would hide everyone.
  const withWork = people.filter((p) => p.totalMinutes > 0 || p.activeDays > 0);
  const list = withWork.length ? withWork : people;

  const requestMinutes = list.reduce((s, p) => s + p.requestMinutes, 0);
  const taskMinutes = list.reduce((s, p) => s + p.taskMinutes, 0);
  const totalMinutes = requestMinutes + taskMinutes;

  return {
    from: fromKey,
    to: toKey,
    people: list.sort((a, b) => b.totalMinutes - a.totalMinutes || a.name.localeCompare(b.name)),
    totals: {
      requestMinutes,
      taskMinutes,
      totalMinutes,
      totalMinutesLabel: fmtMinutes(totalMinutes),
    },
  };
}
