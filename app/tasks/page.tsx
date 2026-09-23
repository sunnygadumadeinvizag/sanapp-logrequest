import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@app/components/AppShell";
import { Breadcrumb, apiPath } from "sanapp-common-ui";
import { TasksClient } from "@app/components/TasksClient";
import { syncTaskLogs, periodKeyFor, scheduleDescription, type TaskSchedule } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const me = await currentUser();
  if (!me) {
    return (
      <AppShell me={{ sub: "", username: "", name: "", email: "", role: "USER", primaryRole: "" }} sidebarItems={[]}>
        <p className="iipe-page-sub">Session not found.</p>
      </AppShell>
    );
  }

  await syncTaskLogs(me.id);
  const tasks = await prisma.recurringTask.findMany({
    where: { OR: [{ userId: me.id }, { assignees: { some: { userId: me.id } } }] },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, username: true, name: true } },
      assignees: { include: { user: { select: { id: true, username: true, name: true } } } },
      logs: {
        orderBy: [{ periodKey: "desc" }, { loggedAt: "desc" }],
        take: 80,
        include: { user: { select: { id: true, username: true, name: true } } },
      },
    },
  });

  const withCurrent = tasks.map((t) => {
    const schedule: TaskSchedule = {
      recurrence: t.recurrence,
      weekday: t.weekday,
      dayOfMonth: t.dayOfMonth,
      monthOfYear: t.monthOfYear,
      anchorMonth: t.anchorMonth,
      specificDate: t.specificDate,
    };
    const cur = periodKeyFor(schedule);
    const mine = t.logs.find((l) => l.periodKey === cur && l.userId === me.id) ?? null;
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
      reminderTime: t.reminderTime,
      active: t.active,
      createdAt: t.createdAt.toISOString(),
      user: t.user,
      assignees: t.assignees.map((a) => a.user),
      participants: [
        t.user,
        ...t.assignees.map((a) => a.user),
      ].filter((u, i, arr) => u && arr.findIndex((x) => x!.id === u!.id) === i) as {
        id: string;
        username: string;
        name: string;
      }[],
      isCreator: t.userId === me.id,
      currentPeriod: cur,
      currentLog: mine
        ? {
            id: mine.id,
            userId: mine.userId,
            periodKey: mine.periodKey,
            status: mine.status,
            minutes: mine.minutes,
            note: mine.note,
            logDate: mine.logDate?.toISOString() ?? null,
            loggedAt: mine.loggedAt?.toISOString() ?? null,
            user: mine.user,
          }
        : null,
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
    };
  });

  const dueCount = withCurrent.filter(
    (t) =>
      t.active &&
      t.currentLog &&
      (t.currentLog.status === "PENDING" || t.currentLog.status === "MISSED")
  ).length;
  const missedCount = withCurrent.filter(
    (t) => t.active && t.logs.some((l) => l.userId === me.id && l.status === "MISSED")
  ).length;

  const users = await prisma.appUser.findMany({
    orderBy: { name: "asc" },
    select: { id: true, username: true, name: true, role: true },
  });

  return (
    <AppShell
      me={{
        sub: me.ssoUserId ?? "",
        username: me.username,
        name: me.name,
        email: me.email ?? "",
        role: me.role,
        primaryRole: me.primaryRole ?? "",
      }}
      active="tasks"
      sidebarItems={[]}
    >
      <div className="mb-3">
        <Breadcrumb items={[{ label: "Dashboard", href: "/" }, { label: "My Tasks" }]} />
      </div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="iipe-page-title">My Tasks</h1>
          <p className="iipe-page-sub">
            Daily to yearly (and one-time) work — log time against any period, including past dates with comments.
          </p>
        </div>
        <a href={apiPath("/tasks/new")} className="iipe-btn">
          + New task
        </a>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Due now</p>
          <p className="mt-1 text-2xl font-bold text-primary">{dueCount}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">With missed periods</p>
          <p className="mt-1 text-2xl font-bold text-destructive">{missedCount}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total tasks</p>
          <p className="mt-1 text-2xl font-bold">{withCurrent.length}</p>
        </div>
      </div>

      <TasksClient initialTasks={withCurrent} meId={me.id} users={users} />
    </AppShell>
  );
}
