import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAppSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const store = await cookies();
  const session = store.get("app5_session")?.value;
  const user = session ? await verifyAppSession(session) : null;
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const local = await prisma.appUser.findUnique({ where: { username: user.username } });
  const unread = local ? await prisma.notification.count({ where: { userId: local.id, read: false } }) : 0;
  return NextResponse.json({
    user: { ...user, localRole: local?.role ?? "USER" },
    unread,
  });
}
