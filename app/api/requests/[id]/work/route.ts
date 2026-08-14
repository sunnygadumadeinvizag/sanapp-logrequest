import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser, notify, fmtRequestNumber } from "@/lib/requests";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const RUNNING_MAX_MS = 24 * 60 * 60 * 1000; // a work session cannot exceed 24h

type WorkEntry = { from?: string; to?: string; location?: string; inCampus?: boolean; note?: string };

function minutesBetween(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 60000));
}

// POST /api/requests/[id]/work
//   { action: "start", note?, location?, inCampus? }
//   { action: "stop", note?, location?, inCampus? }
//   { action: "log", note?, entries: [{ from, to, location, inCampus, note? }] }
//     — multiple from/to ranges, each with its own location + in/out campus.
// The assignee and any added co-workers can log hours.
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
  const worker = await prisma.requestWorker.findUnique({
    where: { requestId_userId: { requestId: id, userId: me.id } },
  });
  const isWorker = !!worker;
  if (!isPoc || (!isAssignee && !isWorker && me.role !== "ADMIN")) {
    return NextResponse.json({ error: "only_assignee_or_worker_can_work" }, { status: 403 });
  }

  const location = typeof body.location === "string" ? body.location.trim() || null : null;
  const inCampus = typeof body.inCampus === "boolean" ? body.inCampus : true;

  if (action === "start") {
    const running = await prisma.workLog.findFirst({
      where: { pocId: me.id, endedAt: null },
    });
    if (running) {
      return NextResponse.json({ error: "already_working" }, { status: 400 });
    }
    await prisma.workLog.create({
      data: { requestId: id, pocId: me.id, startedAt: new Date(), note, location, inCampus },
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
      data: {
        endedAt: new Date(),
        minutes,
        note: note ?? running.note,
        location: location ?? running.location,
        inCampus: running.inCampus,
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
        message: `${me.name} worked ${minutes} min${note ? ` — ${note}` : ""}`,
        minutesWorked: minutes,
      },
    });
    return NextResponse.json({ ok: true, running: false, minutes });
  }

  if (action === "log") {
    // Multiple from/to ranges, each with its own location + in/out campus.
    const entries: WorkEntry[] = Array.isArray(body.entries) ? body.entries : [];
    if (entries.length === 0) {
      // Backwards-compatible single minutes entry.
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
          location,
          inCampus,
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
          message: `${me.name} logged ${minutes} min${note ? ` — ${note}` : ""}`,
          minutesWorked: minutes,
        },
      });
      return NextResponse.json({ ok: true, running: false, minutes, count: 1 });
    }

    const rows: { startedAt: Date; endedAt: Date; minutes: number; note: string | null; location: string | null; inCampus: boolean }[] = [];
    let total = 0;
    for (const e of entries) {
      const from = e.from ? new Date(e.from) : null;
      const to = e.to ? new Date(e.to) : null;
      if (!from || isNaN(from.getTime()) || !to || isNaN(to.getTime())) {
        return NextResponse.json({ error: "bad_time_range" }, { status: 400 });
      }
      if (to.getTime() <= from.getTime()) {
        return NextResponse.json({ error: "to_after_from" }, { status: 400 });
      }
      const mins = minutesBetween(from, to);
      if (mins > 24 * 60) return NextResponse.json({ error: "range_too_long" }, { status: 400 });
      total += mins;
      rows.push({
        startedAt: from,
        endedAt: to,
        minutes: mins,
        note: String(e.note ?? "").trim() || note,
        location: typeof e.location === "string" && e.location.trim() ? e.location.trim() : null,
        inCampus: typeof e.inCampus === "boolean" ? e.inCampus : true,
      });
    }
    if (total <= 0) return NextResponse.json({ error: "bad_time_range" }, { status: 400 });

    await prisma.workLog.createMany({ data: rows.map((row) => ({ requestId: id, pocId: me.id, ...row })) });
    await prisma.request.update({
      where: { id },
      data: { totalWorkMinutes: { increment: total } },
    });
    await prisma.requestEvent.create({
      data: {
        requestId: id,
        userId: me.id,
        type: "STOPPED",
        message: `${me.name} logged ${total} min across ${rows.length} session${rows.length > 1 ? "s" : ""}`,
        minutesWorked: total,
      },
    });
    return NextResponse.json({ ok: true, running: false, minutes: total, count: rows.length });
  }

  return NextResponse.json({ error: "bad_action" }, { status: 400 });
}
