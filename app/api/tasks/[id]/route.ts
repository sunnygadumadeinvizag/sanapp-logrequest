import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";
import { periodKeyFor, istDateFromString, type TaskSchedule } from "@/lib/tasks";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const RECURRENCES = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "HALF_YEARLY",
  "YEARLY",
  "ONE_TIME",
];

// PATCH /api/tasks/[id] — creator or ADMIN updates schedule / assignees / active.
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

  // Schedule changes — recompute the fields for the (possibly new) recurrence.
  if (body.recurrence && RECURRENCES.includes(body.recurrence)) {
    const r = body.recurrence;
    data.recurrence = r;
    data.weekday = r === "WEEKLY" ? Number(body.weekday ?? 1) : null;
    data.dayOfMonth = ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"].includes(r)
      ? Number(body.dayOfMonth ?? 1)
      : null;
    data.monthOfYear = r === "YEARLY" ? Number(body.monthOfYear ?? 1) : null;
    data.anchorMonth =
      r === "QUARTERLY" || r === "HALF_YEARLY" ? Number(body.anchorMonth ?? new Date().getUTCMonth() + 1) : null;
    data.specificDate = r === "ONE_TIME" ? istDateFromString(String(body.specificDate ?? "")) : null;
    if (r === "ONE_TIME" && !data.specificDate) {
      return NextResponse.json({ error: "bad_specific_date" }, { status: 400 });
    }
  } else {
    // Same recurrence — allow tweaking the relevant knobs.
    if (task.recurrence === "WEEKLY" && body.weekday !== undefined) {
      const w = Number(body.weekday);
      if (Number.isInteger(w) && w >= 0 && w <= 6) data.weekday = w;
    }
    if (["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"].includes(task.recurrence) && body.dayOfMonth !== undefined) {
      const d = Number(body.dayOfMonth);
      if (Number.isInteger(d) && d >= 1 && d <= 31) data.dayOfMonth = d;
    }
    if (task.recurrence === "YEARLY" && body.monthOfYear !== undefined) {
      const m = Number(body.monthOfYear);
      if (Number.isInteger(m) && m >= 1 && m <= 12) data.monthOfYear = m;
    }
    if ((task.recurrence === "QUARTERLY" || task.recurrence === "HALF_YEARLY") && body.anchorMonth !== undefined) {
      const m = Number(body.anchorMonth);
      if (Number.isInteger(m) && m >= 1 && m <= 12) data.anchorMonth = m;
    }
    if (task.recurrence === "ONE_TIME" && body.specificDate !== undefined) {
      const d = istDateFromString(String(body.specificDate));
      if (!d) return NextResponse.json({ error: "bad_specific_date" }, { status: 400 });
      data.specificDate = d;
    }
  }

  // Replace the assignee list when provided.
  let replaceAssignees: { userId: string }[] | null = null;
  if (Array.isArray(body.assigneeIds)) {
    const ids = [
      ...new Set(
        (body.assigneeIds as unknown[])
          .map((x) => String(x))
          .filter((x) => x && x !== me.id)
      ),
    ];
    const found = ids.length
      ? await prisma.appUser.findMany({ where: { id: { in: ids } }, select: { id: true } })
      : [];
    replaceAssignees = found.map((u) => ({ userId: u.id }));
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (replaceAssignees) {
      await tx.taskAssignee.deleteMany({ where: { taskId: id } });
      if (replaceAssignees.length) {
        await tx.taskAssignee.createMany({
          data: replaceAssignees.map((a) => ({ taskId: id, userId: a.userId })),
          skipDuplicates: true,
        });
      }
      // Re-seed the current period for anyone newly added (and keep existing).
      const schedule: TaskSchedule = {
        recurrence: (data.recurrence as any) ?? task.recurrence,
        weekday: (data.weekday as any) ?? task.weekday,
        dayOfMonth: (data.dayOfMonth as any) ?? task.dayOfMonth,
        monthOfYear: (data.monthOfYear as any) ?? task.monthOfYear,
        anchorMonth: (data.anchorMonth as any) ?? task.anchorMonth,
        specificDate: (data.specificDate as any) ?? task.specificDate,
      };
      const key = periodKeyFor(schedule);
      const dueIds = replaceAssignees.length
        ? replaceAssignees.map((a) => a.userId)
        : [task.userId];
      for (const uid of dueIds) {
        await tx.recurringTaskLog.upsert({
          where: { taskId_periodKey_userId: { taskId: id, periodKey: key, userId: uid } },
          update: {},
          create: { taskId: id, userId: uid, periodKey: key, status: "PENDING" },
        });
      }
    }
    return tx.recurringTask.update({
      where: { id },
      data,
      include: {
        user: { select: { id: true, username: true, name: true } },
        assignees: { include: { user: { select: { id: true, username: true, name: true } } } },
        logs: {
          orderBy: { periodKey: "desc" },
          take: 60,
          include: { user: { select: { id: true, username: true, name: true } } },
        },
      },
    });
  });

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
  if (hard) {
    await prisma.recurringTask.delete({ where: { id } });
    return NextResponse.json({ ok: true, deleted: true });
  }
  await prisma.recurringTask.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true, deactivated: true });
}
