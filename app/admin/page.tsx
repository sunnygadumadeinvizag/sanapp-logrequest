import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@app/components/AppShell";
import { apiPath } from "iipe-common-ui";
import { STATUS_LABELS, fmtMinutes } from "@/lib/labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const me = await currentUser();
  if (!me || me.role !== "ADMIN") notFound();

  const [open, assigned, inProgress, pending, resolved, closed, cancelled, users, pocs, minutes] =
    await Promise.all([
      prisma.request.count({ where: { status: "OPEN" } }),
      prisma.request.count({ where: { status: "ASSIGNED" } }),
      prisma.request.count({ where: { status: "IN_PROGRESS" } }),
      prisma.request.count({ where: { status: "PENDING" } }),
      prisma.request.count({ where: { status: "RESOLVED" } }),
      prisma.request.count({ where: { status: "CLOSED" } }),
      prisma.request.count({ where: { status: "CANCELLED" } }),
      prisma.appUser.count(),
      prisma.appUser.count({ where: { role: { in: ["POC", "ADMIN"] } } }),
      prisma.request.aggregate({ _sum: { totalWorkMinutes: true } }),
    ]);

  const session = {
    sub: me.ssoUserId ?? "",
    username: me.username,
    name: me.name,
    email: me.email ?? "",
    role: me.role,
    primaryRole: me.primaryRole ?? "",
  };

  return (
    <AppShell me={session} active="admin" sidebarItems={[]}>
      <h1 className="iipe-page-title">App Admin Console</h1>
      <p className="iipe-page-sub">Complete tracking of everything — categories, POCs, users and requests.</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Users" value={users} sub={`${pocs} POCs / admins`} />
        <Stat label="Total requests" value={open + assigned + inProgress + pending + resolved + closed + cancelled} />
        <Stat label="Total work logged" value={fmtMinutes(minutes._sum.totalWorkMinutes ?? 0)} />
        <Stat label="Open & in-flight" value={open + assigned + inProgress + pending} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Requests by status</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {[
              ["OPEN", open],
              ["ASSIGNED", assigned],
              ["IN_PROGRESS", inProgress],
              ["PENDING", pending],
              ["RESOLVED", resolved],
              ["CLOSED", closed],
              ["CANCELLED", cancelled],
            ].map(([k, v]) => (
              <div key={k as string} className="flex items-center justify-between text-sm">
                <span>{STATUS_LABELS[k as string] ?? k}</span>
                <a href={apiPath(`/admin/tracking?status=${k}`)} className="font-semibold text-primary hover:underline">{v}</a>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Management</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <a href={apiPath("/admin/categories")} className="block rounded-md border p-3 text-sm font-medium hover:bg-muted/40">
              Categories &amp; POCs — who may raise requests, POC queue order
            </a>
            <a href={apiPath("/admin/tracking")} className="block rounded-md border p-3 text-sm font-medium hover:bg-muted/40">
              Full Tracking — filter every request, user and POC workload
            </a>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
