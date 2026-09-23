import { currentUser } from "@/lib/auth";
import { AppShell } from "@app/components/AppShell";
import { Breadcrumb, apiPath } from "sanapp-common-ui";
import { TaskMonitorClient } from "@app/components/TaskMonitorClient";
import { syncTaskLogs } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export default async function TaskMonitorPage() {
  const me = await currentUser();
  if (!me) {
    return (
      <AppShell
        me={{ sub: "", username: "", name: "", email: "", role: "USER", primaryRole: "" }}
        sidebarItems={[]}
      >
        <p className="iipe-page-sub">Session not found.</p>
      </AppShell>
    );
  }

  await syncTaskLogs(me.id);

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
          items={[{ label: "Dashboard", href: "/" }, { label: "My Tasks", href: "/tasks" }, { label: "Monitor" }]}
        />
      </div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="iipe-page-title">Task Monitor</h1>
          <p className="iipe-page-sub">
            How many days you worked, hours logged, and days missed — across every task assigned to you.
          </p>
        </div>
        <a href={apiPath("/tasks")} className="iipe-btn">
          ← Back to tasks
        </a>
      </div>
      <TaskMonitorClient />
    </AppShell>
  );
}
