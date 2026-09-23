import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@app/components/AppShell";
import { Breadcrumb } from "sanapp-common-ui";
import { TaskCalendarClient } from "@app/components/TaskCalendarClient";
import { canViewTask, syncTaskLogs, type TaskSchedule, periodKeyFor, scheduleDescription } from "@/lib/tasks";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }>; searchParams: Promise<{ user?: string; month?: string }> };

function istMonthNow(): string {
  return new Date(Date.now() + (5 * 60 + 30) * 60 * 1000).toISOString().slice(0, 7);
}

export default async function TaskCalendarPage({ params, searchParams }: Ctx) {
  const me = await currentUser();
  if (!me) notFound();
  const { id } = await params;
  const sp = await searchParams;

  const task = await prisma.recurringTask.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, username: true, name: true } },
      assignees: { include: { user: { select: { id: true, username: true, name: true } } } },
    },
  });
  if (!task) notFound();
  if (!(await canViewTask(task, me))) notFound();

  await syncTaskLogs();

  const participants = [task.user, ...task.assignees.map((a) => a.user)].filter(
    (u, i, arr) => u && arr.findIndex((x) => x!.id === u!.id) === i
  ) as { id: string; username: string; name: string }[];

  const schedule: TaskSchedule = {
    recurrence: task.recurrence,
    weekday: task.weekday,
    dayOfMonth: task.dayOfMonth,
    monthOfYear: task.monthOfYear,
    anchorMonth: task.anchorMonth,
    specificDate: task.specificDate,
  };

  const requestedUser = sp.user;
  const viewUser =
    requestedUser && participants.some((p) => p.id === requestedUser)
      ? requestedUser
      : me.role === "POC" || me.role === "ADMIN"
        ? participants[0]?.id ?? me.id
        : me.id;

  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : istMonthNow();

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
        <Breadcrumb
          items={[
            { label: "Dashboard", href: "/" },
            { label: "My Tasks", href: "/tasks" },
            { label: task.title, href: `/tasks/${id}` },
            { label: "Calendar" },
          ]}
        />
      </div>
      <h1 className="iipe-page-title">Calendar — {task.title}</h1>
      <p className="iipe-page-sub">
        {scheduleDescription(schedule)}. Click any day for comments, hours, uploaded PDFs, or to clear the log.
        Sunday and past dates are allowed.
      </p>
      <div className="mt-4">
        <TaskCalendarClient
          taskId={id}
          meId={me.id}
          participants={participants}
          taskTitle={task.title}
          initialMonth={month}
          viewUserId={viewUser}
        />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Current period: {periodKeyFor(schedule)}
      </p>
    </AppShell>
  );
}
