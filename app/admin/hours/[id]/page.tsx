import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@app/components/AppShell";
import { Breadcrumb, apiPath } from "sanapp-common-ui";
import { HoursSummaryClient } from "@app/components/HoursSummaryClient";
import { HoursCalendarClient } from "@app/components/HoursCalendarClient";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export default async function AdminPersonHoursPage({ params }: Ctx) {
  const me = await currentUser();
  if (!me || (me.role !== "POC" && me.role !== "ADMIN")) notFound();
  const { id } = await params;

  const person = await prisma.appUser.findUnique({
    where: { id },
    select: { id: true, name: true, username: true, role: true },
  });
  if (!person) notFound();

  const people = await prisma.appUser.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, username: true, role: true },
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
      active="admin"
      sidebarItems={[]}
    >
      <div className="mb-3">
        <Breadcrumb
          items={[
            { label: "App Admin Console", href: "/admin" },
            { label: "Hours Oversight", href: "/admin/hours" },
            { label: person.name },
          ]}
        />
      </div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="iipe-page-title">{person.name} — hours</h1>
          <p className="iipe-page-sub">
            @{person.username} · {person.role} · request tickets + completed tasks
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={apiPath("/admin/hours")} className="iipe-btn">
            All people
          </a>
          <a href={apiPath(`/hours?user=${person.id}`)} className="iipe-btn">
            Summary
          </a>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="mb-2 text-sm font-semibold">Calendar</h2>
          <HoursCalendarClient
            meId={me.id}
            canViewOthers
            people={people}
            viewUserId={person.id}
            title={`Viewing ${person.name}`}
          />
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold">Summary breakdown</h2>
          <HoursSummaryClient
            meId={me.id}
            canViewOthers
            people={people}
            initialUserId={person.id}
          />
        </div>
      </div>
    </AppShell>
  );
}
