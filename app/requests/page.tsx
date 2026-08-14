import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@app/components/AppShell";
import { RequestsClient } from "@app/components/RequestsClient";
import { apiPath } from "iipe-common-ui";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const me = await currentUser();
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
      <p className="iipe-page-sub">Every request you have raised — track status, comments and work history.</p>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <RequestsClient scope="mine" categories={categories} />
      </Suspense>
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
