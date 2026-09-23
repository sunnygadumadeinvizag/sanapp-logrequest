import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";
import { canViewTask } from "@/lib/tasks";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string; attId: string }> };

// GET /api/tasks/[id]/attachments/[attId] — download the stored PDF.
export async function GET(_request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, attId } = await ctx.params;

  const task = await prisma.recurringTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await canViewTask(task, me))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const att = await prisma.taskLogAttachment.findFirst({
    where: { id: attId, log: { taskId: id } },
  });
  if (!att) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return new NextResponse(new Uint8Array(att.data), {
    headers: {
      "content-type": att.mime || "application/pdf",
      "content-length": String(att.size),
      "content-disposition": `inline; filename="${att.name.replace(/["\\]/g, "")}"`,
      "cache-control": "private, max-age=3600",
    },
  });
}
