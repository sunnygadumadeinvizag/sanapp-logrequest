import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtIstDateTime, fmtRequestNumber, statusLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

const IST_MS = (5 * 60 + 30) * 60 * 1000;
const istDayStart = (d: string) => new Date(new Date(`${d}T00:00:00Z`).getTime() - IST_MS);
const istDayEnd = (d: string) => new Date(new Date(`${d}T23:59:59.999Z`).getTime() - IST_MS);

export async function GET(req: Request) {
  const me = await currentUser();
  if (!me || me.role !== "ADMIN") {
    return NextResponse.json({ error: "Only the app administrator can export analytics" }, { status: 403 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const userId = url.searchParams.get("user") ?? "";

  const createdWhere: Record<string, unknown> = {};
  if (from) createdWhere.createdAt = { gte: istDayStart(from) };
  if (to) {
    const toEnd = istDayEnd(to);
    createdWhere.createdAt = { ...(createdWhere.createdAt as object), lte: toEnd };
  }

  const [users, requests] = await Promise.all([
    prisma.appUser.findMany({ orderBy: { name: "asc" }, select: { id: true, username: true, name: true, primaryRole: true, role: true } }),
    prisma.request.findMany({
      where: userId ? { requestedById: userId, ...createdWhere } : createdWhere,
      orderBy: { createdAt: "desc" },
      select: {
        number: true,
        title: true,
        status: true,
        priority: true,
        createdAt: true,
        resolvedAt: true,
        totalWorkMinutes: true,
        assetTag: true,
        location: true,
        category: { select: { name: true } },
        subCategory: { select: { name: true } },
        requestedBy: { select: { name: true, username: true } },
        requestedFor: { select: { name: true } },
        assignedPoc: { select: { name: true } },
      },
    }),
  ]);

  // ---- Sheet 1: per-user summary (always all users, filtered by range) ----
  const userRows: (string | number)[][] = [
    ["User", "Username", "Primary role", "Raised", "On behalf", "Assigned as POC", "Solved (closed)", "Work minutes"],
  ];
  for (const u of users) {
    const mine = requests.filter((r) => r.requestedBy.username === u.username);
    userRows.push([
      u.name,
      u.username,
      u.primaryRole ?? "",
      mine.length,
      mine.filter((r) => r.requestedFor.name !== u.name).length,
      requests.filter((r) => r.assignedPoc?.name === u.name).length,
      requests.filter((r) => r.assignedPoc?.name === u.name && r.status === "CLOSED").length,
      requests.filter((r) => r.assignedPoc?.name === u.name).reduce((a, r) => a + r.totalWorkMinutes, 0),
    ]);
  }

  // ---- Sheet 2: request-by-request ----
  const reqRows: (string | number)[][] = [
    ["Request #", "Raised at (IST)", "Title", "Category", "Sub-category", "Status", "Priority", "Raised by", "On behalf of", "POC", "Asset tag", "Location", "Work minutes", "Resolved at (IST)"],
  ];
  for (const r of requests) {
    reqRows.push([
      fmtRequestNumber(r.number),
      fmtIstDateTime(r.createdAt.toISOString()),
      r.title,
      r.category.name,
      r.subCategory?.name ?? "",
      statusLabel(r.status),
      r.priority,
      r.requestedBy.name,
      r.requestedFor.name,
      r.assignedPoc?.name ?? "",
      r.assetTag ?? "",
      r.location ?? "",
      r.totalWorkMinutes,
      r.resolvedAt ? fmtIstDateTime(r.resolvedAt.toISOString()) : "",
    ]);
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(userRows), "Users summary");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(reqRows), "Requests");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const stamp = new Date(Date.now() + IST_MS).toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="logrequest-report-${stamp}.xlsx"`,
    },
  });
}
