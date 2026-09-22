import { NextRequest, NextResponse } from "next/server";
import { sendDueReminders } from "@/lib/tasks";

export const dynamic = "force-dynamic";

const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? "";

/**
 * Internal endpoint so a server cron (or a platform scheduler) can push the
 * daily / weekly / monthly task reminders without a human opening the app.
 * Guarded by the shared internal key header — not callable from the internet.
 *
 *   curl -H "x-internal-key: <INTERNAL_API_KEY>" \
 *        https://testintranet.iipe.ac.in/logrequest/api/internal/reminders
 *
 * Reminders are idempotent: each task period is reminded at most once.
 */
function guard(request: NextRequest): NextResponse | null {
  if (!INTERNAL_KEY || request.headers.get("x-internal-key") !== INTERNAL_KEY) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}

async function run(request: NextRequest) {
  const denied = guard(request);
  if (denied) return denied;
  const sent = await sendDueReminders();
  return NextResponse.json({ ok: true, sent });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
