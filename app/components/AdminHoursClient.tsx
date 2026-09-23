"use client";

import { useCallback, useEffect, useState } from "react";
import { apiPath } from "sanapp-common-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CalendarDays, RefreshCw, Search } from "lucide-react";

type PersonRow = {
  userId: string;
  name: string;
  username: string;
  role: string;
  requestMinutes: number;
  taskMinutes: number;
  totalMinutes: number;
  totalMinutesLabel: string;
  requestMinutesLabel: string;
  taskMinutesLabel: string;
  activeDays: number;
  sessions: number;
  taskLogs: number;
  lastActivityAt: string | null;
};

type TeamResp = {
  from: string;
  to: string;
  people: PersonRow[];
  totals: {
    requestMinutes: number;
    taskMinutes: number;
    totalMinutes: number;
    totalMinutesLabel: string;
  };
};

function fmtMin(m: number) {
  if (!m) return "0m";
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h && min) return `${h}h ${min}m`;
  if (h) return `${h}h`;
  return `${min}m`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export function AdminHoursClient({ meId }: { meId: string }) {
  const [data, setData] = useState<TeamResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setBusy(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({ team: "1" });
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const res = await fetch(apiPath(`/api/hours?${qs}`), { cache: "no-store" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d?.error ?? "Could not load team hours");
        setData(null);
        return;
      }
      setData(await res.json());
    } catch {
      setErr("network");
    } finally {
      setLoading(false);
      setBusy(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = (data?.people ?? []).filter((p) => {
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    return p.name.toLowerCase().includes(s) || p.username.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-4">
      {err && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="ah-from" className="text-xs">From</Label>
          <Input id="ah-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-auto" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ah-to" className="text-xs">To</Label>
          <Input id="ah-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-auto" />
        </div>
        <div className="space-y-1 min-w-[10rem] flex-1">
          <Label htmlFor="ah-q" className="text-xs">Search person</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-50" />
            <Input
              id="ah-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name or username…"
              className="h-9 pl-7"
            />
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={busy}>
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
          Refresh
        </Button>
        <a href={apiPath("/hours/calendar")} className="iipe-btn !py-1.5 text-xs">
          <CalendarDays className="mr-1 inline h-3.5 w-3.5" /> My calendar
        </a>
      </div>

      {data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Team total ({data.from} → {data.to})</p>
            <p className="mt-1 text-2xl font-bold">{data.totals.totalMinutesLabel || fmtMin(data.totals.totalMinutes)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Request hours</p>
            <p className="mt-1 text-2xl font-bold text-primary">{fmtMin(data.totals.requestMinutes)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Task hours</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{fmtMin(data.totals.taskMinutes)}</p>
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <div className="border-b px-3 py-2 text-sm font-semibold">
          Per person — hours spent (requests + tasks)
        </div>
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No people match.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Person</th>
                  <th className="px-3 py-2 font-medium">Total</th>
                  <th className="px-3 py-2 font-medium">Requests</th>
                  <th className="px-3 py-2 font-medium">Tasks</th>
                  <th className="px-3 py-2 font-medium">Active days</th>
                  <th className="px-3 py-2 font-medium">Last activity</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.userId} className="border-t">
                    <td className="px-3 py-2">
                      <span className="font-medium">{p.name}</span>
                      <span className="ml-1 text-xs text-muted-foreground">
                        (@{p.username} · {p.role})
                      </span>
                      {p.userId === meId && (
                        <Badge variant="outline" className="ml-1 px-1 py-0 text-[10px]">You</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 font-semibold">{p.totalMinutesLabel || fmtMin(p.totalMinutes)}</td>
                    <td className="px-3 py-2 text-primary">{p.requestMinutesLabel || fmtMin(p.requestMinutes)}</td>
                    <td className="px-3 py-2 text-emerald-700">{p.taskMinutesLabel || fmtMin(p.taskMinutes)}</td>
                    <td className="px-3 py-2">{p.activeDays}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {fmtDate(p.lastActivityAt)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      <a
                        href={apiPath(`/admin/hours/${p.userId}`)}
                        className="text-primary hover:underline"
                      >
                        Detail &amp; calendar →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
