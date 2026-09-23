import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@app/components/AppShell";
import { Breadcrumb, apiPath } from "sanapp-common-ui";
import { HoursSummaryClient } from "@app/components/HoursSummaryClient";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function HoursPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; from?: string; to?: string }>;
}) {
  const me = await currentUser();
  if (!me) notFound();
  const sp = await searchParams;
  const canViewOthers = me.role === "POC" || me.role === "ADMIN";

  let people: { id: string; name: string; username: string; role: string }[] = [];
  if (canViewOthers) {
    people = await prisma.appUser.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, username: true, role: true },
    });
  }

  const target = sp.user && (sp.user === me.id || canViewOthers) ? sp.user : me.id;

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
      active="hours"
      sidebarItems={[]}
    >
      <div className="mb-3">
        <Breadcrumb items={[{ label: "Dashboard", href: "/" }, { label: "My Hours" }]} />
      </div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="iipe-page-title">Hours</h1>
          <p className="iipe-page-sub">
            Time spent on request tickets and completed tasks — by day, request, and task.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={apiPath("/hours/calendar")} className="iipe-btn">
            Calendar
          </a>
          {canViewOthers && (
            <a href={apiPath("/admin/hours")} className="iipe-btn">
              Hours oversight
            </a>
          )}
        </div>
      </div>

      <HoursSummaryClient
        meId={me.id}
        canViewOthers={canViewOthers}
        people={people}
        initialUserId={target}
        initialFrom={sp.from}
        initialTo={sp.to}
      />
    </AppShell>
  );
}
