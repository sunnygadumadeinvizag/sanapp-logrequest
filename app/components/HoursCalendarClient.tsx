"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPath } from "sanapp-common-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Clock,
  Ticket,
  ListTodo,
  CalendarDays,
} from "lucide-react";

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
  startedAt?: string | null;
  endedAt?: string | null;
};

type CalendarDay = {
  date: string;
  requestMinutes: number;
  taskMinutes: number;
  totalMinutes: number;
  entries: HoursEntry[];
};

type CalResp = {
  month: string;
  userId: string;
  days: CalendarDay[];
  monthMinutes: number;
  monthMinutesLabel: string;
  requestMinutes: number;
  taskMinutes: number;
};

type Person = { id: string; name: string; username: string; role: string };

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtMin(m: number) {
  if (!m) return "0m";
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h && min) return `${h}h ${min}m`;
  if (h) return `${h}h`;
  return `${min}m`;
}

export function HoursCalendarClient({
  meId,
  canViewOthers = false,
  people = [],
  initialMonth,
  viewUserId,
  title,
}: {
  meId: string;
  canViewOthers?: boolean;
  people?: Person[];
  initialMonth?: string;
  viewUserId?: string;
  title?: string;
}) {
  const [month, setMonth] = useState(
    initialMonth || new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 7)
  );
  const [userId, setUserId] = useState(viewUserId || meId);
  const [data, setData] = useState<CalResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CalendarDay | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({ month, userId });
      const res = await fetch(apiPath(`/api/hours/calendar?${qs}`), { cache: "no-store" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d?.error ?? "Could not load calendar");
        setData(null);
        return;
      }
      setData(await res.json());
    } catch {
      setErr("network");
    } finally {
      setLoading(false);
    }
  }, [month, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const weeks = useMemo(() => {
    if (!data || data.days.length === 0) return [];
    const first = new Date(`${data.days[0].date}T00:00:00Z`);
    const pad = first.getUTCDay();
    const cells: (CalendarDay | null)[] = [
      ...Array.from({ length: pad }, () => null),
      ...data.days,
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    const out: (CalendarDay | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [data]);

  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      {(err) && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {canViewOthers && people.length > 0 && (
            <select
              className="h-9 max-w-full rounded-md border bg-background px-2 text-sm"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              aria-label="View person"
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === meId ? `You — ${p.name}` : p.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[8rem] text-center text-sm font-medium">{monthLabel(month)}</span>
          <Button size="sm" variant="outline" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="hc-from" className="text-xs">From</Label>
          <Input id="hc-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-auto text-xs" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hc-to" className="text-xs">To</Label>
          <Input id="hc-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-auto text-xs" />
        </div>
        <a
          href={apiPath(
            `/hours${userId !== meId ? `?user=${userId}` : ""}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`
          )}
          className="iipe-btn !py-1.5 text-xs"
        >
          <Clock className="mr-1 inline h-3.5 w-3.5" /> Summary
        </a>
        {title && <span className="text-xs text-muted-foreground">{title}</span>}
      </div>

      <div className="rounded-lg border bg-card p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="flex flex-wrap gap-3">
            <span className="text-muted-foreground">
              Month:{" "}
              <span className="font-semibold text-foreground">
                {data ? data.monthMinutesLabel || fmtMin(data.monthMinutes) : "—"}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Ticket className="h-3.5 w-3.5" /> Requests {data ? fmtMin(data.requestMinutes) : "—"}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <ListTodo className="h-3.5 w-3.5" /> Tasks {data ? fmtMin(data.taskMinutes) : "—"}
            </span>
          </div>
          <span className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary/70" /> Request
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-600/70" /> Task
            </span>
          </span>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1">
                {week.map((day, di) => {
                  if (!day) return <div key={di} className="min-h-[3.5rem]" />;
                  const dayNum = Number(day.date.slice(8, 10));
                  const isToday = day.date === today;
                  const has = day.totalMinutes > 0;
                  return (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => setSelected(day)}
                      className={`min-h-[3.5rem] rounded-md border p-1 text-left transition hover:border-primary/60 hover:bg-muted/40 ${
                        has
                          ? day.requestMinutes > 0 && day.taskMinutes > 0
                            ? "border-primary/50 bg-primary/10"
                            : day.taskMinutes > 0
                              ? "border-emerald-600/40 bg-emerald-600/10"
                              : "border-primary/50 bg-primary/10"
                          : "border-transparent"
                      } ${isToday ? "ring-2 ring-primary" : ""}`}
                      aria-label={`${day.date}, ${fmtMin(day.totalMinutes)}`}
                    >
                      <div className="text-xs font-medium">{dayNum}</div>
                      {has && (
                        <span className="mt-0.5 block text-[10px] font-semibold text-primary">
                          {fmtMin(day.totalMinutes)}
                        </span>
                      )}
                      {day.requestMinutes > 0 && (
                        <span className="block text-[9px] text-muted-foreground">
                          R {fmtMin(day.requestMinutes)}
                        </span>
                      )}
                      {day.taskMinutes > 0 && (
                        <span className="block text-[9px] text-emerald-700">
                          T {fmtMin(day.taskMinutes)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              {selected?.date}
            </DialogTitle>
            <DialogDescription>
              {selected
                ? `${fmtMin(selected.totalMinutes)} total · ${fmtMin(selected.requestMinutes)} requests · ${fmtMin(selected.taskMinutes)} tasks`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-2">
              {selected.entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hours logged this day.</p>
              ) : (
                selected.entries.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-md border p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={e.source === "REQUEST" ? "outline" : "default"}>
                            {e.source === "REQUEST" ? "Request" : "Task"}
                          </Badge>
                          <span className="font-medium">
                            {e.source === "REQUEST" && e.number
                              ? `REQ-${String(e.number).padStart(4, "0")} — `
                              : ""}
                            {e.title}
                          </span>
                        </div>
                        {e.note && (
                          <p className="mt-1 text-xs text-muted-foreground">{e.note}</p>
                        )}
                        {e.startedAt && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {new Date(e.startedAt).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "Asia/Kolkata",
                            })}
                            {e.endedAt &&
                              ` – ${new Date(e.endedAt).toLocaleTimeString("en-IN", {
                                hour: "2-digit",
                                minute: "2-digit",
                                timeZone: "Asia/Kolkata",
                              })}`}
                          </p>
                        )}
                        {e.periodKey && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">Period {e.periodKey}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-sm font-semibold">{fmtMin(e.minutes)}</span>
                    </div>
                    <div className="mt-1.5">
                      <a
                        href={apiPath(
                          e.source === "REQUEST" ? `/requests/${e.refId}` : `/tasks/${e.refId}`
                        )}
                        className="text-xs text-primary hover:underline"
                      >
                        Open {e.source === "REQUEST" ? "request" : "task"} →
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
