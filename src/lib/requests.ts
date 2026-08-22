import { cookies } from "next/headers";
import { verifyAppSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fmtRequestNumber, fmtIstDateTime } from "@/lib/labels";
import { pushAppNotifications } from "sanapp-common-ui";

const MAIN_BASE_URL = process.env.MAIN_BASE_URL ?? "http://localhost:3001";

/** Current local user, or null when not signed in. */
export async function sessionUser() {
  const store = await cookies();
  const token = store.get("app5_session")?.value;
  const user = token ? await verifyAppSession(token) : null;
  if (!user) return null;
  return prisma.appUser.findUnique({ where: { username: user.username } });
}

/**
 * Push on-screen notifications for a list of users via the central hub in
 * sanapp-main (deduplicated; best-effort, never throws). Local user ids are
 * resolved to SSO usernames; links deep-link into this app's request page so
 * they work from any application's notification bell.
 */
export async function notify(
  userIds: string[],
  kind: string,
  title: string,
  body: string,
  requestId?: string
) {
  const seen = new Set<string>();
  const ids = userIds.filter((id) => id && !seen.has(id) && seen.add(id));
  if (ids.length === 0) return;
  try {
    const users = await prisma.appUser.findMany({
      where: { id: { in: ids } },
      select: { username: true },
    });
    const items = users
      .filter((u) => u.username)
      .map((u) => ({
        username: u.username,
        title,
        body,
        href: requestId ? `${process.env.APP_BASE_URL ?? ""}/requests/${requestId}` : null,
      }));
    if (items.length === 0) return;
    await pushAppNotifications({
      mainBaseUrl: MAIN_BASE_URL,
      appKey: process.env.MAIN_API_KEY,
      basePath: process.env.BASE_PATH ?? "/logrequest",
      items,
    });
  } catch (e) {
    console.error("notify failed:", e);
  }
}

/** Serialize a request row for the JSON API (include common relations). */
export function serializeRequest(r: any) {
  return {
    id: r.id,
    number: r.number,
    requestId: fmtRequestNumber(r.number),
    title: r.title,
    description: r.description,
    location: r.location ?? null,
    contactTime: r.contactTime ?? null,
    contactPhone: r.contactPhone ?? null,
    status: r.status,
    priority: r.priority,
    totalWorkMinutes: r.totalWorkMinutes,
    closedAt: r.closedAt ? r.closedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    assetTag: r.assetTag ?? null,
    assetName: r.assetName ?? null,
    appName: r.appName ?? null,
    resolution: r.resolution ?? null,
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    category: r.category ? { id: r.category.id, name: r.category.name } : null,
    subCategory: r.subCategory ? { id: r.subCategory.id, name: r.subCategory.name } : null,
    requestedBy: r.requestedBy ? { id: r.requestedBy.id, username: r.requestedBy.username, name: r.requestedBy.name } : null,
    requestedFor: r.requestedFor ? { id: r.requestedFor.id, username: r.requestedFor.username, name: r.requestedFor.name } : null,
    assignedPoc: r.assignedPoc ? { id: r.assignedPoc.id, username: r.assignedPoc.username, name: r.assignedPoc.name } : null,
  };
}

export { fmtRequestNumber, fmtIstDateTime };
