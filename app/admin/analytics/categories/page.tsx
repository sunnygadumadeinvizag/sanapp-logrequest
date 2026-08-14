import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@app/components/AppShell";
import { Breadcrumb } from "sanapp-common-ui";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminCategoryAnalyticsPage() {
  const me = await currentUser();
  if (!me || me.role !== "ADMIN") notFound();

  const [categories, requests] = await Promise.all([
    prisma.category.findMany({
      orderBy: { order: "asc" },
      include: { subCategories: { where: { active: true }, orderBy: { order: "asc" } } },
    }),
    prisma.request.findMany({ select: { status: true, categoryId: true, subCategoryId: true } }),
  ]);

  const catRows = categories.map((c) => {
    const catReqs = requests.filter((r) => r.categoryId === c.id);
    const subs = c.subCategories.map((s) => {
      const subReqs = catReqs.filter((r) => r.subCategoryId === s.id);
      return {
        name: s.name,
        raised: subReqs.length,
        solved: subReqs.filter((r) => r.status === "CLOSED").length,
        resolved: subReqs.filter((r) => r.status === "RESOLVED").length,
        inFlight: subReqs.filter((r) => ["OPEN", "ASSIGNED", "IN_PROGRESS", "PENDING"].includes(r.status)).length,
      };
    });
    return {
      name: c.name,
      raised: catReqs.length,
      solved: catReqs.filter((r) => r.status === "CLOSED").length,
      resolved: catReqs.filter((r) => r.status === "RESOLVED").length,
      inFlight: catReqs.filter((r) => ["OPEN", "ASSIGNED", "IN_PROGRESS", "PENDING"].includes(r.status)).length,
      subs,
    };
  });

  const totals = catRows.reduce(
    (acc, c) => ({
      raised: acc.raised + c.raised,
      solved: acc.solved + c.solved,
      resolved: acc.resolved + c.resolved,
      inFlight: acc.inFlight + c.inFlight,
    }),
    { raised: 0, solved: 0, resolved: 0, inFlight: 0 }
  );

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
            { label: "Categories" },
          ]}
        />
      </div>
      <h1 className="iipe-page-title">Category tracking</h1>
      <p className="iipe-page-sub">
        Requests raised, solved and in flight for every category and sub-category.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total raised</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{totals.raised}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Solved (closed)</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{totals.solved}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Resolved (pending close)</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{totals.resolved}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">In flight</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{totals.inFlight}</CardContent></Card>
      </div>

      <div className="mt-4 space-y-3">
        {catRows.map((c) => (
          <Card key={c.name}>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{c.name}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  raised {c.raised} · solved {c.solved} · resolved {c.resolved} · in flight {c.inFlight}
                </span>
              </CardTitle>
            </CardHeader>
            {c.subs.length > 0 && (
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="p-2 pl-4">Sub-category</th>
                      <th className="p-2 text-right">Raised</th>
                      <th className="p-2 text-right">Solved</th>
                      <th className="p-2 text-right">Resolved</th>
                      <th className="p-2 pr-4 text-right">In flight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.subs.map((s) => (
                      <tr key={s.name} className="border-b last:border-0">
                        <td className="p-2 pl-4 font-medium">{s.name}</td>
                        <td className="p-2 text-right">{s.raised}</td>
                        <td className="p-2 text-right">{s.solved}</td>
                        <td className="p-2 text-right">{s.resolved}</td>
                        <td className="p-2 pr-4 text-right">{s.inFlight}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
