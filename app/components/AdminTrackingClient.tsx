"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath } from "iipe-common-ui";
import { STATUS_LABELS, fmtMinutes, fmtRequestNumber } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, ChevronLeft, ChevronRight } from "lucide-react";

type Req = {
  id: string;
  requestId: string;
  title: string;
  status: string;
  createdAt: string;
  category: { name: string } | null;
  requestedBy: { name: string } | null;
  requestedFor: { name: string } | null;
  assignedPoc: { name: string } | null;
  totalWorkMinutes: number;
};

type User = { id: string; username: string; name: string; role: string; primaryRole: string | null };

export function AdminTrackingClient() {
  const router = useRouter();
  const [rows, setRows] = useState<Req[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [pocWork, setPocWork] = useState<{ userId: string; open: number; closed: number; minutes: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [userId, setUserId] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(true);
  const limit = 15;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) params.set("status", status);
    if (categoryId) params.set("categoryId", categoryId);
    if (userId) params.set("userId", userId);
    if (debouncedQ) params.set("q", debouncedQ);
    try {
      const res = await fetch(apiPath(`/api/admin/tracking?${params}`), { cache: "no-store" });
      const d = await res.json();
      setRows(d.requests ?? []);
      setTotal(d.total ?? 0);
      setCategories(d.categories ?? []);
      setUsers(d.users ?? []);
      setStatusCounts(d.statusCounts ?? {});
      setPocWork(d.pocWork ?? []);
    } finally {
      setLoading(false);
    }
  }, [page, status, categoryId, userId, debouncedQ]);

  useEffect(() => {
    load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {Object.entries(statusCounts).map(([k, v]) => (
          <button
            key={k}
            onClick={() => {
              setStatus(status === k ? "" : k);
              setPage(1);
            }}
            className={`rounded-full border px-3 py-1 text-xs ${status === k ? "border-primary bg-primary/10 font-semibold text-primary" : "text-muted-foreground"}`}
          >
            {STATUS_LABELS[k] ?? k}: {v}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search title, REQ number, user…" className="pl-8" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }}>
          <option value="">All users</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>

      {/* POC workload summary */}
      {pocWork.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-2 text-sm font-semibold">POC workload</div>
          <div className="divide-y">
            {pocWork.map((p) => {
              const u = users.find((x) => x.id === p.userId);
              return (
                <div key={p.userId} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>{u?.name ?? "—"}</span>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>{p.open} open</span>
                    <span>{p.closed} closed</span>
                    <span className="font-semibold text-foreground">{fmtMinutes(p.minutes)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No requests match.</p>
        ) : (
          <div className="divide-y">
            {rows.map((r) => (
              <a key={r.id} href={`/requests/${r.id}`} className="flex items-start justify-between gap-3 p-3 hover:bg-muted/40">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-primary">{r.requestId}</span>
                    {r.category && <Badge variant="outline">{r.category.name}</Badge>}
                    <Badge>{STATUS_LABELS[r.status] ?? r.status}</Badge>
                  </div>
                  <p className="mt-1 truncate text-sm font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.requestedBy?.name} → {r.requestedFor?.name}
                    {r.assignedPoc ? ` · POC ${r.assignedPoc.name}` : ""} · {fmtMinutes(r.totalWorkMinutes)} worked
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("en-IN")}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{total} requests · page {page} of {pages}</p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
