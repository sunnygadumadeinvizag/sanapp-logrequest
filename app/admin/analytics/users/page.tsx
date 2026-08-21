import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@app/components/AppShell";
import { Breadcrumb, apiPath } from "sanapp-common-ui";
import { notFound } from "next/navigation";
import { fmtMinutes } from "@/lib/labels";
import { DatePickerField } from "@app/components/DatePickerField";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const IST_MS = (5 * 60 + 30) * 60 * 1000;
const istDayStart = (d: string) => new Date(new Date(`${d}T00:00:00Z`).getTime() - IST_MS);
const istDayEnd = (d: string) => new Date(new Date(`${d}T23:59:59.999Z`).getTime() - IST_MS);

export default async function AdminUserAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const me = await currentUser();
  if (!me || me.role !== "ADMIN") notFound();

  const sp = await searchParams;
  const from = sp.from ?? "";
  const to = sp.to ?? "";

  const createdWhere: Record<string, unknown> = {};
  if (from) createdWhere.createdAt = { gte: istDayStart(from) };
  if (to) {
    const toEnd = istDayEnd(to);
    createdWhere.createdAt = { ...(createdWhere.createdAt as object), lte: toEnd };
  }

  const [users, requests] = await Promise.all([
    prisma.appUser.findMany({
      orderBy: { name: "asc" },
      select: { id: true, username: true, name: true, primaryRole: true, role: true },
    }),
    prisma.request.findMany({
      where: createdWhere,
      select: {
        status: true,
        requestedById: true,
        requestedForId: true,
        assignedPocId: true,
        totalWorkMinutes: true,
      },
    }),
  ]);

  const rows = users
    .map((u) => {
      const raised = requests.filter((r) => r.requestedById === u.id).length;
      const raisedFor = requests.filter((r) => r.requestedById === u.id && r.requestedForId !== u.id).length;
      const assigned = requests.filter((r) => r.assignedPocId === u.id).length;
      const solved = requests.filter((r) => r.assignedPocId === u.id && r.status === "CLOSED").length;
      const workMinutes = requests
        .filter((r) => r.assignedPocId === u.id)
        .reduce((acc, r) => acc + r.totalWorkMinutes, 0);
      return { u, raised, raisedFor, assigned, solved, workMinutes };
    })
    .sort((a, b) => b.raised - a.raised || b.assigned - a.assigned);

  const session = {
    sub: me.ssoUserId ?? "",
    username: me.username,
    name: me.name,
    email: me.email ?? "",
    role: me.role,
    primaryRole: me.primaryRole ?? "",
  };

  const exportQs = new URLSearchParams();
  if (from) exportQs.set("from", from);
  if (to) exportQs.set("to", to);

  return (
    <AppShell me={session} active="admin" sidebarItems={[]}>
      <div className="mb-3">
        <Breadcrumb
          items={[
            { label: "App Admin Console", href: "/admin" },
            { label: "Full Tracking", href: "/admin/tracking" },
            { label: "Users" },
          ]}
        />
      </div>
      <h1 className="iipe-page-title">User tracking</h1>
      <p className="iipe-page-sub">
        Which user raised which requests, how many they raised, how many were solved and the work hours involved.
        Click a person for their complete request-by-request history.
      </p>

      <form method="get" action={apiPath("/admin/analytics/users")} className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="iipe-field">
          <label htmlFor="from">Raised from</label>
          <DatePickerField id="from" name="from" defaultValue={from} />
        </div>
        <div className="iipe-field">
          <label htmlFor="to">Raised to</label>
          <DatePickerField id="to" name="to" defaultValue={to} />
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" className="iipe-btn">Apply</button>
          <a href={apiPath("/admin/analytics/users")} className="iipe-btn ghost">Reset</a>
          <a
            href={apiPath(`/api/admin/analytics/export${exportQs.toString() ? `?${exportQs}` : ""}`)}
            className="iipe-btn secondary"
            title="Download this report as Excel"
          >
            Export Excel ↓
          </a>
        </div>
      </form>

      <div className="mt-4">
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="p-3">User</th>
                  <th className="p-3">Primary role</th>
                  <th className="p-3 text-right">Raised</th>
                  <th className="p-3 text-right">On behalf</th>
                  <th className="p-3 text-right">Assigned</th>
                  <th className="p-3 text-right">Solved (closed)</th>
                  <th className="p-3 text-right">Work time</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ u, raised, raisedFor, assigned, solved, workMinutes }) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="p-3 font-medium">
                      <a href={apiPath(`/admin/analytics/users/${u.id}${exportQs.toString() ? `?${exportQs}` : ""}`)} className="text-primary hover:underline">
                        {u.name}
                      </a>{" "}
                      <span className="text-xs text-muted-foreground">({u.username})</span>
                    </td>
                    <td className="p-3 text-muted-foreground">{u.primaryRole?.replace(/_/g, " ").toLowerCase() ?? "—"}</td>
                    <td className="p-3 text-right">{raised}</td>
                    <td className="p-3 text-right">{raisedFor}</td>
                    <td className="p-3 text-right">{assigned}</td>
                    <td className="p-3 text-right">{solved}</td>
                    <td className="p-3 text-right font-medium">{fmtMinutes(workMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
