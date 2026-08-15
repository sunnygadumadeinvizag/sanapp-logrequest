import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify, serializeRequest } from "@/lib/requests";

export const dynamic = "force-dynamic";

const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? "";
const ISSUE_CATEGORY_ID = "seed-intranet-issue";

function guard(request: NextRequest): NextResponse | null {
  if (!INTERNAL_KEY || request.headers.get("x-internal-key") !== INTERNAL_KEY) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}

type RouteCtx = { params: Promise<{ id: string }> };

async function loadIssue(id: string) {
  return prisma.request.findFirst({
    where: { id, categoryId: ISSUE_CATEGORY_ID },
    include: {
      category: { select: { id: true, name: true } },
      subCategory: { select: { id: true, name: true } },
      requestedBy: { select: { id: true, username: true, name: true } },
      requestedFor: { select: { id: true, username: true, name: true } },
      assignedPoc: { select: { id: true, username: true, name: true } },
    },
  });
}

// GET /api/internal/issues/[id] — single intranet issue.
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const denied = guard(_req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const issue = await loadIssue(id);
  if (!issue) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ issue: serializeRequest(issue) });
}

// PATCH /api/internal/issues/[id] — super admin updates status + resolution.
// Body: { status, resolution }
export async function PATCH(request: NextRequest, ctx: RouteCtx) {
  const denied = guard(request);
  if (denied) return denied;
  const { id } = await ctx.params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const issue = await loadIssue(id);
  if (!issue) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Map Main's issue statuses to Log Request statuses.
  const map: Record<string, string> = {
    OPEN: "OPEN",
    IN_PROGRESS: "IN_PROGRESS",
    RESOLVED: "RESOLVED",
    CLOSED: "CLOSED",
    CANCELLED: "CANCELLED",
  };
  const status = map[String(body.status ?? "")] ?? null;
  const resolution = typeof body.resolution === "string" ? body.resolution.trim() || null : null;

  if (!status && resolution === null) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const data: any = {};
  if (status) {
    data.status = status;
    if (status === "RESOLVED" || status === "CLOSED") data.resolvedAt = new Date();
    if (status === "OPEN" || status === "IN_PROGRESS") data.resolvedAt = null;
  }
  if (resolution !== null) data.resolution = resolution;

  const updated = await prisma.request.update({
    where: { id },
    data,
    include: {
      category: { select: { id: true, name: true } },
      subCategory: { select: { id: true, name: true } },
      requestedBy: { select: { id: true, username: true, name: true } },
      requestedFor: { select: { id: true, username: true, name: true } },
      assignedPoc: { select: { id: true, username: true, name: true } },
    },
  });

  const events: any[] = [];
  if (status && status !== issue.status) {
    events.push({
      userId: issue.requestedForId,
      type: "STATUS",
      message: `Status changed to ${status}${resolution ? " — " + resolution : ""}`,
    });
  }
  if (events.length > 0) {
    await prisma.requestEvent.createMany({ data: events.map((e) => ({ ...e, requestId: id })) });
  }
  if (status === "RESOLVED" || status === "CLOSED") {
    await notify(
      [issue.requestedForId],
      "RESOLVED",
      "Your intranet issue was resolved",
      `${issue.title}${resolution ? " — " + resolution : ""}`,
      id
    );
  }

  return NextResponse.json({ issue: serializeRequest(updated) });
}
