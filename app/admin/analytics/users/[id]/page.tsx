import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@app/components/AppShell";
import { Breadcrumb, apiPath } from "sanapp-common-ui";
import { notFound } from "next/navigation";
import { fmtIstDateTime, fmtMinutes, fmtRequestNumber, statusLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

const IST_MS = (5 * 60 + 30) * 60 * 1000;
const istDayStart = (d: string) => new Date(new Date(`${d}T00:00:00Z`).getTime() - IST_MS);
const istDayEnd = (d: string) => new Date(new Date(`${d}T23:59:59.999Z`).getTime() - IST_MS);

export default async function AdminUserAnalyticsDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const me = await currentUser();
  if (!me || me.role !== "ADMIN") notFound();

  const { id } = await params;
  const sp = await searchParams;
  const from = sp.from ?? "";
  const to = sp.to ?? "";

  const createdWhere: Record<string, unknown> = {};
  if (from) createdWhere.createdAt = { gte: istDayStart(from) };
  if (to) {
    const toEnd = istDayEnd(to);
    createdWhere.createdAt = { ...(createdWhere.createdAt as object), lte: toEnd };
  }

  const [user, requests] = await Promise.all([
    prisma.appUser.findUnique({
      where: { id },
      select: { id: true, username: true, name: true, primaryRole: true, email: true },
    }),
    prisma.request.findMany({
      where: { requestedById: id, ...createdWhere },
      orderBy: { createdAt: "desc" },
      select: {
        number: true,
        title: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        totalWorkMinutes: true,
        category: { select: { name: true } },
        requestedFor: { select: { id: true, name: true } },
      },
    }),
  ]);
  if (!user) notFound();

  const countBy = (s: string) => requests.filter((r) => r.status === s).length;

  // Monthly buckets (IST wall-clock month of creation).
  const byMonth = new Map<string, number>();
  for (const r of requests) {
    const m = new Date(r.createdAt.getTime() + IST_MS).toISOString().slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const backHref = apiPath(`/admin/analytics/users${qs.toString() ? `?${qs}` : ""}`);

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
            { label: "Users", href: backHref },
            { label: user.name },
          ]}
        />
      </div>
      <h1 className="iipe-page-title">{user.name}</h1>
      <p className="iipe-page-sub">
        @{user.username}
        {user.email ? ` · ${user.email}` : ""}
        {from || to ? ` · range ${from || "beginning"} → ${to || "today"}` : " · all time"}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Total raised", String(requests.length)],
          ...["OPEN", "IN_PROGRESS", "CLOSED"].map((s) => [
            statusLabel(s),
            String(countBy(s)),
          ]),
          ["Work time logged", fmtMinutes(requests.reduce((a, r) => a + r.totalWorkMinutes, 0))],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      {months.length > 0 && (
        <>
          <h2 className="mt-6 text-lg font-semibold">Requests by month</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {months.map(([m, c]) => (
              <span key={m} className="rounded-md border bg-card px-3 py-2 text-sm">
                <strong>{c}</strong> <span className="text-muted-foreground">in {m}</span>
              </span>
            ))}
          </div>
        </>
      )}

      <h2 className="mt-6 text-lg font-semibold">Every request ({requests.length})</h2>
      <div className="mt-3 rounded-lg border bg-card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="p-3">#</th>
              <th className="p-3">Raised at (IST)</th>
              <th className="p-3">Title</th>
              <th className="p-3">Category</th>
              <th className="p-3">On behalf of</th>
              <th className="p-3">Status</th>
              <th className="p-3">Resolved at (IST)</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.number} className="border-b last:border-0 align-top">
                <td className="p-3 font-semibold">{fmtRequestNumber(r.number)}</td>
                <td className="p-3 whitespace-nowrap">{fmtIstDateTime(r.createdAt.toISOString())}</td>
                <td className="p-3">
                  <a href={apiPath(`/requests/${r.number}`)} className="text-primary hover:underline">
                    {r.title}
                  </a>
                </td>
                <td className="p-3">{r.category.name}</td>
                <td className="p-3">{r.requestedFor.id === id ? "—" : r.requestedFor.name}</td>
                <td className="p-3">{statusLabel(r.status)}</td>
                <td className="p-3 whitespace-nowrap">{r.resolvedAt ? fmtIstDateTime(r.resolvedAt.toISOString()) : "—"}</td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">No requests in this range.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
