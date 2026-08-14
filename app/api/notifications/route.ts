import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";

export const dynamic = "force-dynamic";

// GET /api/notifications?unread=1&page= — the current user's notifications.
export async function GET(request: NextRequest) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const onlyUnread = sp.get("unread") === "1";
  const page = Math.max(1, Number(sp.get("page") ?? "1"));
  const limit = Math.min(50, Math.max(5, Number(sp.get("limit") ?? "15")));

  const where = { userId: me.id, ...(onlyUnread ? { read: false } : {}) };
  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where }),
  ]);

  return NextResponse.json({
    notifications: rows.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      kind: n.kind,
      read: n.read,
      requestId: n.requestId,
      createdAt: n.createdAt.toISOString(),
    })),
    total,
    page,
    limit,
  });
}

// POST /api/notifications — { markAllRead: true } marks everything read.
export async function POST(request: NextRequest) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (body.markAllRead) {
    await prisma.notification.updateMany({ where: { userId: me.id, read: false }, data: { read: true } });
  }
  return NextResponse.json({ ok: true });
}
