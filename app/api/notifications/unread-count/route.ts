import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/requests";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ count: 0 });
  const count = await prisma.notification.count({ where: { userId: me.id, read: false } });
  return NextResponse.json({ count });
}
