"use client";

import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiPath } from "sanapp-common-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Pencil,
  Trash2,
  CheckCircle2,
  Clock,
  SkipForward,
  History,
  Users,
  CalendarDays,
  FileText,
  BarChart3,
  Download,
} from "lucide-react";

type Participant = { id: string; username: string; name: string };

type Attachment = { id: string; name: string; mime: string; size: number };

type TaskLog = {
  id: string;
  userId: string;
  user?: Participant;
  periodKey: string;
  status: string;
  minutes: number;
  note: string | null;
  logDate: string | null;
  loggedAt: string | null;
  attachments?: Attachment[];
};

type TaskStats = {
  daysWorked: number;
  daysMissed: number;
  daysSkipped: number;
  daysPending: number;
  totalMinutes: number;
  totalMinutesLabel: string;
  minutesByDate: Record<string, number>;
  missedDates: string[];
  workedDates: string[];
};

type AuditEvent = {
  id: string;
  logId: string | null;
  user: { id: string; name: string; username: string; role?: string };
  periodKey: string | null;
  type: string;
  message: string;
  minutes: number | null;
  status: string | null;
  createdAt: string;
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  recurrence: string;
  scheduleText: string;
  reminderEnabled: boolean;
  reminderTime?: string | null;
  active: boolean;
  createdAt: string;
  user?: Participant;
  assignees: Participant[];
  participants: Participant[];
  isCreator: boolean;
  currentPeriod: string;
  currentLog: TaskLog | null;
  logs: TaskLog[];
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

function fmtMinutes(m: number) {
  if (!m) return "0 min";
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h && min) return `${h} h ${min} min`;
  if (h) return `${h} h`;
  return `${min} min`;
}

