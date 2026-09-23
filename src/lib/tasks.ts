import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/requests";

/** IST wall-clock helpers — timestamps are stored as UTC DateTime. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export type TaskRecurrence =
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "HALF_YEARLY"
  | "YEARLY"
  | "ONE_TIME";

export type TaskLogStatus = "PENDING" | "COMPLETED" | "MISSED" | "SKIPPED";

export type TaskSchedule = {
  recurrence: string;
  weekday?: number | null;
  dayOfMonth?: number | null;
  monthOfYear?: number | null;
  anchorMonth?: number | null;
  specificDate?: Date | string | null;
};

export function istNow(): Date {
  return new Date(Date.now() + IST_OFFSET_MS);
}

/** YYYY-MM-DD in IST. */
export function istDateKey(d: Date = new Date()): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Wall-clock parts of a date as seen in IST. */
export function istParts(d: Date = new Date()) {
  const t = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    year: t.getUTCFullYear(),
    month: t.getUTCMonth() + 1, // 1..12
    day: t.getUTCDate(), // 1..31
    weekday: t.getUTCDay(), // 0..6
  };
}

/** Monday-start week key YYYY-MM-DD in IST. */
export function istWeekKey(d: Date = new Date()): string {
  const date = new Date(d.getTime() + IST_OFFSET_MS);
  const day = date.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(date.getTime() - diff * 86400000);
  return monday.toISOString().slice(0, 10);
}

/** YYYY-MM in IST. */
export function istMonthKey(d: Date = new Date()): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 7);
}

/** "HH:MM" in IST. */
export function istTimeHHMM(d: Date = new Date()): string {
  const t = new Date(d.getTime() + IST_OFFSET_MS);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}

/** Clamp day-of-month to the length of the given (1-based) month. */
function clampDay(year: number, month: number, day: number): number {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.min(Math.max(1, day), last);
}

/** The month a QUARTERLY/HALF_YEARLY task falls in for a given date (IST). */
function cycleMonth(schedule: TaskSchedule, year: number, month: number): number {
  const step = schedule.recurrence === "QUARTERLY" ? 3 : 6;
  const anchor = ((schedule.anchorMonth ?? month) % step + step) % step;
  const cur = month % step;
  let m = month - ((cur - anchor + step) % step);
  while (m < 1) m += 12;
  // Normalise into the same year as `month` when the cycle starts last year.
  if (m > month && m - 12 >= 1) m -= 12;
  return m;
}

/**
 * Period key for a task schedule on a given date (IST).
 * - DAILY / ONE_TIME: YYYY-MM-DD
 * - WEEKLY:           Monday-start YYYY-MM-DD
 * - MONTHLY:          YYYY-MM
 * - QUARTERLY:        YYYY-MM of the cycle month containing/preceding the date
 * - HALF_YEARLY:      same with a 6-month step
 * - YEARLY:           YYYY-MM (of monthOfYear in that year)
 */
export function periodKeyFor(schedule: TaskSchedule | string, d: Date = new Date()): string {
  const s: TaskSchedule = typeof schedule === "string" ? { recurrence: schedule } : schedule;
  const r = s.recurrence;
  if (r === "DAILY" || r === "ONE_TIME") {
    if (r === "ONE_TIME" && s.specificDate) {
      const dt = typeof s.specificDate === "string" ? new Date(s.specificDate) : s.specificDate;
      return istDateKey(dt);
    }
    return istDateKey(d);
  }
  if (r === "WEEKLY") return istWeekKey(d);
  const { year, month } = istParts(d);
  if (r === "MONTHLY") return `${year}-${String(month).padStart(2, "0")}`;
  if (r === "QUARTERLY" || r === "HALF_YEARLY") {
    const m = cycleMonth(s, year, month);
    const y = m > month ? year - 1 : year;
    return `${y}-${String(m).padStart(2, "0")}`;
  }
  // YEARLY
  const m = s.monthOfYear ?? month;
  return `${year}-${String(m).padStart(2, "0")}`;
}

/** Default time of day (IST) a reminder is pushed when the task sets none. */
export const DEFAULT_REMINDER_TIME = "09:00";

/** The reminder time of day (IST) for a task — "HH:MM", defaulting to 09:00. */
export function reminderTimeOf(task: { reminderTime?: string | null }): string {
  const t = task.reminderTime;
  return t && /^\d{2}:\d{2}$/.test(t) ? t : DEFAULT_REMINDER_TIME;
}

