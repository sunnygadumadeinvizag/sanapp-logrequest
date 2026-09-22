import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/requests";

/** IST wall-clock helpers — timestamps are stored as UTC DateTime. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export function istNow(): Date {
  return new Date(Date.now() + IST_OFFSET_MS);
}

/** YYYY-MM-DD in IST. */
export function istDateKey(d: Date = new Date()): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
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

/** Period key for a task recurrence on a given date (IST). */
export function periodKeyFor(
  recurrence: "DAILY" | "WEEKLY" | "MONTHLY",
  d: Date = new Date()
): string {
  if (recurrence === "DAILY") return istDateKey(d);
  if (recurrence === "WEEKLY") return istWeekKey(d);
  return istMonthKey(d);
}

/** Default time of day (IST) a reminder is pushed when the task sets none. */
export const DEFAULT_REMINDER_TIME = "09:00";

/** The reminder time of day (IST) for a task — "HH:MM", defaulting to 09:00. */
export function reminderTimeOf(task: { reminderTime?: string | null }): string {
  const t = task.reminderTime;
  return t && /^\d{2}:\d{2}$/.test(t) ? t : DEFAULT_REMINDER_TIME;
}

/** True when a task is due on the given day — daily always, weekly on its
 *  weekday, monthly on its day-of-month (clamped to the month's length). */
export function isScheduledDay(
  task: { recurrence: string; weekday?: number | null; dayOfMonth?: number | null },
  d: Date = new Date()
): boolean {
  const date = new Date(d.getTime() + IST_OFFSET_MS);
  if (task.recurrence === "DAILY") return true;
  if (task.recurrence === "WEEKLY") return date.getUTCDay() === (task.weekday ?? 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return date.getUTCDate() === Math.min(task.dayOfMonth ?? 1, lastDay);
}

/** The next date (IST, YYYY-MM-DD) a task is scheduled — used for hints. */
export function nextScheduledDate(
  task: { recurrence: string; weekday?: number | null; dayOfMonth?: number | null },
  d: Date = new Date()
): string {
  const date = new Date(d.getTime() + IST_OFFSET_MS);
  if (task.recurrence === "DAILY") return istDateKey(d);
  if (task.recurrence === "WEEKLY") {
    const target = task.weekday ?? 1;
    const diff = (target - date.getUTCDay() + 7) % 7;
    return new Date(date.getTime() + diff * 86400000).toISOString().slice(0, 10);
  }
  const target = task.dayOfMonth ?? 1;
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  const clamped = Math.min(target, lastDay);
  if (date.getUTCDate() <= clamped) {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), clamped)
    )
      .toISOString()
      .slice(0, 10);
  }
  const nextMonthLast = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 2, 0)).getUTCDate();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, Math.min(target, nextMonthLast)))
    .toISOString()
    .slice(0, 10);
}

/**
 * Ensure a PENDING log exists for every active task for its current period,
 * and mark overdue PENDING logs from earlier periods as MISSED.
 * Best-effort — never throws.
 */
export async function syncTaskLogs(userId?: string): Promise<void> {
  try {
    const tasks = await prisma.recurringTask.findMany({
      where: { active: true, ...(userId ? { userId } : {}) },
    });
    const now = new Date();
    for (const task of tasks) {
      const key = periodKeyFor(task.recurrence, now);

      // Missed: any PENDING log whose period is before the current key.
      await prisma.recurringTaskLog.updateMany({
        where: { taskId: task.id, status: "PENDING", periodKey: { lt: key } },
        data: { status: "MISSED" },
      });

      // Current period log must exist.
      await prisma.recurringTaskLog.upsert({
        where: { taskId_periodKey: { taskId: task.id, periodKey: key } },
        update: {},
        create: { taskId: task.id, periodKey: key, status: "PENDING" },
      });
    }
  } catch (e) {
    console.error("syncTaskLogs failed:", e);
  }
}

/**
 * Push on-screen reminders for tasks that are due or newly missed, then mark the
 * log so the same period is never reminded twice. A task is reminded only once
 * the chosen time of day (IST) has passed. Best-effort — never throws.
 * Returns how many reminders were pushed.
 */
export async function sendDueReminders(userId?: string): Promise<number> {
  try {
    await syncTaskLogs(userId);
    const now = new Date();
    const nowHHMM = istTimeHHMM(now);
    const tasks = await prisma.recurringTask.findMany({
      where: { active: true, reminderEnabled: true, ...(userId ? { userId } : {}) },
      include: {
        logs: {
          where: { remindedAt: null, status: { in: ["PENDING", "MISSED"] } },
          orderBy: { periodKey: "desc" },
          take: 1,
        },
      },
    });

    let sent = 0;
    for (const t of tasks) {
      const log = t.logs[0];
      if (!log) continue;
      // A stale PENDING from an earlier period was never synced — skip it.
      if (log.status === "PENDING" && log.periodKey !== periodKeyFor(t.recurrence as any)) continue;
      if (nowHHMM < reminderTimeOf(t)) continue;

      // Claim the reminder atomically: a concurrent sync (another page render /
      // tab) may be looking at the same log, and only one of them may push it.
      const claimed = await prisma.recurringTaskLog
        .updateMany({ where: { id: log.id, remindedAt: null }, data: { remindedAt: now } })
        .catch(() => ({ count: 0 }));
      if (claimed.count === 0) continue;

      if (log.status === "MISSED") {
        await notify(
          [t.userId],
          "TASK_MISSED",
          "Task missed",
          `${t.title} was not logged for ${log.periodKey}. Log it now or skip the period.`
        );
      } else {
        await notify(
          [t.userId],
          "TASK_REMINDER",
          "Task due",
          `${t.title} — log how long you spent on this ${recurrenceLabel(t.recurrence).toLowerCase()} period (${log.periodKey}).`
        );
      }
      sent += 1;
    }
    return sent;
  } catch (e) {
    console.error("sendDueReminders failed:", e);
    return 0;
  }
}

export type TaskRecurrence = "DAILY" | "WEEKLY" | "MONTHLY";
export type TaskLogStatus = "PENDING" | "COMPLETED" | "MISSED" | "SKIPPED";

export const RECURRENCE_LABELS: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
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
export function scheduleDescription(task: {
  recurrence: string;
  weekday?: number | null;
  dayOfMonth?: number | null;
}): string {
  if (task.recurrence === "DAILY") return "Every day";
  if (task.recurrence === "WEEKLY") {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return `Every ${days[task.weekday ?? 0] ?? "Monday"}`;
  }
  const day = task.dayOfMonth ?? 1;
  return `Every month on day ${day}`;
}
