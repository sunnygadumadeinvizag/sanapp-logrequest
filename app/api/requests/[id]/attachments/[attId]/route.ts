import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string; attId: string }> };

// GET /api/requests/[id]/attachments/[attId] — download the stored file.
export async function GET(_request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, attId } = await ctx.params;

  const r = await prisma.request.findUnique({ where: { id } });
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const canView =
    me.role === "ADMIN" ||
    me.role === "POC" ||
    r.requestedById === me.id ||
    r.requestedForId === me.id ||
    r.assignedPocId === me.id;
  if (!canView) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const att = await prisma.requestAttachment.findFirst({
    where: { id: attId, requestId: id },
  });
  if (!att) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return new NextResponse(new Uint8Array(att.data), {
    headers: {
      "content-type": att.mime,
      "content-length": String(att.size),
      "content-disposition": `inline; filename="${att.name.replace(/["\\]/g, "")}"`,
      "cache-control": "private, max-age=3600",
    },
  });
}
