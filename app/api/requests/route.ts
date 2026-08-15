import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser, serializeRequest, notify, fmtRequestNumber } from "@/lib/requests";
import { listSsoUsers } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/requests?scope=mine|assigned|queue|all&status=&q=&categoryId=&page=&limit=
export async function GET(request: NextRequest) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const scope = sp.get("scope") ?? "mine";
  const status = sp.get("status") ?? "";
  const q = (sp.get("q") ?? "").trim();
  const categoryId = sp.get("categoryId") ?? "";
  const page = Math.max(1, Number(sp.get("page") ?? "1"));
  const limit = Math.min(50, Math.max(5, Number(sp.get("limit") ?? "10")));

  const where: any = {};

  if (scope === "mine") {
    where.requestedById = me.id;
  } else if (scope === "assigned") {
    where.assignedPocId = me.id;
    where.status = { notIn: ["CLOSED", "CANCELLED"] };
  } else if (scope === "queue") {
    // Requests waiting in the categories this user serves as POC.
    const assignments = await prisma.pocAssignment.findMany({
      where: { userId: me.id, active: true },
      select: { categoryId: true, subCategoryId: true },
    });
    if (assignments.length === 0) {
      return NextResponse.json({ requests: [], total: 0, page, limit });
    }
    const servedSubs = assignments.filter((a) => a.subCategoryId).map((a) => a.subCategoryId!);
    const servedCats = assignments
      .filter((a) => !a.subCategoryId)
      .map((a) => a.categoryId);
    where.status = { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "PENDING"] };
    where.OR = [
      ...(servedSubs.length ? [{ subCategoryId: { in: servedSubs } }] : []),
      ...(servedCats.length ? [{ categoryId: { in: servedCats }, subCategoryId: null }] : []),
    ];
  } else if (scope === "all") {
    // Admins only.
    if (me.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  } else {
    return NextResponse.json({ error: "bad_scope" }, { status: 400 });
  }

  if (status) where.status = status;
  if (categoryId) where.categoryId = categoryId;
  if (q) {
    where.OR = [
      ...(where.OR ?? []),
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { number: Number.isInteger(Number(q)) ? Number(q) : -1 },
      { requestedBy: { name: { contains: q, mode: "insensitive" } } },
      { requestedBy: { username: { contains: q, mode: "insensitive" } } },
    ];
  }

  // Assigned scope is the assignee's working queue — serve FIFO (oldest first)
  // so the first request raised against a user is handled first.
  const orderBy = scope === "assigned" ? [{ createdAt: "asc" as const }] : [{ createdAt: "desc" as const }];
  const [rows, total] = await Promise.all([
    prisma.request.findMany({
      where,
      orderBy,
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

  return NextResponse.json({
    requests: rows.map(serializeRequest),
    total,
    page,
    limit,
  });
}

// POST /api/requests — create a request (self or on-behalf for POCs).
export async function POST(request: NextRequest) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const categoryId = String(body.categoryId ?? "");
  const subCategoryId = body.subCategoryId ? String(body.subCategoryId) : null;
  const location = typeof body.location === "string" ? body.location.trim() || null : null;
  const contactTime = typeof body.contactTime === "string" ? body.contactTime.trim() || null : null;
  const contactPhone = typeof body.contactPhone === "string" ? body.contactPhone.trim() || null : null;
  const priority = ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(body.priority)
    ? body.priority
    : "MEDIUM";
  // Direct-assign: when the category/sub-category has directAssign, the
  // request is raised AGAINST a specific person and assigned straight to them.
  const againstUsername = body.againstUsername ? String(body.againstUsername).trim() : "";
  // On-behalf: POCs/ADMINs may raise for another user.
  const forUsername = body.forUsername ? String(body.forUsername).trim() : "";
  let requestedFor = me;
  if (forUsername && forUsername !== me.username) {
    if (me.role !== "POC" && me.role !== "ADMIN") {
      return NextResponse.json({ error: "forbidden_on_behalf" }, { status: 403 });
    }
    const target = await prisma.appUser.findUnique({ where: { username: forUsername } });
    if (!target) return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    requestedFor = target;
  }

  if (!title || !description || !categoryId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const category = await prisma.category.findUnique({ where: { id: categoryId, active: true } });
  if (!category) return NextResponse.json({ error: "category_not_found" }, { status: 404 });
  let sub: any = null;
  if (subCategoryId) {
    sub = await prisma.subCategory.findFirst({
      where: { id: subCategoryId, categoryId, active: true },
    });
    if (!sub) return NextResponse.json({ error: "subcategory_not_found" }, { status: 404 });
  }

  // Direct-assign category/sub-category: the requester picks the person the
  // request is raised against. That user becomes the assignee immediately.
  const directAssign = sub ? sub.directAssign : category.directAssign;
  let directTarget: any = null;
  if (directAssign) {
    if (!againstUsername) {
      return NextResponse.json({ error: "against_user_required" }, { status: 400 });
    }
    directTarget = await prisma.appUser.findUnique({ where: { username: againstUsername } });
    if (!directTarget) {
      // Not signed into this app yet — provision from the central SSO registry
      // so requests can be raised against any user the app has access to.
      const sso = (await listSsoUsers()).find((u) => u.username === againstUsername);
      if (!sso) return NextResponse.json({ error: "user_not_found" }, { status: 404 });
      directTarget = await prisma.appUser.create({
        data: {
          ssoUserId: sso.id,
          username: sso.username,
          name: sso.name,
          email: sso.email,
          primaryRole: sso.primaryRole,
          role: "USER",
        },
      });
    }
  }

  // Required contact fields — the app-admin decides per category, and a
  // selected sub-category can override the category's requirements.
  const needLocation = sub ? sub.requireLocation : category.requireLocation;
  const needContactTime = sub ? sub.requireContactTime : category.requireContactTime;
  const needContactPhone = sub ? sub.requireContactPhone : category.requireContactPhone;
  if (needLocation && !location) return NextResponse.json({ error: "location_required" }, { status: 400 });
  if (needContactTime && !contactTime) return NextResponse.json({ error: "contact_time_required" }, { status: 400 });
  if (needContactPhone && !contactPhone) return NextResponse.json({ error: "contact_phone_required" }, { status: 400 });

  // Category eligibility: which primary roles may raise requests here.
  const eligible =
    me.role === "ADMIN" ||
    me.role === "POC" ||
    category.allowedRoles.length === 0 ||
    (me.primaryRole ? category.allowedRoles.includes(me.primaryRole) : false);
  if (!eligible) {
    return NextResponse.json({ error: "role_not_allowed_for_category" }, { status: 403 });
  }

  // Sequential request number (unique) — retry once on a collision.
  let created: any = null;
  for (let attempt = 0; attempt < 2 && !created; attempt++) {
    const number = (await prisma.request.count()) + 1;
    try {
      created = await prisma.request.create({
        data: {
          number,
          categoryId,
          subCategoryId,
          title,
          description,
          location,
          contactTime,
          contactPhone,
          priority,
          requestedById: me.id,
          requestedForId: requestedFor.id,
          status: directAssign && directTarget ? "ASSIGNED" : "OPEN",
          assignedPocId: directAssign && directTarget ? directTarget.id : undefined,
          events: {
            create: [
              {
                userId: me.id,
                type: "CREATED",
                message: me.id === requestedFor.id ? "Request raised" : `Request raised on behalf of ${requestedFor.name}`,
              },
              ...(directAssign && directTarget
                ? [
                    {
                      userId: me.id,
                      type: "ASSIGNED",
                      message: `Assigned to ${directTarget.name} (raised directly against user)`,
                      toPocId: directTarget.id,
                    },
                  ]
                : []),
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

  // Direct-assign requests are already assigned to the raised-against user —
  // notify them and skip the POC queue entirely.
  if (directAssign && directTarget) {
    await notify(
      [directTarget.id],
      "ASSIGNED",
      "Request assigned to you",
      `${fmtRequestNumber(created.number)} — ${created.title} (raised directly against you)`,
      created.id
    );
  } else {
    // First-come-first-served auto-assignment: pick the active POC of the
    // category (or sub-category) with the lowest queue order and fewest open
    // tasks. If none exists, the request stays OPEN in the queue for manual take.
    const pocPick = await prisma.pocAssignment.findMany({
      where: {
        active: true,
        OR: [
          { subCategoryId: subCategoryId ?? undefined, categoryId },
          { subCategoryId: null, categoryId },
        ],
      },
      include: { user: true },
    });
    if (pocPick.length > 0) {
    const openCounts = await Promise.all(
      pocPick.map((a) =>
        prisma.request.count({
          where: {
            assignedPocId: a.userId,
            status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "PENDING"] },
          },
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
              userId: me.id,
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
      "New request assigned",
      `${fmtRequestNumber(created.number)} — ${created.title}`,
      created.id
    );
    }
  }

  await notify(
    [requestedFor.id],
    "REQUEST_RAISED",
    "Request logged",
    `${fmtRequestNumber(created.number)} — ${created.title} (${category.name})`,
    created.id
  );

  return NextResponse.json({ request: serializeRequest(created) }, { status: 201 });
}