/** Parse an IST calendar date string (YYYY-MM-DD) to a UTC-midnight Date. */
export function istDateFromString(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * True when a task is due on the given day (IST) — daily always, weekly on its
 * weekday, monthly/quarterly/half-yearly/yearly on the scheduled day, one-time
 * on its specific date (or never if the date has passed).
 */
export function isScheduledDay(schedule: TaskSchedule, d: Date = new Date()): boolean {
  const { year, month, day, weekday } = istParts(d);
  const r = schedule.recurrence;
  if (r === "DAILY") return true;
  if (r === "WEEKLY") return weekday === (schedule.weekday ?? 1);
  if (r === "ONE_TIME") {
    if (!schedule.specificDate) return false;
    const dt =
      typeof schedule.specificDate === "string"
        ? new Date(schedule.specificDate)
        : schedule.specificDate;
    return istDateKey(dt) === istDateKey(d);
  }
  if (r === "MONTHLY") {
    return day === clampDay(year, month, schedule.dayOfMonth ?? 1);
  }
  if (r === "QUARTERLY" || r === "HALF_YEARLY") {
    if (month !== cycleMonth(schedule, year, month)) return false;
    return day === clampDay(year, month, schedule.dayOfMonth ?? 1);
  }
  // YEARLY
  if (month !== (schedule.monthOfYear ?? month)) return false;
  return day === clampDay(year, month, schedule.dayOfMonth ?? 1);
}

/** The next date (IST, YYYY-MM-DD) a task is scheduled — used for hints. */
export function nextScheduledDate(schedule: TaskSchedule, d: Date = new Date()): string {
  const { year, month, day } = istParts(d);
  const r = schedule.recurrence;
  if (r === "DAILY") return istDateKey(d);
  if (r === "WEEKLY") {
    const target = schedule.weekday ?? 1;
    const wd = new Date(d.getTime() + IST_OFFSET_MS).getUTCDay();
    const diff = (target - wd + 7) % 7;
    return new Date(d.getTime() + diff * 86400000).toISOString().slice(0, 10);
  }
  if (r === "ONE_TIME") {
    if (!schedule.specificDate) return "";
    const dt =
      typeof schedule.specificDate === "string"
        ? new Date(schedule.specificDate)
        : schedule.specificDate;
    return istDateKey(dt);
  }
  const dom = schedule.dayOfMonth ?? 1;
  const after = (y: number, m: number) => {
    const clamped = clampDay(y, m, dom);
    const t = Date.UTC(y, m - 1, clamped);
    return t;
  };
  let candidates: Array<[number, number]> = [];
  if (r === "MONTHLY") {
    candidates = [
      [year, month],
      [month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1],
    ];
  } else if (r === "QUARTERLY" || r === "HALF_YEARLY") {
    const step = r === "QUARTERLY" ? 3 : 6;
    const cm = cycleMonth(schedule, year, month);
    const y0 = cm > month ? year - 1 : year;
    candidates = [
      [y0, cm],
      [cm + step > 12 ? y0 + 1 : y0, cm + step > 12 ? cm + step - 12 : cm + step],
      [cm + step * 2 > 12 ? y0 + 1 : y0, cm + step * 2 > 12 ? cm + step * 2 - 12 : cm + step * 2],
    ];
  } else {
    const m = schedule.monthOfYear ?? month;
    candidates = [
      [year, m],
      [year + 1, m],
    ];
  }
  const today = Date.UTC(year, month - 1, day);
  for (const [y, m] of candidates) {
    const t = after(y, m);
    if (t >= today) return new Date(t).toISOString().slice(0, 10);
  }
  return "";
}

/**
 * Participants of a task (creator + assignee user ids).
 */
export async function taskParticipantIds(taskId: string): Promise<string[]> {
  const task = await prisma.recurringTask.findUnique({
    where: { id: taskId },
    include: { assignees: { select: { userId: true } } },
  });
  if (!task) return [];
  return [task.userId, ...task.assignees.map((a) => a.userId)];
}

/** True when the user may log work on (or edit) the given task. */
export async function canLogOnTask(
  task: { id: string; userId: string },
  me: { id: string; role: string }
): Promise<boolean> {
  if (me.role === "ADMIN") return true;
  if (task.userId === me.id) return true;
  const count = await prisma.taskAssignee.count({
    where: { taskId: task.id, userId: me.id },
  });
  return count > 0;
}

/**
 * Ensure a PENDING log exists for every participant on the task's current
 * period, and mark overdue PENDING logs from earlier periods as MISSED.
 * When `userId` is given, only that user's rows are touched.
 * Best-effort — never throws.
 */
export async function syncTaskLogs(userId?: string): Promise<void> {
  try {
    const tasks = await prisma.recurringTask.findMany({
      where: { active: true },
      include: { assignees: { select: { userId: true } } },
    });
    const now = new Date();
    for (const task of tasks) {
      const participants = [task.userId, ...task.assignees.map((a) => a.userId)];
      const scoped = userId ? participants.filter((p) => p === userId) : participants;
      if (scoped.length === 0) continue;

      const schedule: TaskSchedule = {
        recurrence: task.recurrence,
        weekday: task.weekday,
        dayOfMonth: task.dayOfMonth,
        monthOfYear: task.monthOfYear,
        anchorMonth: task.anchorMonth,
        specificDate: task.specificDate,
      };
      const key = periodKeyFor(schedule, now);
      const currentPeriod = periodKeyFor(schedule, now);

      // Skip ONE_TIME tasks whose date has passed and were never started.
      if (task.recurrence === "ONE_TIME" && key < istDateKey(now)) {
        // still mark any pending log missed below via periodKey comparison
      }

      for (const uid of scoped) {
        // Missed: any PENDING log whose period is before the current key.
        await prisma.recurringTaskLog.updateMany({
          where: { taskId: task.id, userId: uid, status: "PENDING", periodKey: { lt: currentPeriod } },
          data: { status: "MISSED" },
        });

        // Current period log must exist.
        await prisma.recurringTaskLog.upsert({
          where: {
            taskId_periodKey_userId: { taskId: task.id, periodKey: currentPeriod, userId: uid },
          },
          update: {},
          create: { taskId: task.id, userId: uid, periodKey: currentPeriod, status: "PENDING" },
        });
      }
    }
  } catch (e) {
    console.error("syncTaskLogs failed:", e);
  }
}

/**
 * Push on-screen reminders for tasks that are due or newly missed, then mark the
 * log so the same period is never reminded twice per user. A task is reminded
 * only once the chosen time of day (IST) has passed. Best-effort — never throws.
 * Returns how many reminders were pushed.
 */
export async function sendDueReminders(userId?: string): Promise<number> {
  try {
    await syncTaskLogs(userId);
    const now = new Date();
    const nowHHMM = istTimeHHMM(now);
    const tasks = await prisma.recurringTask.findMany({
      where: { active: true, reminderEnabled: true },
      include: {
        assignees: { select: { userId: true } },
        logs: {
          where: { remindedAt: null, status: { in: ["PENDING", "MISSED"] } },
          orderBy: { periodKey: "desc" },
          take: userId ? 6 : 20,
        },
      },
    });

    let sent = 0;
    for (const t of tasks) {
      const schedule: TaskSchedule = {
        recurrence: t.recurrence,
        weekday: t.weekday,
        dayOfMonth: t.dayOfMonth,
        monthOfYear: t.monthOfYear,
        anchorMonth: t.anchorMonth,
        specificDate: t.specificDate,
      };
      const currentPeriod = periodKeyFor(schedule, now);
      for (const log of t.logs) {
        if (userId && log.userId !== userId) continue;
        // A stale PENDING from an earlier period was never synced — skip it.
        if (log.status === "PENDING" && log.periodKey !== currentPeriod) continue;
        if (log.periodKey !== currentPeriod && log.status === "PENDING") continue;
        if (nowHHMM < reminderTimeOf(t)) continue;

        // Claim the reminder atomically so only one render pushes it.
        const claimed = await prisma.recurringTaskLog
          .updateMany({ where: { id: log.id, remindedAt: null }, data: { remindedAt: now } })
          .catch(() => ({ count: 0 }));
        if (claimed.count === 0) continue;

        if (log.status === "MISSED") {
          await notify(
            [log.userId],
            "TASK_MISSED",
            "Task missed",
            `${t.title} was not logged for ${log.periodKey}. Log it now or skip the period.`
          );
        } else {
          await notify(
            [log.userId],
            "TASK_REMINDER",
            "Task due",
            `${t.title} — log how long you spent on this ${recurrenceLabel(t.recurrence).toLowerCase()} period (${log.periodKey}).`
          );
        }
        sent += 1;
      }
    }
    return sent;
  } catch (e) {
    console.error("sendDueReminders failed:", e);
    return 0;
  }
}

export const RECURRENCE_LABELS: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  HALF_YEARLY: "Half-yearly",
  YEARLY: "Yearly",
  ONE_TIME: "One-time",
};

