import { NextResponse } from "next/server";
import { sessionUser } from "@/lib/requests";
import { queryAppNotifications } from "sanapp-common-ui";

export const dynamic = "force-dynamic";

// Unread count from the central hub (this app's notifications only) — powers
// the sidebar badge via NotifBell's polling.
export async function GET() {
  const me = await sessionUser();
  if (!me?.username) return NextResponse.json({ count: 0 });
  const list = await queryAppNotifications({
    mainBaseUrl: process.env.MAIN_BASE_URL ?? "http://localhost:3001",
    appKey: process.env.MAIN_API_KEY,
    username: me.username,
    scope: "app",
    unreadOnly: true,
    limit: 1,
  });
  return NextResponse.json({ count: list.unread });
}
