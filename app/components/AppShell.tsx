import type { ReactNode } from "react";
import {
  AppsMenu,
  getPlatformNav,
  Notifications,
  PageShell,
  SessionGuard,
  UserMenu,
} from "iipe-common-ui";
import type { AppUserSession } from "@/lib/session";
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
      { label: "Admin Console", href: "/admin", heading: true, active: active === "admin" },
      { label: "Categories & POCs", href: "/admin/categories" },
      { label: "Full Tracking", href: "/admin/tracking" }
    );
  }
  const items = [...baseItems, ...sidebarItems];

  return (
    <PageShell
      header={{
        navItems: getPlatformNav({
          mainBaseUrl: MAIN_BASE_URL,
          ssoBaseUrl: SSO_BASE_URL,
          homeLabel: "Log Request",
          active: active as "home" | "my-apps" | "applications" | "account",
        }),
        right: (
          <>
            <AppsMenu launcherHref={`${MAIN_BASE_URL}/my-apps`} />
            <Notifications
              items={latest.map((n) => ({
                id: n.id,
                title: n.title,
                time: n.createdAt.toISOString(),
                href: n.requestId ? `/requests/${n.requestId}` : "/notifications",
              }))}
            />
            <UserMenu
              name={me.name}
              email={me.email}
              role={roleLabel(local?.role ?? me.role)}
              signOutHref="/api/logout"
            >
              <a href={`${SSO_BASE_URL}/account`}>My Account</a>
              <a href={`${MAIN_BASE_URL}/my-apps`}>My Apps</a>
            </UserMenu>
          </>
        ),
      }}
      sidebarItems={items}
    >
      <SessionGuard channel="iipe-app5-session" />
      <NotifBell initial={unreadCount} />
      {children}
    </PageShell>
  );
}
