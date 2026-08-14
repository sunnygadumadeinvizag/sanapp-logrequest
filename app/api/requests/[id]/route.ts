import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser, serializeRequest, notify, fmtRequestNumber } from "@/lib/requests";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

async function loadVisible(id: string, meId: string, role: string) {
  const r = await prisma.request.findUnique({
    where: { id },
    include: {
      category: true,
      subCategory: true,
      requestedBy: { select: { id: true, username: true, name: true } },
      requestedFor: { select: { id: true, username: true, name: true } },
      assignedPoc: { select: { id: true, username: true, name: true } },
      events: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, username: true, name: true } } },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { id: true, username: true, name: true } },
          reads: { where: { userId: meId }, select: { id: true } },
        },
      },
      attachments: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, mime: true, size: true, createdAt: true },
      },
      workLogs: {
        orderBy: { startedAt: "desc" },
        include: { poc: { select: { id: true, username: true, name: true } } },
      },
    },
  });
  if (!r) return null;
  const canView =
    role === "ADMIN" ||
    r.requestedById === meId ||
    r.requestedForId === meId ||
    r.assignedPocId === meId;
  if (!canView) return null;
  return r;
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const r = await loadVisible(id, me.id, me.role);
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({
    request: serializeRequest(r),
    events: r.events.map((e: any) => ({
      id: e.id,
      type: e.type,
      message: e.message,
      minutesWorked: e.minutesWorked,
      toPoc: e.toPocId
        ? r.assignedPoc
        : null,
      user: { id: e.user.id, username: e.user.username, name: e.user.name },
      createdAt: e.createdAt.toISOString(),
    })),
    comments: r.comments.map((c: any) => ({
      id: c.id,
      body: c.body,
      readByMe: c.reads.length > 0,
      user: { id: c.user.id, username: c.user.username, name: c.user.name },
      createdAt: c.createdAt.toISOString(),
    })),
    attachments: r.attachments.map((a: any) => ({
      id: a.id,
      name: a.name,
      mime: a.mime,
      size: a.size,
      createdAt: a.createdAt.toISOString(),
    })),
    workLogs: r.workLogs.map((w: any) => ({
      id: w.id,
      minutes: w.minutes,
      note: w.note,
      running: !w.endedAt,
      startedAt: w.startedAt.toISOString(),
      endedAt: w.endedAt ? w.endedAt.toISOString() : null,
      poc: { id: w.poc.id, username: w.poc.username, name: w.poc.name },
    })),
  });
}

// PATCH /api/requests/[id] — status/priority changes, reassignment (with reason).
export async function PATCH(request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const r = await prisma.request.findUnique({ where: { id } });
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const isPoc = me.role === "POC" || me.role === "ADMIN";
  const isRequester = r.requestedById === me.id || r.requestedForId === me.id;
  const isAssignee = r.assignedPocId === me.id;

  const data: any = {};
  const eventRows: any[] = [];
  const notifyRows: { userId: string; kind: string; title: string; body: string }[] = [];

  const VALID_STATUS = ["OPEN", "ASSIGNED", "IN_PROGRESS", "PENDING", "RESOLVED", "CLOSED", "CANCELLED"];
  const VALID_PRIORITY = ["LOW", "MEDIUM", "HIGH", "URGENT"];

  if (body.priority && VALID_PRIORITY.includes(body.priority) && r.priority !== body.priority) {
    data.priority = body.priority;
    eventRows.push({
      userId: me.id,
      type: "STATUS",
      message: `Priority changed to ${body.priority}`,
    });
  }

  if (body.status && VALID_STATUS.includes(body.status) && r.status !== body.status) {
    const next = body.status;
    if (next === "CLOSED") {
      if (!isPoc && !isAssignee) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      data.status = "CLOSED";
      data.closedAt = new Date();
      eventRows.push({ userId: me.id, type: "CLOSED", message: "Request closed" });
      notifyRows.push({
        userId: r.requestedById,
        kind: "CLOSED",
        title: "Request closed",
        body: `${fmtRequestNumber(r.number)} — ${r.title}`,
      });
    } else if (next === "CANCELLED") {
      if (!isRequester && !isPoc && !isAssignee) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      data.status = "CANCELLED";
      data.closedAt = new Date();
      eventRows.push({ userId: me.id, type: "CANCELLED", message: "Request cancelled" });
    } else if (next === "REOPENED" && r.status === "CLOSED") {
      if (!isRequester && !isPoc) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      data.status = "OPEN";
      data.closedAt = null;
      eventRows.push({ userId: me.id, type: "REOPENED", message: "Request reopened" });
    } else if (next === "IN_PROGRESS" || next === "PENDING" || next === "RESOLVED" || next === "ASSIGNED") {
      if (!isPoc && !isAssignee) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      data.status = next;
      if (next === "RESOLVED") {
        data.closedAt = null;
      }
      const label: Record<string, string> = {
        IN_PROGRESS: "In Progress",
        PENDING: "Pending info",
        RESOLVED: "Resolved",
        ASSIGNED: "Assigned",
      };
      eventRows.push({ userId: me.id, type: "STATUS", message: `Status changed to ${label[next]}` });
      notifyRows.push({
        userId: r.requestedById,
        kind: "STATUS",
        title: "Request status updated",
        body: `${fmtRequestNumber(r.number)} — ${label[next]}`,
      });
    } else {
      return NextResponse.json({ error: "invalid_status_transition" }, { status: 400 });
    }
  }

  // Reassign / move to another POC (with reason).
  if (body.moveToPocId && isPoc) {
    const target = await prisma.appUser.findUnique({ where: { id: body.moveToPocId } });
    if (!target) return NextResponse.json({ error: "target_poc_not_found" }, { status: 404 });
    if (target.role !== "POC" && target.role !== "ADMIN") {
      return NextResponse.json({ error: "target_not_poc" }, { status: 400 });
    }
    const reason = String(body.moveReason ?? "").trim() || "Workload transfer";
    data.assignedPocId = target.id;
    data.status = r.status === "CLOSED" ? r.status : "ASSIGNED";
    eventRows.push({
      userId: me.id,
      type: "MOVED",
      message: `Moved to ${target.name} — ${reason}`,
      toPocId: target.id,
    });
    notifyRows.push({
      userId: target.id,
      kind: "MOVED",
      title: "Request moved to you",
      body: `${fmtRequestNumber(r.number)} — ${r.title}. Reason: ${reason}`,
    });
  }

  // Re-open from closed (requester asks for more work).
  if (body.reopen === true && r.status === "CLOSED" && isRequester) {
    data.status = "OPEN";
    data.closedAt = null;
    eventRows.push({ userId: me.id, type: "REOPENED", message: "Request reopened by requester" });
  }

  if (Object.keys(data).length === 0 && eventRows.length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const updated = await prisma.request.update({
    where: { id },
    data: {
      ...data,
      events: { create: eventRows },
    },
    include: {
      category: { select: { id: true, name: true } },
      subCategory: { select: { id: true, name: true } },
      requestedBy: { select: { id: true, username: true, name: true } },
      requestedFor: { select: { id: true, username: true, name: true } },
      assignedPoc: { select: { id: true, username: true, name: true } },
    },
  });

  for (const n of notifyRows) {
    await notify([n.userId], n.kind, n.title, n.body, id);
  }

  return NextResponse.json({ request: serializeRequest(updated) });
}
