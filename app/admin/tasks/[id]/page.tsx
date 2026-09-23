import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@app/components/AppShell";
import { Breadcrumb } from "sanapp-common-ui";
import { AdminTaskDetailClient } from "@app/components/AdminTaskDetailClient";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export default async function AdminTaskDetailPage({ params }: Ctx) {
  const me = await currentUser();
  if (!me || (me.role !== "ADMIN" && me.role !== "POC")) notFound();
  const { id } = await params;

  const task = await prisma.recurringTask.findUnique({ where: { id } });
  if (!task) notFound();

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
        <Breadcrumb
          items={[
            { label: "App Admin Console", href: "/admin" },
            { label: "Task Oversight", href: "/admin/tasks" },
            { label: "Task detail" },
          ]}
        />
      </div>
      <h1 className="iipe-page-title">Task Audit</h1>
      <p className="iipe-page-sub">
        Who worked, hours per day, missed schedules, uploaded PDFs, and a full when/what/who trail.
      </p>
      <div className="mt-4">
        <AdminTaskDetailClient taskId={id} meId={me.id} />
      </div>
    </AppShell>
  );
}
