"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Polls the unread-notification count every 30s; when it changes, refreshes
 * the server components so the bell badge and sidebar counts stay live.
 */
export function NotifBell({ initial }: { initial: number }) {
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    let last = initial;
    const tick = async () => {
      try {
        const res = await fetch("/api/notifications/unread-count", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const n = Number(data.count ?? 0);
        if (alive && n !== last) {
          last = n;
          router.refresh();
        }
      } catch {
        /* transient — try again next tick */
      }
    };
    const id = setInterval(tick, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [initial, router]);
  return null;
}
