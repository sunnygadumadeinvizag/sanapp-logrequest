import { currentUser, listSsoUsers } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@app/components/AppShell";
import { AdminCategoriesClient } from "@app/components/AdminCategoriesClient";
import { Breadcrumb } from "sanapp-common-ui";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const me = await currentUser();
  if (!me || me.role !== "ADMIN") notFound();

  const categories = await prisma.category.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: {
      subCategories: {
        orderBy: { order: "asc" },
        include: {
          pocs: {
            where: { active: true },
            include: { user: { select: { id: true, username: true, name: true } } },
            orderBy: { queueOrder: "asc" },
          },
        },
      },
      pocs: {
        where: { active: true, subCategoryId: null },
        include: { user: { select: { id: true, username: true, name: true } } },
        orderBy: { queueOrder: "asc" },
      },
    },
  });
  const ssoUsers = await listSsoUsers();

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
            { label: "Categories & POCs" },
          ]}
        />
      </div>
      <h1 className="iipe-page-title">Categories &amp; POCs</h1>
      <p className="iipe-page-sub">
        Decide which primary roles may raise requests in each category, and who the point-of-contact
        (POC) is — in queue order, first come first served.
      </p>
      <div className="mt-4 max-w-3xl">
        <AdminCategoriesClient
          initialCategories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
            allowedRoles: c.allowedRoles,
            active: c.active,
            requireLocation: c.requireLocation,
            requireContactTime: c.requireContactTime,
            requireContactPhone: c.requireContactPhone,
            directAssign: c.directAssign,
            subCategories: c.subCategories.map((s) => ({
              id: s.id,
              name: s.name,
              description: s.description,
              active: s.active,
              requireLocation: s.requireLocation,
              requireContactTime: s.requireContactTime,
              requireContactPhone: s.requireContactPhone,
              directAssign: s.directAssign,
              pocs: s.pocs.map((p) => ({ id: p.id, name: p.user.name })),
            })),
            pocs: c.pocs.map((p) => ({ id: p.id, name: p.user.name, username: p.user.username })),
          }))}
          ssoUsers={ssoUsers.map((u) => ({ username: u.username, name: u.name, primaryRole: u.primaryRole }))}
        />
      </div>
    </AppShell>
  );
}
