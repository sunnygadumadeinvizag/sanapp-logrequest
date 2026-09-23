"use client";

import { useCallback, useEffect, useState } from "react";
import { apiPath } from "sanapp-common-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Ticket, ListTodo, CalendarDays, RefreshCw } from "lucide-react";

type HoursEntry = {
  id: string;
  source: "REQUEST" | "TASK";
  date: string;
  minutes: number;
  title: string;
  refId: string;
  note: string | null;
  number?: number | null;
  periodKey?: string | null;
};

type DayRow = {
  date: string;
  requestMinutes: number;
  taskMinutes: number;
  totalMinutes: number;
  entries: HoursEntry[];
};

type Summary = {
  userId: string;
  name: string;
  username: string;
  role: string;
  from: string;
  to: string;
  requestMinutes: number;
  taskMinutes: number;
  totalMinutes: number;
  totalMinutesLabel: string;
  requestMinutesLabel: string;
  taskMinutesLabel: string;
  activeDays: number;
  sessions: number;
  taskLogs: number;
  byDay: DayRow[];
  byRequest: Array<{ id: string; number: number; title: string; minutes: number; sessions: number }>;
  byTask: Array<{ id: string; title: string; minutes: number; logs: number }>;
  entries: HoursEntry[];
  canViewOthers?: boolean;
};

type Person = { id: string; name: string; username: string; role: string };

function fmtMin(m: number) {
  if (!m) return "0m";
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h && min) return `${h}h ${min}m`;
  if (h) return `${h}h`;
  return `${min}m`;
}

