import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";

export const dynamic = "force-dynamic";

// GET /api/categories — active categories with sub-categories and POCs, plus
// whether the current user may raise a request in each (role eligibility).
export async function GET() {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const categories = await prisma.category.findMany({
    where: { active: true },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: {
      subCategories: {
        where: { active: true },
        orderBy: [{ order: "asc" }, { name: "asc" }],
        include: {
          pocs: {
            where: { active: true },
            include: { user: { select: { id: true, username: true, name: true } } },
            orderBy: { queueOrder: "asc" },
          },
        },
      },
      pocs: {
        where: { active: true, subCategoryId: null },
        include: { user: { select: { id: true, username: true, name: true } } },
        orderBy: { queueOrder: "asc" },
      },
    },
  });

  return NextResponse.json({
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      allowedRoles: c.allowedRoles,
      eligible:
        me.role === "ADMIN" ||
        me.role === "POC" ||
        c.allowedRoles.length === 0 ||
        (me.primaryRole ? c.allowedRoles.includes(me.primaryRole) : false),
      pocs: c.pocs.map((p) => ({ id: p.id, name: p.user.name, username: p.user.username })),
      subCategories: c.subCategories.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        pocs: s.pocs.map((p) => ({ id: p.id, name: p.user.name, username: p.user.username })),
      })),
    })),
  });
}

// POST /api/categories — admin creates a category.
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
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400 });

  const allowedRoles: string[] = Array.isArray(body.allowedRoles) ? body.allowedRoles : [];
  const cat = await prisma.category.create({
    data: {
      name,
      description: body.description ? String(body.description).trim() : null,
      allowedRoles,
      order: (await prisma.category.count()) + 1,
    },
  });
  return NextResponse.json({ category: cat }, { status: 201 });
}
