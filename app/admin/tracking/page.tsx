import { currentUser } from "@/lib/auth";
import { AppShell } from "@app/components/AppShell";
import { AdminTrackingClient } from "@app/components/AdminTrackingClient";
import { Breadcrumb } from "iipe-common-ui";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminTrackingPage() {
  const me = await currentUser();
  if (!me || me.role !== "ADMIN") notFound();

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
            { label: "Full Tracking" },
          ]}
        />
      </div>
      <h1 className="iipe-page-title">Full Tracking</h1>
      <p className="iipe-page-sub">
        Every request, every user and every POC — filter by status, category, user or text.
      </p>
      <div className="mt-4">
        <AdminTrackingClient />
      </div>
    </AppShell>
  );
}
