import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@app/components/AppShell";
import { RequestsClient } from "@app/components/RequestsClient";
import { apiPath } from "sanapp-common-ui";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const me = await currentUser();
  const sp = await searchParams;
  const tab = sp.tab === "assigned" ? "assigned" : "mine";
  const categories = await prisma.category.findMany({
    where: { active: true },
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  });

  const isPoc = me?.role === "POC" || me?.role === "ADMIN";

  return (
    <AppShell
      me={{
        sub: me?.ssoUserId ?? "",
        username: me?.username ?? "",
        name: me?.name ?? "",
        email: me?.email ?? "",
        role: me?.role ?? "USER",
        primaryRole: me?.primaryRole ?? "",
      }}
      active="requests"
      sidebarItems={[]}
    >
      <h1 className="iipe-page-title">My Requests</h1>
      <p className="iipe-page-sub">
        {tab === "mine"
          ? "Every request you have raised — track status, comments and work history."
          : "Requests assigned to you (raised directly against you) — handled first-come, first-served."}
      </p>

      <div className="mt-4 flex gap-1 rounded-lg border bg-card p-1 text-sm">
        <a
          href={apiPath("/requests")}
          className={`flex-1 rounded-md px-3 py-1.5 text-center font-medium ${
            tab === "mine" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/60"
          }`}
        >
          Raised by me
        </a>
        <a
          href={apiPath("/requests?tab=assigned")}
          className={`flex-1 rounded-md px-3 py-1.5 text-center font-medium ${
            tab === "assigned" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/60"
          }`}
        >
          Assigned to me
        </a>
      </div>

      <div className="mt-3">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <RequestsClient scope={tab} categories={categories} />
        </Suspense>
      </div>
      {isPoc && (
        <p className="mt-4 text-xs text-muted-foreground">
          As a POC you can also see the{" "}
          <a href={apiPath("/queue")} className="text-primary hover:underline">POC queue</a> and your{" "}
          <a href={apiPath("/my-work")} className="text-primary hover:underline">work history</a>.
        </p>
      )}
    </AppShell>
  );
}
