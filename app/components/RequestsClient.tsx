"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiPath } from "iipe-common-ui";
import { STATUS_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, ChevronLeft, ChevronRight } from "lucide-react";

type Req = {
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

export function RequestsClient({
  scope,
  categories,
}: {
  scope: "mine" | "assigned" | "queue" | "all";
  categories: { id: string; name: string }[];
}) {
  const sp = useSearchParams();
  const [rows, setRows] = useState<Req[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState(sp.get("categoryId") ?? "");
  const [debouncedQ, setDebouncedQ] = useState("");
  const limit = 10;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebouncedQ(q), 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ scope, page: String(page), limit: String(limit) });
    if (status) params.set("status", status);
    if (debouncedQ) params.set("q", debouncedQ);
    if (categoryId) params.set("categoryId", categoryId);
    try {
      const res = await fetch(apiPath(`/api/requests?${params}`), { cache: "no-store" });
      const data = await res.json();
      setRows(data.requests ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [scope, page, status, debouncedQ, categoryId]);

  useEffect(() => {
    load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search title, description, REQ number, user…"
            className="pl-8"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No requests found.</p>
        ) : (
          <div className="divide-y">
            {rows.map((r) => (
              <a key={r.id} href={`/requests/${r.id}`} className="flex items-start justify-between gap-3 p-3 transition-colors hover:bg-muted/40">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-primary">{r.requestId}</span>
                    {r.category && <Badge variant="outline">{r.category.name}</Badge>}
                    {r.subCategory && <Badge variant="secondary">{r.subCategory.name}</Badge>}
                    <Badge>{STATUS_LABELS[r.status] ?? r.status}</Badge>
                  </div>
                  <p className="mt-1 truncate text-sm font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Raised by {r.requestedBy?.name ?? "—"} · {new Date(r.createdAt).toLocaleDateString("en-IN")}
                    {r.assignedPoc ? ` · POC: ${r.assignedPoc.name}` : ""}
                  </p>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {total} request{total === 1 ? "" : "s"} · page {page} of {pages}
          </p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