export const TASK_LOG_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  COMPLETED: "Completed",
  MISSED: "Missed",
  SKIPPED: "Skipped",
};

export function recurrenceLabel(r: string): string {
  return RECURRENCE_LABELS[r] ?? r;
}

export function taskLogStatusLabel(s: string): string {
  return TASK_LOG_STATUS_LABELS[s] ?? s;
}

/** Human-readable schedule description. */
export function scheduleDescription(task: TaskSchedule): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const r = task.recurrence;
  if (r === "DAILY") return "Every day";
  if (r === "WEEKLY") return `Every ${days[task.weekday ?? 0] ?? "Monday"}`;
  if (r === "ONE_TIME") {
    if (!task.specificDate) return "One-time (no date set)";
    const dt =
      typeof task.specificDate === "string" ? new Date(task.specificDate) : task.specificDate;
    return `Once on ${istDateKey(dt)}`;
  }
  const day = task.dayOfMonth ?? 1;
  if (r === "MONTHLY") return `Every month on day ${day}`;
  if (r === "QUARTERLY") {
    const a = months[task.anchorMonth ?? 1];
    return `Every quarter (cycle from ${a}) on day ${day}`;
  }
  if (r === "HALF_YEARLY") {
    const a = months[task.anchorMonth ?? 1];
    return `Every 6 months (cycle from ${a}) on day ${day}`;
  }
  const m = months[task.monthOfYear ?? 1];
  return `Every year on ${day} ${m}`;
}
