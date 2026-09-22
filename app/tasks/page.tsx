import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@app/components/AppShell";
import { Breadcrumb, apiPath } from "sanapp-common-ui";
import { TasksClient } from "@app/components/TasksClient";
import { syncTaskLogs, periodKeyFor } from "@/lib/tasks";

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
    where: { userId: me.id },
    orderBy: { createdAt: "desc" },
    include: { logs: { orderBy: { periodKey: "desc" }, take: 30 } },
  });

  const withCurrent = tasks.map((t) => {
    const cur = periodKeyFor(t.recurrence as any);
    const current = t.logs.find((l) => l.periodKey === cur) ?? null;
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      recurrence: t.recurrence,
      weekday: t.weekday,
      dayOfMonth: t.dayOfMonth,
      reminderEnabled: t.reminderEnabled,
      reminderTime: t.reminderTime,
      active: t.active,
      createdAt: t.createdAt.toISOString(),
      currentLog: current
        ? {
            id: current.id,
            periodKey: current.periodKey,
            status: current.status,
            minutes: current.minutes,
            note: current.note,
            loggedAt: current.loggedAt?.toISOString() ?? null,
          }
        : null,
      logs: t.logs.map((l) => ({
        id: l.id,
        periodKey: l.periodKey,
        status: l.status,
        minutes: l.minutes,
        note: l.note,
        loggedAt: l.loggedAt?.toISOString() ?? null,
      })),
    };
  });

  const dueCount = withCurrent.filter((t) => t.active && t.currentLog?.status === "PENDING").length;
  const missedCount = withCurrent.filter((t) => t.active && t.logs.some((l) => l.status === "MISSED")).length;

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
            Recurring daily, weekly or monthly work — log time against each period and never miss a beat.
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

      <TasksClient initialTasks={withCurrent} />
    </AppShell>
  );
}
