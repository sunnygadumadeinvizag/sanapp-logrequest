import { currentUser } from "@/lib/auth";
import { AppShell } from "@app/components/AppShell";
import { NotificationsClient } from "@app/components/NotificationsClient";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const me = await currentUser();

  return (
    <AppShell
      me={{
        sub: me?.ssoUserId ?? "",
        username: me?.username ?? "",
        name: me?.name ?? "",
        email: me?.email ?? "",
        role: me?.role ?? "USER",
        primaryRole: me?.primaryRole ?? "",
      }}
      active="notifications"
      sidebarItems={[]}
    >
      <h1 className="iipe-page-title">Notifications</h1>
      <p className="iipe-page-sub">
        On-screen alerts when your requests are assigned, moved, commented on or closed.
      </p>
      <div className="mt-4 max-w-2xl">
        <NotificationsClient />
      </div>
    </AppShell>
  );
}
