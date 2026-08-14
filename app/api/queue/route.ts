import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser, serializeRequest } from "@/lib/requests";

export const dynamic = "force-dynamic";

// GET /api/queue — the POC's view: categories they serve, waiting requests
// (open/unassigned) and their own in-flight workload.
export async function GET() {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const isPoc = me.role === "POC" || me.role === "ADMIN";
  if (!isPoc) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const assignments = await prisma.pocAssignment.findMany({
    where: { userId: me.id, active: true },
    include: { category: { select: { id: true, name: true } }, subCategory: { select: { id: true, name: true } } },
    orderBy: [{ categoryId: "asc" }, { queueOrder: "asc" }],
  });

  // Waiting requests: OPEN (unassigned) in the served categories, or assigned
  // to other POCs of the same category (so peers can see the queue depth).
  const servedSubs = assignments.filter((a) => a.subCategoryId).map((a) => a.subCategoryId!);
  const servedCats = assignments.filter((a) => !a.subCategoryId).map((a) => a.categoryId);

  const waiting = await prisma.request.findMany({
    where: {
      status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "PENDING"] },
      OR: [
        ...(servedSubs.length ? [{ subCategoryId: { in: servedSubs } }] : []),
        ...(servedCats.length ? [{ categoryId: { in: servedCats }, subCategoryId: null }] : []),
      ],
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: {
      category: { select: { id: true, name: true } },
      subCategory: { select: { id: true, name: true } },
      requestedBy: { select: { id: true, username: true, name: true } },
      requestedFor: { select: { id: true, username: true, name: true } },
      assignedPoc: { select: { id: true, username: true, name: true } },
    },
  });

  const myOpen = await prisma.request.count({
    where: {
      assignedPocId: me.id,
      status: { in: ["ASSIGNED", "IN_PROGRESS", "PENDING"] },
    },
  });
  const running = await prisma.workLog.findFirst({
    where: { pocId: me.id, endedAt: null },
    include: { request: { select: { id: true, number: true, title: true } } },
  });

  return NextResponse.json({
    assignments: assignments.map((a) => ({
      id: a.id,
      queueOrder: a.queueOrder,
      category: a.category.name,
      categoryId: a.category.id,
      subCategory: a.subCategory?.name ?? null,
      subCategoryId: a.subCategoryId,
    })),
    waiting: waiting.map(serializeRequest),
    myOpen,
    running: running
      ? { workLogId: running.id, requestId: running.request.id, number: running.request.number, title: running.request.title, startedAt: running.startedAt.toISOString() }
      : null,
  });
}
