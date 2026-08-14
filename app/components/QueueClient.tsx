"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath } from "iipe-common-ui";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Inbox, Clock } from "lucide-react";

type Wait = {
  id: string;
  requestId: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
  category: { name: string } | null;
  subCategory: { name: string } | null;
  requestedBy: { name: string } | null;
  requestedFor: { name: string } | null;
  assignedPoc: { name: string } | null;
};

export function QueueClient({ meUsername }: { meUsername: string }) {
  const router = useRouter();
  const [waiting, setWaiting] = useState<Wait[]>([]);
  const [myOpen, setMyOpen] = useState(0);
  const [running, setRunning] = useState<{ requestId: string; number: number; title: string; startedAt: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiPath("/api/queue"), { cache: "no-store" });
      const d = await res.json();
      setWaiting(d.waiting ?? []);
      setMyOpen(d.myOpen ?? 0);
      setRunning(d.running);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function take(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(apiPath(`/api/requests/${id}/assign`), { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        setMsg(d?.error ?? "Could not take request");
        setTimeout(() => setMsg(null), 4000);
        return;
      }
      setMsg("Request taken — open it to start working.");
      setTimeout(() => setMsg(null), 4000);
      load();
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading queue…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {msg && <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</div>}

      {running && (
        <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
          <Clock className="h-4 w-4 animate-pulse text-primary" />
          You are working on{" "}
          <a href={apiPath(`/requests/${running.requestId}`)} className="font-semibold text-primary hover:underline">
            REQ-{String(running.number).padStart(4, "0")} — {running.title}
          </a>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Requests I am handling</p>
          <p className="mt-1 text-2xl font-bold">{myOpen}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Waiting in my categories</p>
          <p className="mt-1 text-2xl font-bold">{waiting.length}</p>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Queue — first come, first served</h3>
        </div>
        {waiting.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-sm text-muted-foreground">
            <Inbox className="h-8 w-8" />
            Queue is clear — nothing waiting in your categories.
          </div>
        ) : (
          <div className="divide-y">
            {waiting.map((w) => {
              const mine = w.assignedPoc?.name ?? null;
              return (
                <div key={w.id} className="group flex items-start justify-between gap-3 p-3 transition-colors hover:bg-muted/40">
                  <a href={apiPath(`/requests/${w.id}`)} className="min-w-0 flex-1 cursor-pointer">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-primary">{w.requestId}</span>
                      {w.category && <Badge variant="outline">{w.category.name}</Badge>}
                      {w.subCategory && <Badge variant="secondary">{w.subCategory.name}</Badge>}
                      <Badge>{STATUS_LABELS[w.status] ?? w.status}</Badge>
                      <Badge variant="outline">{PRIORITY_LABELS[w.priority] ?? w.priority}</Badge>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">{w.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {w.requestedBy?.name} · {new Date(w.createdAt).toLocaleString("en-IN")}
                      {mine ? ` · Currently: ${mine}` : " · Unassigned"}
                    </p>
                  </a>
                  {!mine && (
                    <Button size="sm" onClick={() => take(w.id)} disabled={busyId === w.id || !!running}>
                      {busyId === w.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Take"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
