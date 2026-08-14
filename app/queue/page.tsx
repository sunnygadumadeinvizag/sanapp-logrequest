import { currentUser } from "@/lib/auth";
import { AppShell } from "@app/components/AppShell";
import { QueueClient } from "@app/components/QueueClient";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const me = await currentUser();
  if (!me || (me.role !== "POC" && me.role !== "ADMIN")) notFound();

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
      active="queue"
      sidebarItems={[]}
    >
      <h1 className="iipe-page-title">POC Queue</h1>
      <p className="iipe-page-sub">
        Requests waiting in your categories, in order. Take the next one — they are served on a
        first-come, first-served basis.
      </p>
      <div className="mt-4">
        <QueueClient meUsername={me.username} />
      </div>
    </AppShell>
  );
}