function periodLabel(key: string) {
  if (/^\d{4}-\d{2}$/.test(key)) {
    const [y, m] = key.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  }
  const d = new Date(`${key}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function todayIST(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

export function TaskDetailClient({ initialTask, meId }: { initialTask: Task; meId: string }) {
  const router = useRouter();
  const [task, setTask] = useState<Task>(initialTask);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logMinutes, setLogMinutes] = useState("30");
  const [logNote, setLogNote] = useState("");
  const [logDate, setLogDate] = useState(todayIST());
  const [logFile, setLogFile] = useState<File | null>(null);
  const [clearTarget, setClearTarget] = useState<TaskLog | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const flash = (ok: boolean, text: string) => {
    setMsg(ok ? text : null);
    setErr(ok ? null : text);
    setTimeout(() => {
      setMsg(null);
      setErr(null);
    }, 5000);
  };

  const loadMeta = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([
        fetch(apiPath(`/api/tasks/${initialTask.id}/stats`), { cache: "no-store" }),
        fetch(apiPath(`/api/tasks/${initialTask.id}/audit?limit=50`), { cache: "no-store" }),
      ]);
      if (s.ok) setStats(await s.json());
      if (a.ok) {
        const d = await a.json();
        setAudit(d.events ?? []);
      }
    } catch {
      /* best-effort */
    }
  }, [initialTask.id]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const hasPdfOnCurrent = (task.currentLog?.attachments?.length ?? 0) > 0;

  async function postLog(status: string, minutes = 0, note = "", date?: string, file?: File | null) {
    setBusy(true);
    try {
      let res: Response;
      if (status === "COMPLETED" && file) {
        const fd = new FormData();
        fd.set("status", status);
        fd.set("minutes", String(minutes));
        fd.set("note", note);
        if (date) fd.set("date", date);
        fd.set("file", file);
        res = await fetch(apiPath(`/api/tasks/${task.id}/log`), {
          method: "POST",
          body: fd,
        });
      } else {
        res = await fetch(apiPath(`/api/tasks/${task.id}/log`), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status, minutes, note, date: date || undefined }),
        });
      }
      const d = await res.json();
      if (!res.ok) {
        if (d?.error === "pdf_required") {
          flash(false, "PDF required to close this day (max 1 MB).");
        } else {
          flash(false, d?.error ?? "Could not save log");
        }
        return false;
      }
      const log = d.log as TaskLog;
      setTask((t) => {
        const others = t.logs.filter((l) => !(l.periodKey === log.periodKey && l.userId === log.userId));
        const nextLogs = [log, ...others];
        const currentLog =
          log.periodKey === t.currentPeriod && log.userId === meId ? log : t.currentLog;
        return { ...t, logs: nextLogs, currentLog };
      });
      flash(
        true,
        status === "COMPLETED"
          ? `Closed ${date || log.periodKey}${date && date !== todayIST() ? " (past date)" : ""}`
          : "Updated"
      );
      loadMeta();
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function clearLog(log: TaskLog) {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      params.set("periodKey", log.periodKey);
      const res = await fetch(apiPath(`/api/tasks/${task.id}/log?${params}`), {
        method: "DELETE",
      });
      if (!res.ok) {
        flash(false, "Could not clear log");
        return;
      }
      const d = await res.json();
      const cleared = d.log as TaskLog;
      setTask((t) => ({
        ...t,
        currentLog:
          t.currentLog && t.currentLog.id === cleared.id ? cleared : t.currentLog,
        logs: t.logs.map((l) => (l.id === cleared.id ? cleared : l)),
      }));
      flash(true, `Cleared ${log.periodKey}`);
      loadMeta();
      router.refresh();
    } finally {
      setBusy(false);
      setClearTarget(null);
    }
  }

  async function saveEdit() {
    if (!editTitle.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(apiPath(`/api/tasks/${task.id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim(), description: editDesc }),
      });
      if (!res.ok) {
        flash(false, "Save failed");
        return;
      }
      setEditOpen(false);
      flash(true, "Task updated");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const top = useMemo(() => {
    if (!stats) return [];
    return [
      { label: "Days worked", value: String(stats.daysWorked), tone: "text-primary" },
      { label: "Days missed", value: String(stats.daysMissed), tone: "text-destructive" },
      { label: "Hours logged", value: stats.totalMinutesLabel || fmtMinutes(stats.totalMinutes), tone: "" },
      { label: "Pending now", value: String(stats.daysPending), tone: "text-amber-600" },
    ];
  }, [stats]);

  const status = task.currentLog?.status ?? "PENDING";

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

      <div className="flex flex-wrap items-center gap-2">
        <Link href={apiPath("/tasks")} className="text-sm text-primary hover:underline">
          ← My Tasks
        </Link>
        <Link
          href={apiPath(`/tasks/${task.id}/calendar`)}
          className="iipe-btn !py-1.5 text-xs"
        >
          <CalendarDays className="mr-1 inline h-3.5 w-3.5" /> Calendar
        </Link>
        <Link href={apiPath("/tasks/monitor")} className="iipe-btn !py-1.5 text-xs">
          <BarChart3 className="mr-1 inline h-3.5 w-3.5" /> My monitor
        </Link>
        {task.isCreator && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditTitle(task.title);
              setEditDesc(task.description ?? "");
              setEditOpen(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-semibold">{task.title}</p>
          <Badge variant="outline">{task.scheduleText}</Badge>
          <Badge variant={STATUS_BADGE[status] ?? "outline"}>{STATUS_LABEL[status] ?? status}</Badge>
          {!task.active && <Badge variant="secondary">Paused</Badge>}
        </div>
        {task.description && (
          <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Period {task.currentPeriod}
          {task.reminderEnabled ? ` · reminder ${task.reminderTime ?? "09:00"} IST` : " · reminders off"}
          {(task.participants?.length ?? 0) > 0 && (
            <>
              {" · "}
              <Users className="mr-0.5 inline h-3 w-3" />
              {task.participants.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ", "}
                  <span className={p.id === meId ? "font-medium text-foreground" : ""}>
                    {p.id === meId ? "You" : p.name}
                  </span>
                </span>
              ))}
            </>
          )}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {task.active && (
            <>
              <Button size="sm" onClick={() => { setLogDate(todayIST()); setLogFile(null); setLogOpen(true); }}>
                <Clock className="mr-1 h-3 w-3" /> Log / close day
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  // Closing always goes through the dialog so the PDF can be attached.
                  setLogDate(todayIST());
                  setLogFile(null);
                  setLogOpen(true);
                }}
                title="Requires a PDF (max 1 MB)"
              >
                <CheckCircle2 className="mr-1 h-3 w-3" /> Done
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => postLog("SKIPPED")}
              >
                <SkipForward className="mr-1 h-3 w-3" /> Skip
              </Button>
            </>
          )}
        </div>
        {!hasPdfOnCurrent && status === "PENDING" && (
          <p className="mt-2 text-xs text-amber-700">
            Closing this day requires a proof PDF ≤ 1 MB.
          </p>
        )}
      </div>

      {stats && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {top.map((s) => (
            <div key={s.label} className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`mt-1 text-2xl font-bold ${s.tone}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {stats && stats.missedDates.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">Missed scheduled days</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {stats.missedDates.slice(-30).map((d) => (
              <span
                key={d}
                className="rounded border bg-card px-1.5 py-0.5 text-xs text-muted-foreground"
              >
                {d}
              </span>
            ))}
            {stats.missedDates.length > 30 && (
              <span className="text-xs text-muted-foreground">
                +{stats.missedDates.length - 30} more
              </span>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <History className="h-4 w-4" /> History ({task.logs.length})
          </p>
          <Link
            href={apiPath(`/tasks/${task.id}/calendar`)}
            className="text-xs text-primary hover:underline"
          >
            Open calendar →
          </Link>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 font-medium">Period</th>
                <th className="px-2 py-1.5 font-medium">Who</th>
                <th className="px-2 py-1.5 font-medium">Status</th>
                <th className="px-2 py-1.5 font-medium">Time</th>
                <th className="px-2 py-1.5 font-medium">Logged</th>
                <th className="px-2 py-1.5 font-medium">Comment</th>
                <th className="px-2 py-1.5 font-medium">PDF</th>
                <th className="px-2 py-1.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {task.logs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-2 py-2 text-muted-foreground">
                    No history yet.
                  </td>
                </tr>
              )}
              {task.logs.map((l) => {
                const atts = l.attachments ?? [];
                const open = expandedId === l.id;
                return (
                  <Fragment key={l.id}>
                    <tr className="border-t">
                      <td className="whitespace-nowrap px-2 py-1.5">{periodLabel(l.periodKey)}</td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        {l.userId === meId ? "You" : l.user?.name ?? "—"}
                      </td>
                      <td className="px-2 py-1.5">
                        <Badge variant={STATUS_BADGE[l.status] ?? "outline"}>
                          {STATUS_LABEL[l.status] ?? l.status}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        {l.status === "COMPLETED" ? fmtMinutes(l.minutes) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                        {l.loggedAt
                          ? new Date(l.loggedAt).toLocaleString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "Asia/Kolkata",
                            })
                          : "—"}
                      </td>
                      <td className="max-w-[200px] px-2 py-1.5 text-muted-foreground">
                        {l.note ?? "—"}
                      </td>
                      <td className="px-2 py-1.5">
                        {atts.length ? (
                          atts.map((a) => (
                            <a
                              key={a.id}
                              href={apiPath(`/api/tasks/${task.id}/attachments/${a.id}`)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 text-primary hover:underline"
                              title={`${a.name} (${Math.round(a.size / 1024)} KB)`}
                            >
                              <FileText className="h-3 w-3" /> PDF
                            </a>
                          ))
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={() => setExpandedId(open ? null : l.id)}
                        >
                          {open ? "Hide" : "Details"}
                        </button>
                        {l.userId === meId && l.status !== "PENDING" && (
                          <button
                            type="button"
                            className="ml-2 text-destructive hover:underline"
                            onClick={() => setClearTarget(l)}
                          >
                            Clear
                          </button>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-t bg-muted/20">
                        <td colSpan={8} className="px-3 py-2 text-xs text-muted-foreground">
                          <p>
                            <span className="font-medium text-foreground">Comment:</span>{" "}
                            {l.note || "—"}
                          </p>
                          <p className="mt-1">
                            <span className="font-medium text-foreground">Work day:</span>{" "}
                            {l.logDate ? l.logDate.slice(0, 10) : "—"} ·{" "}
                            <span className="font-medium text-foreground">Period:</span> {l.periodKey}
                          </p>
                          {atts.length > 0 && (
                            <p className="mt-1">
                              <span className="font-medium text-foreground">Proof:</span>{" "}
                              {atts.map((a) => (
                                <a
                                  key={a.id}
                                  href={apiPath(`/api/tasks/${task.id}/attachments/${a.id}`)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mr-2 inline-flex items-center gap-0.5 text-primary hover:underline"
                                >
                                  <Download className="h-3 w-3" /> {a.name} (
                                  {Math.round(a.size / 1024)} KB)
                                </a>
                              ))}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <p className="mb-2 text-sm font-semibold">Audit trail — who updated what, when</p>
        {audit.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events yet.</p>
        ) : (
          <ul className="space-y-2">
            {audit.map((e) => (
              <li key={e.id} className="rounded-md border px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{e.type}</Badge>
                  <span className="font-medium">{e.user?.name ?? "—"}</span>
                  <span className="text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Kolkata",
                    })}
                  </span>
                  {e.periodKey && (
                    <span className="rounded border px-1 text-muted-foreground">{e.periodKey}</span>
                  )}
                </div>
                <p className="mt-1 text-muted-foreground">{e.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Log / close day dialog — PDF mandatory when completing. */}
      <Dialog open={logOpen} onOpenChange={(o) => !o && setLogOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log time — {task.title}</DialogTitle>
            <DialogDescription>
              Closing a day requires a proof PDF (max 1 MB). Sunday and past dates are allowed with a comment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="td-date">Date</Label>
              <Input
                id="td-date"
                type="date"
                max={todayIST()}
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {logDate === todayIST()
                  ? `Today — period ${task.currentPeriod}`
                  : "Past date — the comment explains what was done then."}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="td-min">Minutes</Label>
              <Input
                id="td-min"
                type="number"
                min={0}
                max={1440}
                value={logMinutes}
                onChange={(e) => setLogMinutes(e.target.value)}
              />
              <div className="flex flex-wrap gap-1.5">
                {[15, 30, 60, 120].map((m) => (
                  <Button
                    key={m}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setLogMinutes(String(m))}
                  >
                    {m} min
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="td-note">
                Comment {logDate !== todayIST() ? "(required for past dates)" : "(optional)"}
              </Label>
              <Textarea
                id="td-note"
                rows={2}
                value={logNote}
                onChange={(e) => setLogNote(e.target.value)}
                placeholder="What did you do?"
              />
            </div>
            <div className="space-y-2 rounded-lg border border-dashed p-3">
              <Label htmlFor="td-pdf">Proof PDF (required to close) — max 1 MB</Label>
              <Input
                id="td-pdf"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f && f.size > 1024 * 1024) {
                    flash(false, "PDF must be 1 MB or smaller.");
                    e.target.value = "";
                    setLogFile(null);
                    return;
                  }
                  if (f && f.type && f.type !== "application/pdf") {
                    flash(false, "Only PDF files are allowed.");
                    e.target.value = "";
                    setLogFile(null);
                    return;
                  }
                  setLogFile(f);
                }}
              />
              {logFile && (
                <p className="text-xs text-muted-foreground">
                  {logFile.name} · {Math.round(logFile.size / 1024)} KB
                </p>
              )}
              {hasPdfOnCurrent && !logFile && (
                <p className="text-xs text-muted-foreground">
                  A PDF is already on this period — replace it by choosing a new file.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (logDate !== todayIST() && !logNote.trim()) {
                  flash(false, "Add a comment explaining the past-date entry.");
                  return;
                }
                if (!logFile && !hasPdfOnCurrent) {
                  flash(false, "Attach a PDF (max 1 MB) to close this day.");
                  return;
                }
                const ok = await postLog(
                  "COMPLETED",
                  Number(logMinutes) || 0,
                  logNote,
                  logDate,
                  logFile
                );
                if (ok) {
                  setLogOpen(false);
                  setLogFile(null);
                  setLogNote("");
                }
              }}
            >
              {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Save &amp; close day
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={(o) => !o && setEditOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit task</DialogTitle>
            <DialogDescription>Title and description. Schedule edits stay on the list page.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="ed-t">Title</Label>
              <Input id="ed-t" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ed-d">Description</Label>
              <Textarea
                id="ed-d"
                rows={3}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={busy || !editTitle.trim()}>
              {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={clearTarget !== null}
        onOpenChange={(o) => !o && setClearTarget(null)}
        title="Clear this log?"
        description={
          clearTarget
            ? `This resets ${clearTarget.periodKey} to Pending and removes its PDF and comment.`
            : ""
        }
        confirmLabel="Clear"
        destructive
        busy={busy}
        onConfirm={async () => {
          if (clearTarget) await clearLog(clearTarget);
        }}
      />
    </div>
  );
}
