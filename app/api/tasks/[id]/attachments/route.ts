import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";
import { canViewTask, MAX_PDF_BYTES, logTaskEvent } from "@/lib/tasks";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * POST /api/tasks/[id]/attachments — multipart form with `file` + `logId`.
 * Adds/replaces the mandatory PDF on an existing task log (≤1 MB).
 */
export async function POST(request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const task = await prisma.recurringTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }
  const file = form.get("file");
  const logId = String(form.get("logId") || "");
  if (!logId) return NextResponse.json({ error: "missing_log" }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }
  const mime = file.type || "application/pdf";
  if (mime !== "application/pdf" && !(file.name || "").toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 400 });
  }

  const log = await prisma.recurringTaskLog.findFirst({
    where: { id: logId, taskId: id },
  });
  if (!log) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (log.userId !== me.id) {
    const can = await canViewTask(task, me);
    if (!can) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (me.role !== "ADMIN" && me.role !== "POC") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  } else {
    const can = await canViewTask(task, me);
    if (!can) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const nameRaw = (file.name || "work-proof.pdf").replace(/["\\]/g, "");
  const name = nameRaw.toLowerCase().endsWith(".pdf") ? nameRaw : `${nameRaw}.pdf`;

  // One PDF per log for simplicity — replace any existing.
  await prisma.taskLogAttachment.deleteMany({ where: { logId } });
  const att = await prisma.taskLogAttachment.create({
    data: {
      logId,
      name,
      mime: "application/pdf",
      size: buf.length,
      data: buf,
      uploadedById: me.id,
    },
    select: { id: true, name: true, mime: true, size: true, createdAt: true },
  });

  await logTaskEvent({
    taskId: id,
    logId,
    userId: me.id,
    periodKey: log.periodKey,
    type: "ATTACHMENT",
    message: `Uploaded PDF "${att.name}" (${Math.max(1, Math.round(att.size / 1024))} KB) for ${log.periodKey}`,
    minutes: log.minutes,
    status: log.status,
  });

  return NextResponse.json(
    { attachment: { id: att.id, name: att.name, mime: att.mime, size: att.size } },
    { status: 201 }
  );
}

/**
 * GET /api/tasks/[id]/attachments?logId= — list PDFs on a log (metadata only).
 */
export async function GET(request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const task = await prisma.recurringTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await canViewTask(task, me))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const logId = url.searchParams.get("logId");
  const attachments = await prisma.taskLogAttachment.findMany({
    where: { logId: logId ?? undefined, log: { taskId: id } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      logId: true,
      name: true,
      mime: true,
      size: true,
      createdAt: true,
      uploadedById: true,
    },
  });

  return NextResponse.json({
    attachments: attachments.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    })),
  });
}
