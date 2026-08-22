import type { ReactNode } from "react";
import { cookies } from "next/headers";
import {
  AppsMenu,
  apiPath,
  getPlatformNav,
  lookupAppName,
  Notifications,
  PageShell,
  SessionGuard,
  UserMenu,
} from "sanapp-common-ui";
import type { AppUserSession } from "@/lib/session";
import { verifyAppSession } from "@/lib/session";
import { roleLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { NotifBell } from "./NotifBell";

const SSO_BASE_URL = process.env.SSO_BASE_URL ?? "http://localhost:3000";
const MAIN_BASE_URL = process.env.MAIN_BASE_URL ?? "http://localhost:3001";

export type SidebarItem = { label: string; href: string; active?: boolean; heading?: boolean };

export async function AppShell({
  me,
  active = "home",
  sidebarItems,
  children,
}: {
  me: AppUserSession;
  active?: "home" | "requests" | "queue" | "my-work" | "notifications" | "admin";
  sidebarItems: SidebarItem[];
  children: ReactNode;
}) {
  // The registry name for this deployment (one project can host several apps):
  // resolved from sanapp-main by base path, falling back to the project name.
  const appName = await lookupAppName({
    mainBaseUrl: MAIN_BASE_URL,
    appKey: process.env.MAIN_API_KEY,
    basePath: process.env.BASE_PATH ?? "/logrequest",
    fallback: "Log Request",
  });
  // The central SSO role is carried in the session JWT (pages rebuild the
  // AppUserSession literal from the local row, so re-derive it here).
  const ssoRole =
    (await verifyAppSession((await cookies()).get("app5_session")?.value ?? ""))?.ssoRole ??
    "USER";
  const isSuperAdmin = ssoRole === "SUPER_ADMIN";
  const local = await prisma.appUser.findUnique({ where: { username: me.username } });
  const userId = local?.id ?? "";
  const unreadCount = userId ? await prisma.notification.count({ where: { userId, read: false } }) : 0;
  const latest = userId
    ? await prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 5,
      })
    : [];

  const isPoc = local?.role === "POC" || local?.role === "ADMIN";

  const baseItems: SidebarItem[] = [
    { label: "Dashboard", href: "/", active: active === "home" },
    { label: "My Requests", href: "/requests", active: active === "requests" },
    { label: "New Request", href: "/requests/new" },
  ];
  if (isPoc) {
    baseItems.push(
      { label: "POC Queue", href: "/queue", active: active === "queue" },
      { label: "My Work", href: "/my-work", active: active === "my-work" }
    );
  }
  baseItems.push({
    label: unreadCount > 0 ? `Notifications (${unreadCount})` : "Notifications",
    href: "/notifications",
    active: active === "notifications",
  });
  if (local?.role === "ADMIN") {
    baseItems.push(
      { label: "App Admin Console", href: "/admin", heading: true, active: active === "admin" },
      { label: "Categories & POCs", href: "/admin/categories" },
      { label: "Full Tracking", href: "/admin/tracking" },
      { label: "Tracking: Users", href: "/admin/analytics/users" },
      { label: "Tracking: Categories", href: "/admin/analytics/categories" }
    );
  }
  const items = [...baseItems, ...sidebarItems];

  return (
    <PageShell
      appName={appName}
      header={{
        navItems: getPlatformNav({
          mainBaseUrl: MAIN_BASE_URL,
          ssoBaseUrl: SSO_BASE_URL,
          homeLabel: "Log Request",
          active: active as "home" | "my-apps" | "applications" | "account",
        }),
        right: (
          <>
            <AppsMenu launcherHref={MAIN_BASE_URL} />
            <Notifications
              items={latest.map((n) => ({
                id: n.id,
                title: n.title,
                time: n.createdAt.toISOString(),
                href: n.requestId ? apiPath(`/requests/${n.requestId}`) : apiPath("/notifications"),
              }))}
            />
            <UserMenu
              name={me.name}
              email={me.email}
              role={roleLabel(local?.role ?? me.role)}
              signOutHref="/api/logout"
            >
              <a href={`${SSO_BASE_URL}/account`}>My Account</a>
              {isSuperAdmin && (
                <>
                  <div className="iipe-dropdown-section">Admin Console</div>
                  <a href={`${MAIN_BASE_URL}/admin-console`}>Admin Console</a>
                </>
              )}
            </UserMenu>
          </>
        ),
      }}
      sidebarItems={items}
    >
      <SessionGuard channel="sanapp-logrequest-session" />
      <NotifBell initial={unreadCount} />
      {children}
    </PageShell>
  );
}
