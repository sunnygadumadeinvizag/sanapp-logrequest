import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@app/components/AppShell";
import { apiPath } from "sanapp-common-ui";
import { fmtRequestNumber, statusLabel, priorityLabel, fmtMinutes } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { syncTaskLogs, periodKeyFor } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const me = await currentUser();
  // The proxy does not run for the exact basePath root, so guard it here.
  if (!me) {
    redirect(process.env.APP_BASE_URL! + "/api/start-oauth");
  }

  const isPoc = me.role === "POC" || me.role === "ADMIN";

  const [myOpen, myTotal, unread, queueCount, recent, running, dueTasks] = await Promise.all([
    prisma.request.count({
      where: { requestedById: me.id, status: { notIn: ["CLOSED", "CANCELLED"] } },
    }),
    prisma.request.count({ where: { requestedById: me.id } }),
    prisma.notification.count({ where: { userId: me.id, read: false } }),
    isPoc
      ? prisma.request.count({
          where: {
            status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "PENDING"] },
            OR: [
              { assignedPocId: me.id },
              ...(me.role === "ADMIN" ? [{ status: "OPEN" as const }] : []),
            ],
          },
        })
      : Promise.resolve(0),
    prisma.request.findMany({
      where: {
        OR: [{ requestedById: me.id }, { requestedForId: me.id }, { assignedPocId: me.id }],
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        category: { select: { name: true } },
        assignedPoc: { select: { name: true } },
      },
    }),
    prisma.workLog.findFirst({
      where: { pocId: me.id, endedAt: null },
      include: { request: { select: { id: true, number: true, title: true } } },
    }),
    (async () => {
      // (Reminders are pushed once per period by AppShell → sendDueReminders.)
      await syncTaskLogs(me.id);
      const ts = await prisma.recurringTask.findMany({
        where: { userId: me.id, active: true },
        include: { logs: { orderBy: { periodKey: "desc" }, take: 3 } },
      });
      return ts
        .map((t) => {
          const cur = periodKeyFor(t.recurrence as any);
          const current = t.logs.find((l) => l.periodKey === cur) ?? null;
          return { task: t, current };
        })
        .filter((x) => x.current && (x.current.status === "PENDING" || x.current.status === "MISSED"));
    })(),
  ]);

  const categories = await prisma.category.findMany({
    where: { active: true },
    orderBy: { order: "asc" },
    select: { id: true, name: true, allowedRoles: true },
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
      active="home"
      sidebarItems={[]}
    >
      <h1 className="iipe-page-title">Dashboard</h1>
      <p className="iipe-page-sub">
        Welcome back, {me.name}. Log a request against any issue and track it until it is closed.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="My open requests" value={myOpen} href="/requests?status=OPEN" />
        <StatCard label="Requests raised" value={myTotal} href="/requests" />
        <StatCard label="Unread notifications" value={unread} href="/notifications" accent={unread > 0} />
        {isPoc ? <StatCard label="In my queue" value={queueCount} href="/queue" /> : <StatCard label="Categories" value={categories.length} href="/requests/new" />}
      </div>

      {running && (
        <div className="mt-4 rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
          <strong>You are currently working on</strong>{" "}
          <a href={apiPath(`/requests/${running.request.id}`)} className="font-semibold underline">
            {fmtRequestNumber(running.request.number)} — {running.request.title}
          </a>{" "}
          — remember to stop the timer when done.
        </div>
      )}

      {dueTasks.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-amber-900">
              {dueTasks.length} recurring task{dueTasks.length === 1 ? "" : "s"} need{dueTasks.length === 1 ? "s" : ""} attention
            </strong>
            <a href={apiPath("/tasks")} className="font-semibold text-amber-900 underline">
              Open My Tasks →
            </a>
          </div>
          <ul className="mt-2 space-y-1">
            {dueTasks.slice(0, 5).map(({ task, current }) => (
              <li key={task.id} className="flex flex-wrap items-center gap-2 text-amber-900">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    current!.status === "MISSED" ? "bg-red-500" : "bg-amber-500"
                  }`}
                />
                <span className="font-medium">{task.title}</span>
                <span className="text-xs opacity-75">
                  {task.recurrence === "DAILY" ? "daily" : task.recurrence === "WEEKLY" ? "weekly" : "monthly"}
                  {" · "}
                  {current!.status === "MISSED" ? "missed" : "due now"} ({current!.periodKey})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recent.length === 0 && <p className="text-sm text-muted-foreground">No requests yet — raise your first one.</p>}
            {recent.map((r) => (
              <a
                key={r.id}
                href={apiPath(`/requests/${r.id}`)}
                className="flex items-start justify-between gap-3 rounded-md border p-3 no-underline transition-colors hover:bg-muted/40 hover:no-underline"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-primary">{fmtRequestNumber(r.number)}</span>
                    <Badge variant="outline">{r.category.name}</Badge>
                  </div>
                  <p className="mt-1 truncate text-sm font-medium">{r.title}</p>
                  {r.assignedPoc && (
                    <p className="text-xs text-muted-foreground">Assigned to {r.assignedPoc.name}</p>
                  )}
                </div>
                <Badge>{statusLabel(r.status)}</Badge>
              </a>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {categories.map((c) => {
              const eligible =
                me.role === "ADMIN" ||
                me.role === "POC" ||
                c.allowedRoles.length === 0 ||
                (me.primaryRole ? c.allowedRoles.includes(me.primaryRole) : false);
              return (
                <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                  </div>
                  {eligible ? (
                    <a href={apiPath(`/requests/new?category=${c.id}`)} className="text-xs font-semibold text-primary hover:underline">
                      Raise request →
                    </a>
                  ) : (
                    <Badge variant="secondary">Restricted</Badge>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function StatCard({ label, value, href, accent = false }: { label: string; value: number; href: string; accent?: boolean }) {
  return (
    <a
      href={apiPath(href)}
      className={`rounded-lg border p-4 transition-colors ${accent ? "border-primary/50 bg-primary/5" : "bg-card hover:bg-muted/40"}`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? "text-primary" : "text-foreground"}`}>{value}</p>
    </a>
  );
}
