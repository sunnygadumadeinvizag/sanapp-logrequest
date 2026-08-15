import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify, serializeRequest, fmtRequestNumber } from "@/lib/requests";
import { listSsoUsers } from "@/lib/auth";

export const dynamic = "force-dynamic";

const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? "";

/**
 * Internal API used ONLY by the Main portal (server-to-server, same VM).
 * Main's "Technical Issues" page raises an intranet issue here — it becomes a
 * normal Log Request under the "Intranet Issue" category, so the category's
 * POC works on it with the full workflow (queue, comments, work logs, close).
 *
 * Guards every handler with a shared key header so this endpoint is not
 * callable from the public internet / other apps.
 */
function guard(request: NextRequest): NextResponse | null {
  if (!INTERNAL_KEY || request.headers.get("x-internal-key") !== INTERNAL_KEY) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}

/** Find or provision a local AppUser from the central SSO registry. */
async function ensureUser(username: string, name: string): Promise<{ id: string; name: string; username: string } | null> {
  const existing = await prisma.appUser.findUnique({ where: { username } });
  if (existing) return { id: existing.id, name: existing.name, username: existing.username };

  // Not signed into this app yet — provision from the central SSO registry so
  // issues can be raised against any user the intranet has.
  const sso = (await listSsoUsers()).find((u) => u.username === username);
  if (!sso) return null;
  const created = await prisma.appUser.create({
    data: {
      ssoUserId: sso.id,
      username: sso.username,
      name: sso.name,
      email: sso.email,
      primaryRole: sso.primaryRole,
      role: "USER",
    },
  });
  return { id: created.id, name: created.name, username: created.username };
}

const ISSUE_CATEGORY_ID = "seed-intranet-issue";

/**
 * POST /api/internal/issues — create an intranet issue.
 * Body: { username, name, appName, title, description, priority }
 */
export async function POST(request: NextRequest) {
  const denied = guard(request);
  if (denied) return denied;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const username = String(body.username ?? "").trim();
  const name = String(body.name ?? "").trim();
  const appName = String(body.appName ?? "").trim().slice(0, 120) || null;
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const priority = ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(body.priority)
    ? body.priority
    : "MEDIUM";

  if (!username || !title || !description) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const requester = await ensureUser(username, name);
  if (!requester) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const category = await prisma.category.findUnique({ where: { id: ISSUE_CATEGORY_ID } });
  if (!category || !category.active) {
    return NextResponse.json({ error: "category_not_found" }, { status: 404 });
  }

  // Sequential request number (unique) — retry once on a collision.
  let created: any = null;
  for (let attempt = 0; attempt < 2 && !created; attempt++) {
    const number = (await prisma.request.count()) + 1;
    try {
      created = await prisma.request.create({
        data: {
          number,
          categoryId: category.id,
          title,
          description,
          priority,
          appName,
          requestedById: requester.id,
          requestedForId: requester.id,
          status: "OPEN",
          events: {
            create: [
              {
                userId: requester.id,
                type: "CREATED",
                message: `Request raised${appName ? ` against ${appName}` : ""} (intranet issue)`,
              },
            ],
          },
        },
        include: {
          category: { select: { id: true, name: true } },
          subCategory: { select: { id: true, name: true } },
          requestedBy: { select: { id: true, username: true, name: true } },
          requestedFor: { select: { id: true, username: true, name: true } },
          assignedPoc: { select: { id: true, username: true, name: true } },
        },
      });
    } catch (e: any) {
      if (e?.code === "P2002" && attempt === 0) continue;
      throw e;
    }
  }

  // First-come-first-served auto-assignment: pick the active POC of the
  // category with the lowest queue order and fewest open tasks.
  const pocPick = await prisma.pocAssignment.findMany({
    where: { active: true, subCategoryId: null, categoryId: category.id },
    include: { user: true },
  });
  if (pocPick.length > 0) {
    const openCounts = await Promise.all(
      pocPick.map((a) =>
        prisma.request.count({
          where: { assignedPocId: a.userId, status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "PENDING"] } },
        })
      )
    );
    const best = pocPick
      .map((a, i) => ({ a, open: openCounts[i] }))
      .sort((x, y) => x.open - y.open || x.a.queueOrder - y.a.queueOrder)[0].a;

    created = await prisma.request.update({
      where: { id: created.id },
      data: {
        assignedPocId: best.userId,
        status: "ASSIGNED",
        events: {
          create: [
            {
              userId: requester.id,
              type: "ASSIGNED",
              message: `Assigned to ${best.user.name} (first come, first served)`,
              toPocId: best.userId,
            },
          ],
        },
      },
      include: {
        category: { select: { id: true, name: true } },
        subCategory: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, username: true, name: true } },
        requestedFor: { select: { id: true, username: true, name: true } },
        assignedPoc: { select: { id: true, username: true, name: true } },
      },
    });
    await notify(
      [best.userId],
      "ASSIGNED",
      "New intranet issue assigned",
      `${fmtRequestNumber(created.number)} — ${created.title}`,
      created.id
    );
  }

  await notify(
    [requester.id],
    "REQUEST_RAISED",
    "Issue logged",
    `${fmtRequestNumber(created.number)} — ${created.title} (${category.name})`,
    created.id
  );

  return NextResponse.json({ request: serializeRequest(created) }, { status: 201 });
}

/**
 * GET /api/internal/issues — list intranet issues.
 * Query: username (owner), scope=mine|all, status, appName, q, page, limit
 */
export async function GET(request: NextRequest) {
  const denied = guard(request);
  if (denied) return denied;

  const sp = request.nextUrl.searchParams;
  const username = (sp.get("username") ?? "").trim();
  const scope = sp.get("scope") ?? "mine";
  const status = (sp.get("status") ?? "").trim();
  const appName = (sp.get("appName") ?? "").trim();
  const q = (sp.get("q") ?? "").trim();
  const page = Math.max(1, Number(sp.get("page") ?? "1"));
  const limit = Math.min(50, Math.max(5, Number(sp.get("limit") ?? "10")));

  const where: any = { categoryId: ISSUE_CATEGORY_ID };
  if (scope === "mine") {
    if (!username) return NextResponse.json({ error: "username_required" }, { status: 400 });
    where.requestedBy = { username };
  }
  if (status) {
    // Map Main's issue statuses (OPEN/IN_PROGRESS/RESOLVED/CLOSED) to the
    // richer Log Request statuses.
    const map: Record<string, string[]> = {
      OPEN: ["OPEN", "ASSIGNED"],
      IN_PROGRESS: ["IN_PROGRESS", "PENDING"],
      RESOLVED: ["RESOLVED"],
      CLOSED: ["CLOSED"],
      CANCELLED: ["CANCELLED"],
    };
    const list = map[status] ?? [status];
    where.status = { in: list };
  }
  if (appName) where.appName = { contains: appName, mode: "insensitive" };
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { appName: { contains: q, mode: "insensitive" } },
      {
        requestedBy: {
          OR: [
            { username: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        },
      },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.request.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        category: { select: { id: true, name: true } },
        subCategory: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, username: true, name: true } },
        requestedFor: { select: { id: true, username: true, name: true } },
        assignedPoc: { select: { id: true, username: true, name: true } },
      },
    }),
    prisma.request.count({ where }),
  ]);

  return NextResponse.json({ requests: rows.map(serializeRequest), total, page, limit });
}
