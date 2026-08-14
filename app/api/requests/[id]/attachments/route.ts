import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser, notify, fmtRequestNumber } from "@/lib/requests";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const MAX_BYTES = 1024 * 1024; // 1 MB
const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

// POST /api/requests/[id]/attachments — multipart/form-data with a "file"
// field. Images and PDFs up to 1 MB, stored in the database.
export async function POST(request: NextRequest, ctx: RouteCtx) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const r = await prisma.request.findUnique({ where: { id } });
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const canAttach =
    me.role === "ADMIN" ||
    me.role === "POC" ||
    r.requestedById === me.id ||
    r.requestedForId === me.id;
  if (!canAttach) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED[mime]) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const att = await prisma.requestAttachment.create({
    data: {
      requestId: id,
      name: file.name || `upload.${ALLOWED[mime]}`,
      mime,
      size: buf.length,
      data: buf,
    },
    select: { id: true, name: true, mime: true, size: true, createdAt: true },
  });

  await prisma.requestEvent.create({
    data: {
      requestId: id,
      userId: me.id,
      type: "STATUS",
      message: `Attached ${att.name}`,
    },
  });

  const others = [r.requestedById, r.requestedForId, r.assignedPocId].filter(
    (u): u is string => !!u && u !== me.id
  );
  await notify(
    others,
    "COMMENT",
    `Attachment added to ${fmtRequestNumber(r.number)}`,
    `${me.name} uploaded ${att.name}`,
    id
  );

  return NextResponse.json(
    {
      attachment: {
        id: att.id,
        name: att.name,
        mime: att.mime,
        size: att.size,
        createdAt: att.createdAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
