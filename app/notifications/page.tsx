import { currentUser } from "@/lib/auth";
import { AppShell } from "@app/components/AppShell";
import { AppNotificationsView, Breadcrumb } from "sanapp-common-ui";

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
      <Breadcrumb items={[{ label: "Dashboard", href: "/" }, { label: "App Notifications" }]} />
      <h1 className="iipe-page-title">App Notifications</h1>
      <p className="iipe-page-sub">
        Alerts from Log Request — assignments, status changes and comments on your requests.
        Notifications from every application also appear under the bell in the header.
      </p>
      <div className="mt-4">
        <AppNotificationsView appName="Log Request" />
      </div>
    </AppShell>
  );
}
