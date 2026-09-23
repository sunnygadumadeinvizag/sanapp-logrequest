"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiPath } from "sanapp-common-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, FileText, Loader2, Download } from "lucide-react";

type CalendarDay = {
  date: string;
  scheduled: boolean;
  status: string | null;
  minutes: number;
  note: string | null;
  logId: string | null;
  periodKey: string | null;
  hasPdf: boolean;
  loggedAt: string | null;
};

type CalendarResp = {
  month: string;
  userId: string;
  days: CalendarDay[];
  monthMinutes: number;
  monthMinutesLabel: string;
};

type TaskLite = {
  id: string;
  title: string;
  participants: { id: string; name: string; username: string }[];
};

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "outline",
  COMPLETED: "default",
  MISSED: "destructive",
  SKIPPED: "secondary",
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  COMPLETED: "Completed",
  MISSED: "Missed",
  SKIPPED: "Skipped",
};

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

export function TaskCalendarClient({
  taskId,
  meId,
  participants = [],
  taskTitle,
  initialMonth,
  viewUserId,
}: {
  taskId: string;
  meId: string;
  participants?: { id: string; name: string; username: string }[];
  taskTitle: string;
  initialMonth: string;
  viewUserId?: string;
}) {
  const router = useRouter();
  const [month, setMonth] = useState(initialMonth);
  const [userId, setUserId] = useState(viewUserId || meId);
  const [data, setData] = useState<CalendarResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CalendarDay | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const flash = (ok: boolean, text: string) => {
    setMsg(ok ? text : null);
    setErr(ok ? null : text);
    setTimeout(() => {
      setMsg(null);
      setErr(null);
    }, 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        apiPath(`/api/tasks/${taskId}/calendar?month=${month}&userId=${userId}`),
        { cache: "no-store" }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        flash(false, d?.error ?? "Could not load calendar");
        setData(null);
        return;
      }
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [taskId, month, userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function clearDay() {
    if (!selected?.logId && !selected?.periodKey) return;
    setBusy(true);
    try {
      const params = new URLSearchParams();
      params.set("date", selected.date);
      if (selected.periodKey) params.set("periodKey", selected.periodKey);
      if (userId !== meId) params.set("userId", userId);
      const res = await fetch(apiPath(`/api/tasks/${taskId}/log?${params}`), {
        method: "DELETE",
      });
      if (!res.ok) {
        flash(false, "Could not clear log");
        return;
      }
      flash(true, `Cleared ${selected.date}`);
      setClearOpen(false);
      setSelected(null);
      await load();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const weeks = useMemo(() => {
    if (!data) return [];
    const days = data.days;
    if (days.length === 0) return [];
    // Pad so the 1st sits under the correct weekday (IST keys, Sunday-first grid
    // matching JS getDay via constructing from the key).
    const first = new Date(`${days[0].date}T00:00:00Z`);
    const pad = first.getUTCDay();
    const cells: (CalendarDay | null)[] = [
      ...Array.from({ length: pad }, () => null),
      ...days,
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    const out: (CalendarDay | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [data]);

  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      {(msg || err) && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            err ? "border-red-300 bg-red-50 text-red-700" : "border-green-300 bg-green-50 text-green-700"
          }`}
        >
          {err ?? msg}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <a href={apiPath(`/tasks/${taskId}`)} className="text-sm text-primary hover:underline">
            ← Task detail
          </a>
          <Badge variant="outline">{taskTitle}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {participants.length > 1 && (
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              aria-label="View person"
            >
              {participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === meId ? `You (${p.name})` : p.name}
                </option>
              ))}
            </select>
          )}
          <Button size="sm" variant="outline" onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[9rem] text-center text-sm font-medium">{monthLabel(month)}</span>
          <Button size="sm" variant="outline" onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            Hours this month:{" "}
            <span className="font-semibold text-foreground">
              {data ? data.monthMinutesLabel || fmtMin(data.monthMinutes) : "—"}
            </span>
          </span>
          <span className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary/70" /> Completed
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-destructive/60" /> Missed
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border border-primary" /> Scheduled
            </span>
          </span>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
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
                  if (!day) return <div key={di} className="min-h-[3.25rem]" />;
                  const dayNum = Number(day.date.slice(8, 10));
                  const isToday = day.date === today;
                  const done = day.status === "COMPLETED";
                  const missed = day.status === "MISSED";
                  return (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => setSelected(day)}
                      className={`min-h-[3.25rem] rounded-md border p-1 text-left transition hover:border-primary/60 hover:bg-muted/40 ${
                        done
                          ? "border-primary/50 bg-primary/10"
                          : missed
                            ? "border-destructive/40 bg-destructive/10"
                            : day.scheduled
                              ? "border-primary/30"
                              : "border-transparent opacity-60"
                      } ${isToday ? "ring-2 ring-primary" : ""}`}
                      aria-label={`${day.date}${day.status ? `, ${STATUS_LABEL[day.status]}` : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{dayNum}</span>
                        {day.hasPdf && <FileText className="h-3 w-3 text-primary" />}
                      </div>
                      {day.minutes > 0 && (
                        <span className="mt-0.5 block text-[10px] font-semibold text-primary">
                          {fmtMin(day.minutes)}
                        </span>
                      )}
                      {day.status && day.status !== "COMPLETED" && (
                        <span
                          className={`mt-0.5 block text-[10px] ${
                            missed ? "text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          {STATUS_LABEL[day.status]}
                        </span>
                      )}
                      {!day.scheduled && !day.status && (
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">·</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Day detail dialog */}
      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selected?.date ?? "Day"}</DialogTitle>
            <DialogDescription>
              {selected?.status
                ? STATUS_LABEL[selected.status] ?? selected.status
                : selected?.scheduled
                  ? "Scheduled — no log yet"
                  : "Not scheduled"}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              {selected.status && (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={STATUS_BADGE[selected.status] ?? "outline"}>
                    {STATUS_LABEL[selected.status] ?? selected.status}
                  </Badge>
                  {selected.minutes > 0 && (
                    <span className="font-medium">{fmtMin(selected.minutes)}</span>
                  )}
                  {selected.hasPdf && <FileText className="h-4 w-4 text-primary" />}
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-muted-foreground">Comment</p>
                <p className="mt-0.5 whitespace-pre-wrap">{selected.note || "—"}</p>
              </div>
              <div className="text-xs text-muted-foreground">
                Period: {selected.periodKey || "—"}
                {selected.loggedAt && (
                  <>
                    {" · "}closed{" "}
                    {new Date(selected.loggedAt).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Kolkata",
                    })}
                  </>
                )}
              </div>
              {selected.hasPdf && selected.logId && (
                <div className="rounded-md border p-2">
                  <a
                    href={apiPath(
                      `/api/tasks/${taskId}/attachments?logId=${selected.logId}`
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                    onClick={async (e) => {
                      // Resolve attachment id then open PDF.
                      e.preventDefault();
                      const res = await fetch(
                        apiPath(`/api/tasks/${taskId}/attachments?logId=${selected.logId}`)
                      );
                      const d = await res.json();
                      const a = d?.attachments?.[0];
                      if (a) {
                        window.open(apiPath(`/api/tasks/${taskId}/attachments/${a.id}`), "_blank");
                      }
                    }}
                  >
                    <Download className="h-3.5 w-3.5" /> Open proof PDF
                  </a>
                </div>
              )}
              {selected.status === "COMPLETED" && selected.logId && (
                <p className="text-xs text-muted-foreground">
                  Use Clear log to reopen this day (removes PDF + comment).
                </p>
              )}
            </div>
          )}
          <DialogFooter className="flex flex-wrap gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setSelected(null)}>
              Close
            </Button>
            {selected?.status === "COMPLETED" && (
              <Button variant="destructive" onClick={() => setClearOpen(true)}>
                Clear log
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={(o) => !o && setClearOpen(false)}
        title="Clear this day's log?"
        description={`This resets ${selected?.date ?? ""} to Pending and removes its PDF and comment.`}
        confirmLabel="Clear"
        destructive
        busy={busy}
        onConfirm={clearDay}
      />
    </div>
  );
}
