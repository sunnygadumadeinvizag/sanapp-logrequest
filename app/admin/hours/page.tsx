import { currentUser } from "@/lib/auth";
import { AppShell } from "@app/components/AppShell";
import { Breadcrumb, apiPath } from "sanapp-common-ui";
import { AdminHoursClient } from "@app/components/AdminHoursClient";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminHoursPage() {
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
      active="admin"
      sidebarItems={[]}
    >
      <div className="mb-3">
        <Breadcrumb
          items={[
            { label: "App Admin Console", href: "/admin" },
            { label: "Hours Oversight" },
          ]}
        />
      </div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="iipe-page-title">Hours Oversight</h1>
          <p className="iipe-page-sub">
            Hours spent per person — request tickets and completed tasks combined. Open a person for detail and calendar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={apiPath("/hours")} className="iipe-btn">
            My hours
          </a>
          <a href={apiPath("/hours/calendar")} className="iipe-btn">
            My calendar
          </a>
        </div>
      </div>

      <AdminHoursClient meId={me.id} />
    </AppShell>
  );
}
