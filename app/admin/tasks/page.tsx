import { currentUser } from "@/lib/auth";
import { AppShell } from "@app/components/AppShell";
import { AdminTasksClient } from "@app/components/AdminTasksClient";
import { Breadcrumb } from "sanapp-common-ui";
import { notFound } from "next/navigation";
import { syncTaskLogs } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export default async function AdminTasksPage() {
  const me = await currentUser();
  if (!me || (me.role !== "ADMIN" && me.role !== "POC")) notFound();

  await syncTaskLogs();

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
      active="admin"
      sidebarItems={[]}
    >
      <div className="mb-3">
        <Breadcrumb items={[{ label: "App Admin Console", href: "/admin" }, { label: "Task Oversight" }]} />
      </div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="iipe-page-title">Task Oversight</h1>
          <p className="iipe-page-sub">
            Every task across users — who logged, how much time, how frequently work is happening, and who missed periods.
            Open a task for per-person calendars, PDFs, and the full audit trail.
          </p>
        </div>
      </div>
      <div className="mt-4">
        <AdminTasksClient />
      </div>
    </AppShell>
  );
}
