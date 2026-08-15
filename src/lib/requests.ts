import { cookies } from "next/headers";
import { verifyAppSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fmtRequestNumber, fmtIstDateTime } from "@/lib/labels";

/** Current local user, or null when not signed in. */
export async function sessionUser() {
  const store = await cookies();
  const token = store.get("app5_session")?.value;
  const user = token ? await verifyAppSession(token) : null;
  if (!user) return null;
  return prisma.appUser.findUnique({ where: { username: user.username } });
}

/**
 * Create on-screen notifications for a list of users (deduplicated, skips the
 * actor). Never throws — notifications are best-effort.
 */
export async function notify(
  userIds: string[],
  kind: string,
  title: string,
  body: string,
  requestId?: string
) {
  const seen = new Set<string>();
  const rows = userIds
    .filter((id) => id && !seen.has(id) && seen.add(id))
    .map((userId) => ({ userId, kind, title, body, requestId }));
  if (rows.length === 0) return;
  try {
    await prisma.notification.createMany({ data: rows });
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
    category: r.category ? { id: r.category.id, name: r.category.name } : null,
    subCategory: r.subCategory ? { id: r.subCategory.id, name: r.subCategory.name } : null,
    requestedBy: r.requestedBy ? { id: r.requestedBy.id, username: r.requestedBy.username, name: r.requestedBy.name } : null,
    requestedFor: r.requestedFor ? { id: r.requestedFor.id, username: r.requestedFor.username, name: r.requestedFor.name } : null,
    assignedPoc: r.assignedPoc ? { id: r.assignedPoc.id, username: r.assignedPoc.username, name: r.assignedPoc.name } : null,
  };
}

export { fmtRequestNumber, fmtIstDateTime };
