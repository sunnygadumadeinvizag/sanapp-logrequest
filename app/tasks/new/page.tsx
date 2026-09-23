import { currentUser } from "@/lib/auth";
import { AppShell } from "@app/components/AppShell";
import { NewTaskForm } from "@app/components/NewTaskForm";
import { Breadcrumb } from "sanapp-common-ui";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewTaskPage() {
  const me = await currentUser();
  if (!me) notFound();

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
        <Breadcrumb items={[{ label: "Dashboard", href: "/" }, { label: "My Tasks", href: "/tasks" }, { label: "New task" }]} />
      </div>
      <h1 className="iipe-page-title">New Task</h1>
      <p className="iipe-page-sub">
        Create a daily, weekly, monthly, quarterly, half-yearly, yearly or one-time task. Assign it to
        yourself, others, or both — everyone assigned can log time and comments.
      </p>
      <div className="mt-4 max-w-xl">
        <NewTaskForm users={users} meId={me.id} />
      </div>
    </AppShell>
  );
}
