import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";
import { listSsoUsers } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/admin/pocs — all POC assignments (admin console).
export async function GET() {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [assignments, users] = await Promise.all([
    prisma.pocAssignment.findMany({
      include: {
        user: { select: { id: true, username: true, name: true, primaryRole: true } },
        category: { select: { id: true, name: true } },
        subCategory: { select: { id: true, name: true } },
      },
      orderBy: [{ categoryId: "asc" }, { queueOrder: "asc" }],
    }),
    prisma.appUser.findMany({
      orderBy: [{ role: "desc" }, { name: "asc" }],
      select: { id: true, username: true, name: true, email: true, primaryRole: true, role: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({
    assignments: assignments.map((a) => ({
      id: a.id,
      userId: a.userId,
      username: a.user.username,
      name: a.user.name,
      categoryId: a.categoryId,
      category: a.category.name,
      subCategoryId: a.subCategoryId,
      subCategory: a.subCategory?.name ?? null,
      queueOrder: a.queueOrder,
      active: a.active,
    })),
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      email: u.email,
      primaryRole: u.primaryRole,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
    })),
    ssoUsers: await listSsoUsers(),
  });
}

// POST /api/admin/pocs — assign a user as POC for a category/sub-category.
export async function POST(request: NextRequest) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const username = String(body.username ?? "").trim();
  const categoryId = String(body.categoryId ?? "");
  const subCategoryId = body.subCategoryId ? String(body.subCategoryId) : null;
  const queueOrder = Math.max(0, Number(body.queueOrder ?? 1) || 1);

  // The user may not have signed into App5 yet (they get an appUser row on
  // first login). Look the identity up in the central SSO registry and create
  // the local row from it, so a POC can be assigned purely by SSO primary role.
  let user = await prisma.appUser.findUnique({ where: { username } });
  if (!user) {
    const sso = (await listSsoUsers()).find((u) => u.username === username);
    if (!sso) return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    user = await prisma.appUser.create({
      data: {
        ssoUserId: sso.id,
        username: sso.username,
        name: sso.name,
        email: sso.email,
        primaryRole: sso.primaryRole,
        role: "POC",
      },
    });
  }
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) return NextResponse.json({ error: "category_not_found" }, { status: 404 });
  if (subCategoryId) {
    const sub = await prisma.subCategory.findFirst({ where: { id: subCategoryId, categoryId } });
    if (!sub) return NextResponse.json({ error: "subcategory_not_found" }, { status: 404 });
  }

  const existing = await prisma.pocAssignment.findFirst({
    where: { userId: user.id, categoryId, subCategoryId },
  });
  if (existing) {
    await prisma.pocAssignment.update({
      where: { id: existing.id },
      data: { queueOrder, active: true },
    });
  } else {
    await prisma.pocAssignment.create({
      data: { userId: user.id, categoryId, subCategoryId, queueOrder, active: true },
    });
  }
  if (user.role === "USER") {
    await prisma.appUser.update({ where: { id: user.id }, data: { role: "POC" } });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
