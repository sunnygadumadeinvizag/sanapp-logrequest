import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@app/components/AppShell";
import { Breadcrumb, apiPath } from "sanapp-common-ui";
import { HoursCalendarClient } from "@app/components/HoursCalendarClient";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function HoursCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; month?: string }>;
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
        <Breadcrumb
          items={[
            { label: "Dashboard", href: "/" },
            { label: "My Hours", href: "/hours" },
            { label: "Calendar" },
          ]}
        />
      </div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="iipe-page-title">Hours calendar</h1>
          <p className="iipe-page-sub">
            Month view of request + task hours. Tap a day for the breakdown.
          </p>
        </div>
        <a href={apiPath("/hours")} className="iipe-btn">
          Summary
        </a>
      </div>

      <HoursCalendarClient
        meId={me.id}
        canViewOthers={canViewOthers}
        people={people}
        initialMonth={sp.month}
        viewUserId={target}
      />
    </AppShell>
  );
}
