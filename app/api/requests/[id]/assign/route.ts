import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser, notify, fmtRequestNumber } from "@/lib/requests";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// POST /api/requests/[id]/assign — a POC takes an unassigned/waiting request
// (first come, first served from the queue).
export async function POST(_request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const isPoc = me.role === "POC" || me.role === "ADMIN";
  if (!isPoc) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const r = await prisma.request.findUnique({
    where: { id },
    include: {
      category: true,
      subCategory: true,
    },
  });
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // A POC may only take requests from categories they serve.
  if (me.role !== "ADMIN") {
    const serves = await prisma.pocAssignment.count({
      where: {
        userId: me.id,
        active: true,
        OR: [
          { subCategoryId: r.subCategoryId ?? undefined, categoryId: r.categoryId },
          { subCategoryId: null, categoryId: r.categoryId },
        ],
      },
    });
    if (serves === 0) return NextResponse.json({ error: "not_in_your_category" }, { status: 403 });
  }

  const updated = await prisma.request.update({
    where: { id },
    data: {
      assignedPocId: me.id,
      status: r.status === "OPEN" ? "ASSIGNED" : r.status,
      events: {
        create: [
          {
            userId: me.id,
            type: "TAKEN",
            message: `${me.name} took the request from the queue`,
            toPocId: me.id,
          },
        ],
      },
    },
  });

  await notify(
    [r.requestedById],
    "ASSIGNED",
    "A POC has taken your request",
    `${fmtRequestNumber(r.number)} — ${me.name} is now handling it`,
    id
  );

  return NextResponse.json({ ok: true, status: updated.status });
}
