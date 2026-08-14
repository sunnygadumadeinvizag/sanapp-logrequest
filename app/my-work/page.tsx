import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@app/components/AppShell";
import { apiPath } from "iipe-common-ui";
import { fmtMinutes, fmtIstDateTime, fmtRequestNumber, statusLabel } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MyWorkPage() {
  const me = await currentUser();
  if (!me || (me.role !== "POC" && me.role !== "ADMIN")) notFound();

  const [workLogs, closed, handled, totalMinutes] = await Promise.all([
    prisma.workLog.findMany({
      where: { pocId: me.id, endedAt: { not: null } },
      orderBy: { endedAt: "desc" },
      take: 50,
      include: { request: { select: { id: true, number: true, title: true } } },
    }),
    prisma.request.count({
      where: {
        OR: [{ assignedPocId: me.id }],
        status: "CLOSED",
      },
    }),
    prisma.request.count({
      where: {
        assignedPocId: me.id,
        status: { notIn: ["OPEN", "CANCELLED"] },
      },
    }),
    prisma.request.aggregate({
      where: { assignedPocId: me.id },
      _sum: { totalWorkMinutes: true },
    }),
  ]);

  const perRequest = new Map<string, { number: number; title: string; minutes: number; sessions: number }>();
  for (const w of workLogs) {
    const key = w.requestId;
    const cur = perRequest.get(key) ?? { number: w.request.number, title: w.request.title, minutes: 0, sessions: 0 };
    cur.minutes += w.minutes;
    cur.sessions += 1;
    perRequest.set(key, cur);
  }

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
      active="my-work"
      sidebarItems={[]}
    >
      <h1 className="iipe-page-title">My Work</h1>
      <p className="iipe-page-sub">Track how much work you have done and how much time you have spent.</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm">Requests handled</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{handled}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Closed</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{closed}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Total time spent</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmtMinutes(totalMinutes._sum.totalWorkMinutes ?? 0)}</p></CardContent>
        </Card>
      </div>

      <div className="mt-6 rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Time by request</h3>
        </div>
        <div className="divide-y">
          {perRequest.size === 0 && <p className="p-6 text-sm text-muted-foreground">No work logged yet.</p>}
          {[...perRequest.entries()].map(([reqId, v]) => (
            <a key={reqId} href={apiPath(`/requests/${reqId}`)} className="flex items-center justify-between p-3 hover:bg-muted/40">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{fmtRequestNumber(v.number)} — {v.title}</p>
                <p className="text-xs text-muted-foreground">{v.sessions} session{v.sessions === 1 ? "" : "s"}</p>
              </div>
              <span className="text-sm font-semibold">{fmtMinutes(v.minutes)}</span>
            </a>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Recent sessions</h3>
        </div>
        <div className="divide-y">
          {workLogs.length === 0 && <p className="p-6 text-sm text-muted-foreground">No work sessions yet.</p>}
          {workLogs.map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <a href={apiPath(`/requests/${w.requestId}`)} className="min-w-0 cursor-pointer truncate">
                <span className="font-medium">{fmtRequestNumber(w.request.number)}</span> — {w.request.title}
                {w.note && <span className="text-muted-foreground"> · {w.note}</span>}
              </a>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {w.startedAt ? fmtIstDateTime(w.startedAt.toISOString()) : ""}
                </span>
                <Badge variant="outline">{fmtMinutes(w.minutes)}</Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
