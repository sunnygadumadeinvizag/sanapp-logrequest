import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser, notify, fmtRequestNumber } from "@/lib/requests";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// POST /api/requests/[id]/comments — add a comment; other participants get a
// notification, and the comment starts unread for them (read for the author).
export async function POST(request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const text = String(body.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "empty_comment" }, { status: 400 });

  const r = await prisma.request.findUnique({ where: { id } });
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const canView =
    me.role === "ADMIN" ||
    r.requestedById === me.id ||
    r.requestedForId === me.id ||
    r.assignedPocId === me.id;
  if (!canView) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const comment = await prisma.requestComment.create({
    data: {
      requestId: id,
      userId: me.id,
      body: text,
      reads: { create: [{ userId: me.id }] }, // author has read it
    },
    include: {
      user: { select: { id: true, username: true, name: true } },
    },
  });

  await prisma.requestEvent.create({
    data: { requestId: id, userId: me.id, type: "COMMENT", message: "Added a comment" },
  });

  // Notify the other participants (requester + assignee), not the author.
  const others = [r.requestedById, r.requestedForId, r.assignedPocId].filter(
    (u): u is string => !!u && u !== me.id
  );
  await notify(
    others,
    "COMMENT",
    `New comment on ${fmtRequestNumber(r.number)}`,
    `${me.name}: ${text.slice(0, 120)}`,
    id
  );

  return NextResponse.json(
    {
      comment: {
        id: comment.id,
        body: comment.body,
        readByMe: true,
        user: comment.user,
        createdAt: comment.createdAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
