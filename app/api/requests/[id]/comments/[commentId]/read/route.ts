import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string; commentId: string }> };

// PATCH /api/requests/[id]/comments/[commentId]/read — mark read (true) or unread (false).
export async function PATCH(request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, commentId } = await ctx.params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const read = body.read !== false;

  const comment = await prisma.requestComment.findFirst({
    where: { id: commentId, requestId: id },
  });
  if (!comment) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const existing = await prisma.requestCommentRead.findUnique({
    where: { commentId_userId: { commentId, userId: me.id } },
  });

  if (read && !existing) {
    await prisma.requestCommentRead.create({ data: { commentId, userId: me.id } });
  } else if (!read && existing) {
    await prisma.requestCommentRead.delete({ where: { id: existing.id } });
  }

  return NextResponse.json({ read });
}
