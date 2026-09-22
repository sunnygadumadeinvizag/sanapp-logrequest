import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// PATCH /api/tasks/[id] — update title/description/schedule/active/reminder.
export async function PATCH(request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const task = await prisma.recurringTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (task.userId !== me.id && me.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const data: any = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (typeof body.description === "string") data.description = body.description.trim() || null;
  if (typeof body.reminderEnabled === "boolean") data.reminderEnabled = body.reminderEnabled;
  if (typeof body.active === "boolean") data.active = body.active;
  if (typeof body.reminderTime === "string") {
    data.reminderTime = /^\d{2}:\d{2}$/.test(body.reminderTime) ? body.reminderTime : null;
  }
  // Allow changing the schedule in place (keeping the same recurrence type but
  // moving the weekday / day-of-month is the common case).
  if (
    body.recurrence &&
    ["DAILY", "WEEKLY", "MONTHLY"].includes(body.recurrence) &&
    body.recurrence !== task.recurrence
  ) {
    data.recurrence = body.recurrence;
    data.weekday = body.recurrence === "WEEKLY" ? Number(body.weekday ?? 1) : null;
    data.dayOfMonth = body.recurrence === "MONTHLY" ? Number(body.dayOfMonth ?? 1) : null;
  } else if (body.recurrence === task.recurrence) {
    if (task.recurrence === "WEEKLY" && body.weekday !== undefined) {
      const w = Number(body.weekday);
      if (Number.isInteger(w) && w >= 0 && w <= 6) data.weekday = w;
    }
    if (task.recurrence === "MONTHLY" && body.dayOfMonth !== undefined) {
      const d = Number(body.dayOfMonth);
      if (Number.isInteger(d) && d >= 1 && d <= 31) data.dayOfMonth = d;
    }
  }

  const updated = await prisma.recurringTask.update({ where: { id }, data });
  return NextResponse.json({ task: updated });
}

// DELETE /api/tasks/[id] — soft-deactivate (or hard-delete when ?hard=1).
export async function DELETE(request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const task = await prisma.recurringTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (task.userId !== me.id && me.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const hard = request.nextUrl.searchParams.get("hard") === "1";
  if (hard && (task.userId === me.id || me.role === "ADMIN")) {
    await prisma.recurringTask.delete({ where: { id } });
    return NextResponse.json({ ok: true, deleted: true });
  }
  await prisma.recurringTask.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true, deactivated: true });
}
