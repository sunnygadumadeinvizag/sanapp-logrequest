import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser, notify, fmtRequestNumber } from "@/lib/requests";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const RUNNING_MAX_MS = 24 * 60 * 60 * 1000; // a work session cannot exceed 24h

// POST /api/requests/[id]/work — { action: "start" | "stop" | "log", note?, minutes? }
// POCs track the time they spend working on a request (start/stop sessions plus
// manual "log" entries). The request accumulates totalWorkMinutes.
export async function POST(request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const action = String(body.action ?? "");
  const note = String(body.note ?? "").trim() || null;

  const r = await prisma.request.findUnique({ where: { id } });
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const isPoc = me.role === "POC" || me.role === "ADMIN";
  const isAssignee = r.assignedPocId === me.id;
  if (!isPoc || !isAssignee) {
    return NextResponse.json({ error: "only_assignee_can_work" }, { status: 403 });
  }

  if (action === "start") {
    const running = await prisma.workLog.findFirst({
      where: { pocId: me.id, endedAt: null },
    });
    if (running) {
      return NextResponse.json({ error: "already_working" }, { status: 400 });
    }
    await prisma.workLog.create({
      data: { requestId: id, pocId: me.id, startedAt: new Date(), note },
    });
    await prisma.requestEvent.create({
      data: { requestId: id, userId: me.id, type: "STARTED", message: "Started working" },
    });
    if (r.status === "ASSIGNED") {
      await prisma.request.update({
        where: { id },
        data: {
          status: "IN_PROGRESS",
          events: {
            create: {
              userId: me.id,
              type: "STATUS",
              message: "Status changed to In Progress",
            },
          },
        },
      });
      await notify(
        [r.requestedById],
        "STATUS",
        "Request is being worked",
        `${fmtRequestNumber(r.number)} is now In Progress`,
        id
      );
    }
    return NextResponse.json({ ok: true, running: true });
  }

  if (action === "stop") {
    const running = await prisma.workLog.findFirst({
      where: { pocId: me.id, requestId: id, endedAt: null },
    });
    if (!running) return NextResponse.json({ error: "not_working" }, { status: 400 });
    const now = Date.now();
    const started = running.startedAt.getTime();
    const minutes = Math.max(1, Math.min(Math.floor((now - started) / 60000), RUNNING_MAX_MS / 60000));
    await prisma.workLog.update({
      where: { id: running.id },
      data: { endedAt: new Date(), minutes, note: note ?? running.note },
    });
    await prisma.request.update({
      where: { id },
      data: { totalWorkMinutes: { increment: minutes } },
    });
    await prisma.requestEvent.create({
      data: {
        requestId: id,
        userId: me.id,
        type: "STOPPED",
        message: `Worked ${minutes} min${note ? ` — ${note}` : ""}`,
        minutesWorked: minutes,
      },
    });
    return NextResponse.json({ ok: true, running: false, minutes });
  }

  if (action === "log") {
    const minutes = Math.max(1, Math.min(Number(body.minutes ?? 0), 24 * 60));
    if (!Number.isFinite(minutes)) return NextResponse.json({ error: "bad_minutes" }, { status: 400 });
    await prisma.workLog.create({
      data: {
        requestId: id,
        pocId: me.id,
        startedAt: new Date(Date.now() - minutes * 60000),
        endedAt: new Date(),
        minutes,
        note,
      },
    });
    await prisma.request.update({
      where: { id },
      data: { totalWorkMinutes: { increment: minutes } },
    });
    await prisma.requestEvent.create({
      data: {
        requestId: id,
        userId: me.id,
        type: "STOPPED",
        message: `Logged ${minutes} min${note ? ` — ${note}` : ""}`,
        minutesWorked: minutes,
      },
    });
    return NextResponse.json({ ok: true, running: false, minutes });
  }

  return NextResponse.json({ error: "bad_action" }, { status: 400 });
}
