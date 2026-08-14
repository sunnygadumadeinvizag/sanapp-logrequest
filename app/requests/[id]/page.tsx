import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@app/components/AppShell";
import { RequestDetailClient } from "@app/components/RequestDetailClient";
import { Breadcrumb } from "sanapp-common-ui";
import { fmtIstDateTime } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await currentUser();
  const { id } = await params;
  if (!me) {
    return (
      <AppShell me={{ sub: "", username: "", name: "", email: "", role: "USER", primaryRole: "" }} sidebarItems={[]}>
        <p className="iipe-page-sub">Session not found.</p>
      </AppShell>
    );
  }

  const r = await prisma.request.findUnique({
    where: { id },
    include: {
      category: true,
      subCategory: true,
      requestedBy: { select: { id: true, username: true, name: true } },
      requestedFor: { select: { id: true, username: true, name: true } },
      assignedPoc: { select: { id: true, username: true, name: true } },
      events: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, username: true, name: true } } },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { id: true, username: true, name: true } },
          reads: { where: { userId: me.id }, select: { id: true } },
        },
      },
      attachments: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, mime: true, size: true, createdAt: true },
      },
      workLogs: {
        orderBy: { startedAt: "desc" },
        include: { poc: { select: { id: true, username: true, name: true } } },
      },
      workers: {
        include: { user: { select: { id: true, username: true, name: true, primaryRole: true } } },
      },
    },
  });

  if (!r) notFound();
  const canView =
    me.role === "ADMIN" ||
    me.role === "POC" ||
    r.requestedById === me.id ||
    r.requestedForId === me.id ||
    r.assignedPocId === me.id ||
    r.workers.some((w) => w.userId === me.id);
  if (!canView) notFound();

  // POC options for "move to another POC". The assigner picks a primary
  // role (SSO role) first, then a person by name — the platform role
  // (POC/ADMIN/USER) is not used for this selection.
  const pocOptions = await prisma.pocAssignment.findMany({
    where: {
      active: true,
      OR: [
        { subCategoryId: r.subCategoryId ?? undefined, categoryId: r.categoryId },
        { subCategoryId: null, categoryId: r.categoryId },
      ],
    },
    include: { user: { select: { id: true, username: true, name: true, primaryRole: true } } },
  });
  const otherPocs = me.role === "ADMIN"
    ? await prisma.appUser.findMany({
        where: { primaryRole: { not: null } },
        select: { id: true, username: true, name: true, primaryRole: true },
        orderBy: [{ primaryRole: "asc" }, { name: "asc" }],
      })
    : pocOptions.map((p) => p.user).filter((u) => u.id !== me.id);

  const session = {
    sub: me.ssoUserId ?? "",
    username: me.username,
    name: me.name,
    email: me.email ?? "",
    role: me.role,
    primaryRole: me.primaryRole ?? "",
  };

  const events = r.events;
  const latestEvent = events[events.length - 1];

  return (
    <AppShell me={session} active="requests" sidebarItems={[]}>
      <div className="mb-3">
        <Breadcrumb
          items={[
            { label: "My Requests", href: "/requests" },
            { label: r.category.name },
            { label: `REQ-${String(r.number).padStart(4, "0")}` },
          ]}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="iipe-page-title">{r.title}</h1>
          <p className="iipe-page-sub">
            REQ-{String(r.number).padStart(4, "0")} · {r.category.name}
            {r.subCategory ? ` / ${r.subCategory.name}` : ""} · Raised {fmtIstDateTime(r.createdAt.toISOString())}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge>{r.status}</Badge>
          <span className="text-xs text-muted-foreground">
            For: {r.requestedFor.name} ({r.requestedFor.username})
          </span>
        </div>
      </div>

      <div className="mb-4 rounded-lg border bg-card p-4">
        <h3 className="mb-1 text-sm font-semibold">Description</h3>
        <p className="whitespace-pre-wrap text-sm">{r.description}</p>
        {r.requestedById !== r.requestedForId && (
          <p className="mt-2 text-xs text-muted-foreground">
            Raised by {r.requestedBy.name} on behalf of {r.requestedFor.name}.
          </p>
        )}
      </div>

      {(r.location || r.contactTime || r.contactPhone) && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {r.location && (
            <div className="rounded-lg border bg-card p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Location</p>
              <p className="mt-0.5 text-sm">{r.location}</p>
            </div>
          )}
          {r.contactTime && (
            <div className="rounded-lg border bg-card p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Available to contact</p>
              <p className="mt-0.5 text-sm">{r.contactTime}</p>
            </div>
          )}
          {r.contactPhone && (
            <div className="rounded-lg border bg-card p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Phone</p>
              <p className="mt-0.5 text-sm">{r.contactPhone}</p>
            </div>
          )}
        </div>
      )}

      <RequestDetailClient
        data={{
          request: {
            id: r.id,
            requestId: `REQ-${String(r.number).padStart(4, "0")}`,
            status: r.status,
            priority: r.priority,
            totalWorkMinutes: r.totalWorkMinutes,
            assignedPoc: r.assignedPoc
              ? { name: r.assignedPoc.name, username: r.assignedPoc.username }
              : null,
          },
          comments: r.comments.map((c) => ({
            id: c.id,
            body: c.body,
            readByMe: c.reads.length > 0,
            user: { name: c.user.name, username: c.user.username },
            createdAt: c.createdAt.toISOString(),
          })),
          attachments: r.attachments.map((a) => ({
            id: a.id,
            name: a.name,
            mime: a.mime,
            size: a.size,
          })),
          workLogs: r.workLogs.map((w) => ({
            id: w.id,
            minutes: w.minutes,
            running: !w.endedAt,
            note: w.note,
            location: w.location,
            inCampus: w.inCampus,
            startedAt: w.startedAt.toISOString(),
            endedAt: w.endedAt ? w.endedAt.toISOString() : null,
            poc: { name: w.poc.name },
          })),
        }}
        me={{ username: me.username, name: me.name }}
        role={me.role as "ADMIN" | "POC" | "USER"}
        pocOptions={otherPocs.map((u) => ({
          id: u.id,
          name: u.name,
          username: u.username,
          primaryRole: u.primaryRole ?? "",
        }))}
        workers={r.workers.map((w) => ({
          id: w.id,
          userId: w.userId,
          username: w.user.username,
          name: w.user.name,
          primaryRole: w.user.primaryRole ?? "",
        }))}
        isWorker={r.workers.some((w) => w.userId === me.id)}
      />

      {/* Timeline */}
      <div className="mt-4 rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Activity timeline</h3>
        </div>
        <div className="space-y-0 p-4">
          {events.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
          {events.map((e, i) => (
            <div key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
              {i < events.length - 1 && <span className="absolute left-[5px] top-3 h-full w-px bg-border" />}
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${i === events.length - 1 ? "bg-primary" : "bg-border"}`} />
              <div className="min-w-0 text-sm">
                <p>
                  <span className="font-medium">{e.user.name}</span>{" "}
                  <span className="text-muted-foreground">{e.message}</span>
                </p>
                <p className="text-xs text-muted-foreground">{fmtIstDateTime(e.createdAt.toISOString())}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {latestEvent && (
        <p className="mt-3 text-xs text-muted-foreground">
          Last activity: {fmtIstDateTime(latestEvent.createdAt.toISOString())}
        </p>
      )}
    </AppShell>
  );
}
