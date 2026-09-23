import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@app/components/AppShell";
import { Breadcrumb, apiPath } from "sanapp-common-ui";
import { TaskDetailClient } from "@app/components/TaskDetailClient";
import {
  syncTaskLogs,
  periodKeyFor,
  scheduleDescription,
  canViewTask,
  type TaskSchedule,
} from "@/lib/tasks";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export default async function TaskDetailPage({ params }: Ctx) {
  const me = await currentUser();
  if (!me) notFound();
  const { id } = await params;

  const task = await prisma.recurringTask.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, username: true, name: true } },
      assignees: { include: { user: { select: { id: true, username: true, name: true } } } },
      logs: {
        orderBy: [{ periodKey: "desc" }, { loggedAt: "desc" }],
        take: 120,
        include: {
          user: { select: { id: true, username: true, name: true } },
          attachments: { select: { id: true, name: true, mime: true, size: true } },
        },
      },
    },
  });
  if (!task) notFound();
  if (!(await canViewTask(task, me))) notFound();

  await syncTaskLogs(me.id);

  const schedule: TaskSchedule = {
    recurrence: task.recurrence,
    weekday: task.weekday,
    dayOfMonth: task.dayOfMonth,
    monthOfYear: task.monthOfYear,
    anchorMonth: task.anchorMonth,
    specificDate: task.specificDate,
  };
  const cur = periodKeyFor(schedule);
  const mine =
    task.logs.find((l) => l.periodKey === cur && l.userId === me.id) ??
    (await prisma.recurringTaskLog.findFirst({
      where: { taskId: id, userId: me.id, periodKey: cur },
      include: {
        user: { select: { id: true, username: true, name: true } },
        attachments: { select: { id: true, name: true, mime: true, size: true } },
      },
    }));

  const participants = [
    task.user,
    ...task.assignees.map((a) => a.user),
  ].filter(
    (u, i, arr) => u && arr.findIndex((x) => x!.id === u!.id) === i
  ) as { id: string; username: string; name: string }[];

  const initialTask = {
    id: task.id,
    title: task.title,
    description: task.description,
    recurrence: task.recurrence,
    scheduleText: scheduleDescription(schedule),
    reminderEnabled: task.reminderEnabled,
    reminderTime: task.reminderTime,
    active: task.active,
    createdAt: task.createdAt.toISOString(),
    user: task.user,
    assignees: task.assignees.map((a) => a.user),
    participants,
    isCreator: task.userId === me.id,
    currentPeriod: cur,
    currentLog: mine
      ? {
          id: mine.id,
          userId: mine.userId,
          user: mine.user,
          periodKey: mine.periodKey,
          status: mine.status,
          minutes: mine.minutes,
          note: mine.note,
          logDate: mine.logDate?.toISOString() ?? null,
          loggedAt: mine.loggedAt?.toISOString() ?? null,
          attachments: mine.attachments,
        }
      : null,
    logs: task.logs.map((l) => ({
      id: l.id,
      userId: l.userId,
      user: l.user,
      periodKey: l.periodKey,
      status: l.status,
      minutes: l.minutes,
      note: l.note,
      logDate: l.logDate?.toISOString() ?? null,
      loggedAt: l.loggedAt?.toISOString() ?? null,
      attachments: l.attachments,
    })),
  };

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
            { label: task.title },
          ]}
        />
      </div>
      <h1 className="iipe-page-title">{task.title}</h1>
      <p className="iipe-page-sub">
        Self-monitoring: days worked, hours per day, missed schedules, PDF proof, and a full audit trail.
      </p>
      <div className="mt-4">
        <TaskDetailClient initialTask={initialTask} meId={me.id} />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        <a href={apiPath(`/tasks/${id}/calendar`)} className="text-primary underline">
          Calendar view
        </a>
        {" · "}
        <a href={apiPath("/tasks/monitor")} className="text-primary underline">
          All-tasks monitor
        </a>
      </p>
    </AppShell>
  );
}