export function HoursSummaryClient({
  meId,
  canViewOthers = false,
  people = [],
  initialUserId,
  initialFrom,
  initialTo,
}: {
  meId: string;
  canViewOthers?: boolean;
  people?: Person[];
  initialUserId?: string;
  initialFrom?: string;
  initialTo?: string;
}) {
  const [userId, setUserId] = useState(initialUserId || meId);
  const [from, setFrom] = useState(initialFrom || "");
  const [to, setTo] = useState(initialTo || "");
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setBusy(true);
    try {
      const qs = new URLSearchParams();
      if (userId) qs.set("userId", userId);
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const res = await fetch(apiPath(`/api/hours?${qs}`), { cache: "no-store" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d?.error ?? "Could not load hours");
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
  }, [userId, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      {err && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        {canViewOthers && people.length > 0 && (
          <div className="space-y-1">
            <Label htmlFor="hs-user" className="text-xs">Person</Label>
            <select
              id="hs-user"
              className="h-9 max-w-[14rem] rounded-md border bg-background px-2 text-sm"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === meId ? `You — ${p.name}` : p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="hs-from" className="text-xs">From</Label>
          <Input id="hs-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-auto" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hs-to" className="text-xs">To</Label>
          <Input id="hs-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-auto" />
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={busy}>
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
          Refresh
        </Button>
        <a
          href={apiPath(
            `/hours/calendar${userId !== meId ? `?user=${userId}` : ""}`
          )}
          className="iipe-btn !py-1.5 text-xs"
        >
          <CalendarDays className="mr-1 inline h-3.5 w-3.5" /> Calendar
        </a>
      </div>

      {loading && !data ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading hours…
        </div>
      ) : data ? (
        <>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm font-semibold">{data.name}</p>
            <p className="text-xs text-muted-foreground">
              @{data.username} · {data.role} · {data.from} → {data.to}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total hours</p>
              <p className="mt-1 text-2xl font-bold">{data.totalMinutesLabel || fmtMin(data.totalMinutes)}</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Ticket className="h-3.5 w-3.5" /> Request hours
              </p>
              <p className="mt-1 text-2xl font-bold text-primary">
                {data.requestMinutesLabel || fmtMin(data.requestMinutes)}
              </p>
              <p className="text-[11px] text-muted-foreground">{data.sessions} sessions</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <ListTodo className="h-3.5 w-3.5" /> Task hours
              </p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">
                {data.taskMinutesLabel || fmtMin(data.taskMinutes)}
              </p>
              <p className="text-[11px] text-muted-foreground">{data.taskLogs} completed logs</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">Active days</p>
              <p className="mt-1 text-2xl font-bold">{data.activeDays}</p>
            </div>
          </div>

          {/* Per-request */}
          <div className="rounded-lg border bg-card">
            <div className="border-b px-3 py-2 text-sm font-semibold">Hours by request (tickets)</div>
            {data.byRequest.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No request work in this range.</p>
            ) : (
              <div className="divide-y">
                {data.byRequest.map((r) => (
                  <a
                    key={r.id}
                    href={apiPath(`/requests/${r.id}`)}
                    className="flex items-center justify-between gap-3 p-3 text-sm no-underline transition-colors hover:bg-muted/40 hover:no-underline"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        REQ-{String(r.number).padStart(4, "0")} — {r.title}
                      </p>
                      <p className="text-xs text-muted-foreground">{r.sessions} session{r.sessions === 1 ? "" : "s"}</p>
                    </div>
                    <span className="shrink-0 font-semibold text-primary">{fmtMin(r.minutes)}</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Per-task */}
          <div className="rounded-lg border bg-card">
            <div className="border-b px-3 py-2 text-sm font-semibold">Hours by task</div>
            {data.byTask.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No completed task hours in this range.</p>
            ) : (
              <div className="divide-y">
                {data.byTask.map((t) => (
                  <a
                    key={t.id}
                    href={apiPath(`/tasks/${t.id}`)}
                    className="flex items-center justify-between gap-3 p-3 text-sm no-underline transition-colors hover:bg-muted/40 hover:no-underline"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{t.title}</p>
                      <p className="text-xs text-muted-foreground">{t.logs} log{t.logs === 1 ? "" : "s"}</p>
                    </div>
                    <span className="shrink-0 font-semibold text-emerald-700">{fmtMin(t.minutes)}</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Day-by-day */}
          <div className="rounded-lg border bg-card">
            <div className="border-b px-3 py-2 text-sm font-semibold">Day-by-day</div>
            {data.byDay.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No active days.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Requests</th>
                      <th className="px-3 py-2 font-medium">Tasks</th>
                      <th className="px-3 py-2 font-medium">Total</th>
                      <th className="px-3 py-2 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byDay.map((d) => (
                      <tr key={d.date} className="border-t">
                        <td className="whitespace-nowrap px-3 py-2 font-medium">{d.date}</td>
                        <td className="px-3 py-2">{d.requestMinutes ? fmtMin(d.requestMinutes) : "—"}</td>
                        <td className="px-3 py-2 text-emerald-700">{d.taskMinutes ? fmtMin(d.taskMinutes) : "—"}</td>
                        <td className="px-3 py-2 font-semibold">{fmtMin(d.totalMinutes)}</td>
                        <td className="max-w-[240px] px-3 py-2 text-muted-foreground">
                          {d.entries
                            .slice(0, 3)
                            .map((e) => e.title)
                            .join(" · ")}
                          {d.entries.length > 3 ? ` +${d.entries.length - 3}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent entries */}
          <div className="rounded-lg border bg-card">
            <div className="border-b px-3 py-2 text-sm font-semibold">Recent entries</div>
            {data.entries.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <div className="divide-y">
                {data.entries.slice(0, 40).map((e) => (
                  <a
                    key={e.id}
                    href={apiPath(e.source === "REQUEST" ? `/requests/${e.refId}` : `/tasks/${e.refId}`)}
                    className="flex items-center justify-between gap-3 p-3 text-sm no-underline transition-colors hover:bg-muted/40 hover:no-underline"
                  >
                    <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                      <Badge variant={e.source === "REQUEST" ? "outline" : "default"}>
                        {e.source === "REQUEST" ? "Request" : "Task"}
                      </Badge>
                      <span className="truncate">
                        {e.source === "REQUEST" && e.number
                          ? `REQ-${String(e.number).padStart(4, "0")} — `
                          : ""}
                        {e.title}
                      </span>
                      <span className="text-xs text-muted-foreground">{e.date}</span>
                    </div>
                    <span className="shrink-0 font-semibold">{fmtMin(e.minutes)}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
