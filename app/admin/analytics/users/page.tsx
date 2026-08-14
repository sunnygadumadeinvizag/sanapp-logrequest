import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@app/components/AppShell";
import { Breadcrumb } from "iipe-common-ui";
import { notFound } from "next/navigation";
import { fmtMinutes, statusLabel } from "@/lib/labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminUserAnalyticsPage() {
  const me = await currentUser();
  if (!me || me.role !== "ADMIN") notFound();

  const [users, requests] = await Promise.all([
    prisma.appUser.findMany({
      orderBy: { name: "asc" },
      select: { id: true, username: true, name: true, primaryRole: true, role: true },
    }),
    prisma.request.findMany({
      select: {
        status: true,
        requestedById: true,
        requestedForId: true,
        assignedPocId: true,
        totalWorkMinutes: true,
      },
    }),
  ]);

  const rows = users.map((u) => {
    const raised = requests.filter((r) => r.requestedById === u.id).length;
    const raisedFor = requests.filter((r) => r.requestedById === u.id && r.requestedForId !== u.id).length;
    const assigned = requests.filter((r) => r.assignedPocId === u.id).length;
    const solved = requests.filter((r) => r.assignedPocId === u.id && r.status === "CLOSED").length;
    const workMinutes = requests
      .filter((r) => r.assignedPocId === u.id)
      .reduce((acc, r) => acc + r.totalWorkMinutes, 0);
    return { u, raised, raisedFor, assigned, solved, workMinutes };
  });

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
      </p>

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
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="p-3 font-medium">
                      {u.name} <span className="text-xs text-muted-foreground">({u.username})</span>
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
