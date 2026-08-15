import { currentUser, listSsoUsers } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@app/components/AppShell";
import { NewRequestForm } from "@app/components/NewRequestForm";

export const dynamic = "force-dynamic";

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const me = await currentUser();
  const sp = await searchParams;

  const categories = await prisma.category.findMany({
    where: { active: true },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { subCategories: { where: { active: true }, orderBy: { order: "asc" } } },
  });
  const ssoUsers = await listSsoUsers();

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
      <h1 className="iipe-page-title">Log a Request</h1>
      <p className="iipe-page-sub">
        Choose the category that matches the issue — a POC will take it up on a first-come-first-served basis.
      </p>

      <div className="mt-4 max-w-2xl">
        <NewRequestForm
          categories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
            eligible:
              me?.role === "ADMIN" ||
              me?.role === "POC" ||
              c.allowedRoles.length === 0 ||
              (me?.primaryRole ? c.allowedRoles.includes(me.primaryRole) : false),
            requireLocation: c.requireLocation,
            requireContactTime: c.requireContactTime,
            requireContactPhone: c.requireContactPhone,
            directAssign: c.directAssign,
            subCategories: c.subCategories.map((s) => ({
              id: s.id,
              name: s.name,
              requireLocation: s.requireLocation,
              requireContactTime: s.requireContactTime,
              requireContactPhone: s.requireContactPhone,
              directAssign: s.directAssign,
            })),
          }))}
          me={{
            username: me?.username ?? "",
            name: me?.name ?? "",
            role: me?.role ?? "USER",
          }}
          initialCategory={sp.category ?? ""}
          ssoUsers={ssoUsers.map((u) => ({ username: u.username, name: u.name, primaryRole: u.primaryRole }))}
        />
      </div>
    </AppShell>
  );
}
