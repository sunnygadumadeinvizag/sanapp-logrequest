import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";
import {
  periodKeyFor,
  canLogOnTask,
  canViewTask,
  istDateFromString,
  istDateKey,
  logTaskEvent,
  MAX_PDF_BYTES,
  ALLOWED_TASK_PDF,
  type TaskSchedule,
} from "@/lib/tasks";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * POST /api/tasks/[id]/log — record time / complete / skip for a period.
 *
 * Accepts JSON or multipart/form-data (when a PDF is attached):
 *   status: "COMPLETED" | "SKIPPED" | "PENDING"
 *   minutes?: number
 *   note?: string
 *   date?: string      // YYYY-MM-DD work day (past dates allowed)
 *   periodKey?: string
 *   file?: File        // required PDF ≤1 MB when status=COMPLETED and the
 *                      // log has no existing attachment
 *
 * Each participant has their own row per period. Completing a day closes it
 * and requires a PDF proof-of-work unless one is already on the log.
 */
export async function POST(request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const task = await prisma.recurringTask.findUnique({
    where: { id },
    include: { assignees: { select: { userId: true } } },
  });
  if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await canLogOnTask(task, me))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  let file: File | null = null;
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "invalid_form" }, { status: 400 });
    }
    for (const [k, v] of form.entries()) {
      if (k === "file" && v instanceof File) file = v;
      else body[k] = typeof v === "string" ? v : String(v);
    }
  } else {
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    if (body.file instanceof File) file = body.file as File;
  }

  const rawStatus = String(body.status);
  const status: "COMPLETED" | "SKIPPED" | "PENDING" =
    rawStatus === "COMPLETED" || rawStatus === "SKIPPED" || rawStatus === "PENDING"
      ? rawStatus
      : "COMPLETED";
  const minutes = Math.max(0, Math.min(Number(body.minutes ?? 0) || 0, 24 * 60));
  const note = typeof body.note === "string" ? body.note.trim() || null : null;

  const schedule: TaskSchedule = {
    recurrence: task.recurrence,
    weekday: task.weekday,
    dayOfMonth: task.dayOfMonth,
    monthOfYear: task.monthOfYear,
    anchorMonth: task.anchorMonth,
    specificDate: task.specificDate,
  };

  let targetDate: Date;
  if (typeof body.date === "string" && body.date) {
    const parsed = istDateFromString(body.date);
    if (!parsed) return NextResponse.json({ error: "bad_date" }, { status: 400 });
    targetDate = parsed;
  } else {
    targetDate = istDateFromString(istDateKey()) ?? new Date();
  }

  let key: string;
  if (typeof body.periodKey === "string" && body.periodKey) {
    key = body.periodKey;
  } else if (task.recurrence === "ONE_TIME") {
    key = periodKeyFor(schedule, task.specificDate ?? targetDate);
  } else {
    key = periodKeyFor(schedule, targetDate);
  }

  const existing = await prisma.recurringTaskLog.findUnique({
    where: { taskId_periodKey_userId: { taskId: task.id, periodKey: key, userId: me.id } },
    include: { attachments: { select: { id: true } } },
  });

  // Validate any uploaded PDF up-front.
  if (file) {
    if (file.size === 0) {
      return NextResponse.json({ error: "no_file" }, { status: 400 });
    }
    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json({ error: "file_too_large" }, { status: 400 });
    }
    const mime = file.type || ALLOWED_TASK_PDF;
    if (mime !== ALLOWED_TASK_PDF && !(file.name || "").toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "unsupported_type" }, { status: 400 });
    }
  }

  // Closing (COMPLETED) the day requires a PDF unless one is already stored.
  if (status === "COMPLETED") {
    const hasPdf = (existing?.attachments?.length ?? 0) > 0;
    if (!hasPdf && !file) {
      return NextResponse.json({ error: "pdf_required" }, { status: 400 });
    }
  }

  const finishing = status === "COMPLETED" || status === "SKIPPED";
  const wasComplete = existing?.status === "COMPLETED";
  const prevMinutes = existing?.minutes ?? null;
  const prevNote = existing?.note ?? null;

  const log = await prisma.recurringTaskLog.upsert({
    where: {
      taskId_periodKey_userId: { taskId: task.id, periodKey: key, userId: me.id },
    },
    update: {
      status,
      minutes: status === "COMPLETED" ? minutes : 0,
      note,
      logDate: finishing ? targetDate : null,
      loggedAt: finishing ? new Date() : null,
    },
    create: {
      taskId: task.id,
      userId: me.id,
      periodKey: key,
      status,
      minutes: status === "COMPLETED" ? minutes : 0,
      note,
      logDate: finishing ? targetDate : null,
      loggedAt: finishing ? new Date() : null,
    },
    include: {
      user: { select: { id: true, username: true, name: true } },
      attachments: { select: { id: true, name: true, mime: true, size: true } },
    },
  });

  // Mandatory PDF on close: store it when provided.
  if (file && status === "COMPLETED") {
    const mime = file.type === ALLOWED_TASK_PDF ? ALLOWED_TASK_PDF : ALLOWED_TASK_PDF;
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length === 0) {
      return NextResponse.json({ error: "no_file" }, { status: 400 });
    }
    if (buf.length > MAX_PDF_BYTES) {
      return NextResponse.json({ error: "file_too_large" }, { status: 400 });
    }
    const name = (file.name || "work-proof.pdf").replace(/["\\]/g, "");
    const att = await prisma.taskLogAttachment.create({
      data: {
        logId: log.id,
        name: name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`,
        mime,
        size: buf.length,
        data: buf,
        uploadedById: me.id,
      },
      select: { id: true, name: true, mime: true, size: true, createdAt: true },
    });
    await logTaskEvent({
      taskId: task.id,
      logId: log.id,
      userId: me.id,
      periodKey: key,
      type: "ATTACHMENT",
      message: `Uploaded PDF "${att.name}" (${Math.max(1, Math.round(att.size / 1024))} KB)`,
      minutes,
      status,
    });
  }

  // Audit who/what/when.
  const dayLabel = istDateKey(targetDate);
  if (!existing) {
    await logTaskEvent({
      taskId: task.id,
      logId: log.id,
      userId: me.id,
      periodKey: key,
      type: "CREATED",
      message:
        status === "COMPLETED"
          ? `Closed ${dayLabel}: logged ${minutes} min${note ? ` — ${note}` : ""}`
          : `Logged ${status} for ${dayLabel}${note ? ` — ${note}` : ""}`,
      minutes: status === "COMPLETED" ? minutes : null,
      status,
    });
  } else if (
    existing.status !== status ||
    prevMinutes !== minutes ||
    (prevNote ?? null) !== (note ?? null)
  ) {
    const changes: string[] = [];
    if (existing.status !== status) changes.push(`status ${existing.status} → ${status}`);
    if (existing.status === "COMPLETED" || status === "COMPLETED") {
      if (prevMinutes !== minutes) changes.push(`hours ${prevMinutes ?? 0} → ${minutes} min`);
    }
    if ((prevNote ?? null) !== (note ?? null)) changes.push("comment updated");
    await logTaskEvent({
      taskId: task.id,
      logId: log.id,
      userId: me.id,
      periodKey: key,
      type: wasComplete || existing.status === "COMPLETED" ? "UPDATED" : "UPDATED",
      message: `Updated ${dayLabel}${changes.length ? `: ${changes.join(", ")}` : ""}${
        note ? ` — ${note}` : ""
      }`,
      minutes: status === "COMPLETED" ? minutes : null,
      status,
    });
  }

  return NextResponse.json({ log });
}

/**
 * DELETE /api/tasks/[id]/log?date=YYYY-MM-DD&periodKey=&userId=
 * Clear a day/period log back to PENDING (removes its PDF).
 */
export async function DELETE(request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const task = await prisma.recurringTask.findUnique({
    where: { id },
    include: { assignees: { select: { userId: true } } },
  });
  if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const url = new URL(request.url);
  const targetUserId = url.searchParams.get("userId") || me.id;
  if (targetUserId !== me.id && !(await canViewTask(task, me))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (targetUserId === me.id && !(await canLogOnTask(task, me))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const schedule: TaskSchedule = {
    recurrence: task.recurrence,
    weekday: task.weekday,
    dayOfMonth: task.dayOfMonth,
    monthOfYear: task.monthOfYear,
    anchorMonth: task.anchorMonth,
    specificDate: task.specificDate,
  };

  let key = url.searchParams.get("periodKey") || "";
  const dateParam = url.searchParams.get("date") || "";
  if (!key && dateParam) {
    const d = istDateFromString(dateParam);
    if (!d) return NextResponse.json({ error: "bad_date" }, { status: 400 });
    key = task.recurrence === "ONE_TIME"
      ? periodKeyFor(schedule, task.specificDate ?? d)
      : periodKeyFor(schedule, d);
  }
  if (!key) return NextResponse.json({ error: "missing_period" }, { status: 400 });

  const existing = await prisma.recurringTaskLog.findUnique({
    where: { taskId_periodKey_userId: { taskId: id, periodKey: key, userId: targetUserId } },
    include: { attachments: { select: { name: true } } },
  });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.taskLogAttachment.deleteMany({ where: { logId: existing.id } });
  const log = await prisma.recurringTaskLog.update({
    where: { id: existing.id },
    data: { status: "PENDING", minutes: 0, note: null, logDate: null, loggedAt: null },
    include: {
      user: { select: { id: true, username: true, name: true } },
      attachments: { select: { id: true, name: true, mime: true, size: true } },
    },
  });

  await logTaskEvent({
    taskId: id,
    logId: existing.id,
    userId: me.id,
    periodKey: key,
    type: "CLEARED",
    message: `Cleared log for ${key}${
      existing.status === "COMPLETED"
        ? ` (was ${existing.minutes} min${existing.note ? ` — ${existing.note}` : ""})`
        : ""
    }${existing.attachments.length ? `; removed ${existing.attachments.length} PDF(s)` : ""}`,
  });

  return NextResponse.json({ log });
}

/**
 * GET /api/tasks/[id]/log — all logs for a task (participants / POC / admin).
 */
export async function GET(_request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const task = await prisma.recurringTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await canViewTask(task, me))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const logs = await prisma.recurringTaskLog.findMany({
    where: { taskId: id },
    orderBy: [{ periodKey: "desc" }, { loggedAt: "desc" }],
    include: {
      user: { select: { id: true, username: true, name: true } },
      attachments: { select: { id: true, name: true, mime: true, size: true } },
    },
  });

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      userId: l.userId,
      user: l.user,
      periodKey: l.periodKey,
      status: l.status,
      minutes: l.minutes,
      note: l.note,
      logDate: l.logDate?.toISOString() ?? null,
      loggedAt: l.loggedAt?.toISOString() ?? null,
      attachments: l.attachments,
    })),
  });
}
