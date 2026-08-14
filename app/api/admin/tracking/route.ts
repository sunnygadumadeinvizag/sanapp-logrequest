import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser, serializeRequest } from "@/lib/requests";

export const dynamic = "force-dynamic";

// GET /api/admin/tracking — the app-admin's complete view: every request with
// filters, per-user activity and per-POC workload/time, and the audit trail.
export async function GET(request: NextRequest) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const status = sp.get("status") ?? "";
  const q = (sp.get("q") ?? "").trim();
  const categoryId = sp.get("categoryId") ?? "";
  const userId = sp.get("userId") ?? "";
  const page = Math.max(1, Number(sp.get("page") ?? "1"));
  const limit = Math.min(50, Math.max(5, Number(sp.get("limit") ?? "15")));

  const where: any = {};
  if (status) where.status = status;
  if (categoryId) where.categoryId = categoryId;
  if (userId) where.requestedById = userId;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { number: Number.isInteger(Number(q)) ? Number(q) : -1 },
      { requestedBy: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.request.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        category: { select: { id: true, name: true } },
        subCategory: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, username: true, name: true } },
        requestedFor: { select: { id: true, username: true, name: true } },
        assignedPoc: { select: { id: true, username: true, name: true } },
      },
    }),
    prisma.request.count({ where }),
  ]);

  const [categories, pocs, userActivity, statusCounts] = await Promise.all([
    prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.pocAssignment.findMany({
      include: { user: { select: { id: true, username: true, name: true } } },
    }),
    prisma.requestEvent.groupBy({
      by: ["userId"],
      _count: { _all: true },
    }),
    prisma.request.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  // Per-POC workload: open tasks + total worked minutes + closed count.
  const pocIds = [...new Set(pocs.map((p) => p.userId))];
  const pocWork = await Promise.all(
    pocIds.map(async (pid) => {
      const [open, closed, minutes] = await Promise.all([
        prisma.request.count({ where: { assignedPocId: pid, status: { in: ["ASSIGNED", "IN_PROGRESS", "PENDING"] } } }),
        prisma.request.count({ where: { assignedPocId: pid, status: "CLOSED" } }),
        prisma.request.aggregate({ where: { assignedPocId: pid }, _sum: { totalWorkMinutes: true } }),
      ]);
      return { userId: pid, open, closed, minutes: minutes._sum.totalWorkMinutes ?? 0 };
    })
  );

  const users = await prisma.appUser.findMany({
    orderBy: { name: "asc" },
    select: { id: true, username: true, name: true, role: true, primaryRole: true },
  });

  return NextResponse.json({
    requests: rows.map(serializeRequest),
    total,
    page,
    limit,
    categories,
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])),
    users,
    pocs: pocs.map((p) => ({
      id: p.id,
      userId: p.userId,
      name: p.user.name,
      username: p.user.username,
      category: p.categoryId,
      subCategory: p.subCategoryId,
    })),
    pocWork,
    userActivity: Object.fromEntries(userActivity.map((u) => [u.userId, u._count._all])),
  });
}
