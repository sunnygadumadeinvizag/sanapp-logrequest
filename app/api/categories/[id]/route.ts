import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const ALL_ROLES = ["STAFF_TEACHING", "STAFF_NON_TEACHING", "STUDENT", "SCHOLAR", "GUEST"];

// PATCH /api/categories/[id] — admin updates name/description/allowedRoles/active
// and manages sub-categories (add/rename/remove via subCategories array).
export async function PATCH(request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const cat = await prisma.category.findUnique({ where: { id } });
  if (!cat) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const data: any = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.description === "string") data.description = body.description.trim() || null;
  if (Array.isArray(body.allowedRoles)) {
    data.allowedRoles = body.allowedRoles.filter((r: string) => ALL_ROLES.includes(r));
  }
  if (typeof body.active === "boolean") data.active = body.active;

  const updated = await prisma.category.update({ where: { id }, data });

  // Sub-category sync: body.subCategories = [{name, description, active}] —
  // upserted by name within this category; existing ones not listed stay.
  if (Array.isArray(body.subCategories)) {
    for (const s of body.subCategories) {
      const sname = String(s?.name ?? "").trim();
      if (!sname) continue;
      await prisma.subCategory.upsert({
        where: { categoryId_name: { categoryId: id, name: sname } },
        update: {
          description: typeof s.description === "string" ? s.description.trim() || null : undefined,
          active: typeof s.active === "boolean" ? s.active : true,
        },
        create: {
          categoryId: id,
          name: sname,
          description: typeof s.description === "string" ? s.description.trim() || null : null,
          active: typeof s.active === "boolean" ? s.active : true,
          order: (await prisma.subCategory.count({ where: { categoryId: id } })) + 1,
        },
      });
    }
  }

  return NextResponse.json({ category: updated });
}

// DELETE /api/categories/[id] — admin deactivates a category (soft delete).
export async function DELETE(_request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;

  const hasRequests = await prisma.request.count({ where: { categoryId: id } });
  if (hasRequests > 0) {
    // Soft-delete: keep history, stop new requests.
    await prisma.category.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ ok: true, deactivated: true });
  }
  await prisma.category.delete({ where: { id } });
  return NextResponse.json({ ok: true, deleted: true });
}
