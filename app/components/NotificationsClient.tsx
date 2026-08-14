"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath } from "iipe-common-ui";
import { Button } from "@/components/ui/button";
import { Loader2, Bell, BellOff } from "lucide-react";

type Notif = {
  id: string;
  title: string;
  body: string;
  kind: string;
  read: boolean;
  requestId: string | null;
  createdAt: string;
};

export function NotificationsClient() {
  const router = useRouter();
  const [rows, setRows] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiPath(`/api/notifications?limit=30${unreadOnly ? "&unread=1" : ""}`), {
        cache: "no-store",
      });
      const d = await res.json();
      setRows(d.notifications ?? []);
    } finally {
      setLoading(false);
    }
  }, [unreadOnly]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleRead(n: Notif) {
    await fetch(apiPath(`/api/notifications/${n.id}`), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ read: !n.read }),
    });
    setRows((rs) => rs.map((r) => (r.id === n.id ? { ...r, read: !n.read } : r)));
    router.refresh();
  }

  async function markAll() {
    await fetch(apiPath("/api/notifications"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    setRows((rs) => rs.map((r) => ({ ...r, read: true })));
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
          Unread only
        </label>
        <Button variant="outline" size="sm" onClick={markAll}>Mark all read</Button>
      </div>

      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-sm text-muted-foreground">
            <BellOff className="h-8 w-8" />
            No notifications.
          </div>
        ) : (
          <div className="divide-y">
            {rows.map((n) => (
              <div key={n.id} className={`flex items-start justify-between gap-3 p-3 ${n.read ? "" : "bg-primary/5"}`}>
                <a
                  href={n.requestId ? apiPath(`/requests/${n.requestId}`) : undefined}
                  className={`min-w-0 flex-1 ${n.requestId ? "cursor-pointer" : ""}`}
                  onClick={n.requestId ? undefined : (e) => e.preventDefault()}
                >
                  <div className="flex items-center gap-2">
                    {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    <span className="text-sm font-semibold">{n.title}</span>
                    <span className="text-xs text-muted-foreground">{n.kind}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString("en-IN")}
                  </p>
                </a>
                <button
                  onClick={() => toggleRead(n)}
                  title={n.read ? "Mark unread" : "Mark read"}
                  className={`rounded p-1 ${n.read ? "text-muted-foreground" : "text-primary"}`}
                >
                  {n.read ? <Bell className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
