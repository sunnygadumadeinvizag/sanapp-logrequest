"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath } from "sanapp-common-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Pencil,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  SkipForward,
  ChevronDown,
  ChevronRight,
  History,
} from "lucide-react";

type TaskLog = {
  id: string;
  periodKey: string;
  status: string;
  minutes: number;
  note: string | null;
  loggedAt: string | null;
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  recurrence: string;
  weekday: number | null;
  dayOfMonth: number | null;
  reminderEnabled: boolean;
  reminderTime?: string | null;
  active: boolean;
  createdAt: string;
  currentLog: TaskLog | null;
  logs: TaskLog[];
};

const REC_LABELS: Record<string, string> = { DAILY: "Daily", WEEKLY: "Weekly", MONTHLY: "Monthly" };
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
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

function scheduleText(t: Task) {
  if (t.recurrence === "DAILY") return "Every day";
  if (t.recurrence === "WEEKLY") return `Every ${DAY_NAMES[t.weekday ?? 1] ?? "Monday"}`;
  return `Every month on day ${t.dayOfMonth ?? 1}`;
}

function fmtMinutes(m: number) {
  if (!m) return "0 min";
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h && min) return `${h} h ${min} min`;
  if (h) return `${h} h`;
  return `${min} min`;
}

function periodLabel(key: string) {
  // DAILY: YYYY-MM-DD, WEEKLY: YYYY-MM-DD (week start), MONTHLY: YYYY-MM
  if (/^\d{4}-\d{2}$/.test(key)) {
    const [y, m] = key.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  }
  const d = new Date(`${key}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function TasksClient({ initialTasks }: { initialTasks: Task[] }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Task | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Log dialog state
  const [logTarget, setLogTarget] = useState<Task | null>(null);
  const [logMinutes, setLogMinutes] = useState("30");
  const [logNote, setLogNote] = useState("");

  // Edit dialog state
  const [editTarget, setEditTarget] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editRecurrence, setEditRecurrence] = useState("DAILY");
  const [editWeekday, setEditWeekday] = useState("1");
  const [editDayOfMonth, setEditDayOfMonth] = useState("1");
  const [editReminder, setEditReminder] = useState(true);
  const [editReminderTime, setEditReminderTime] = useState("09:00");

  const flash = (ok: boolean, text: string) => {
    setMsg(ok ? text : null);
    setErr(ok ? null : text);
    setTimeout(() => {
      setMsg(null);
      setErr(null);
    }, 4000);
  };

  async function postLog(task: Task, status: string, minutes = 0, note = "") {
    setBusyId(task.id);
    try {
      const res = await fetch(apiPath(`/api/tasks/${task.id}/log`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, minutes, note }),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(false, d?.error ?? "Could not save log");
        return;
      }
      setTasks((ts) =>
        ts.map((t) =>
          t.id === task.id
            ? {
                ...t,
                currentLog: {
                  id: d.log.id,
                  periodKey: d.log.periodKey,
                  status: d.log.status,
                  minutes: d.log.minutes,
                  note: d.log.note,
                  loggedAt: d.log.loggedAt,
                },
                logs: [
                  {
                    id: d.log.id,
                    periodKey: d.log.periodKey,
                    status: d.log.status,
                    minutes: d.log.minutes,
                    note: d.log.note,
                    loggedAt: d.log.loggedAt,
                  },
                  ...t.logs.filter((l) => l.periodKey !== d.log.periodKey),
                ],
              }
            : t
        )
      );
      flash(true, status === "COMPLETED" ? "Task logged for this period" : "Updated");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function removeTask(task: Task, hard: boolean) {
    setBusyId(task.id);
    try {
      await fetch(apiPath(`/api/tasks/${task.id}${hard ? "?hard=1" : ""}`), { method: "DELETE" });
      if (hard) setTasks((ts) => ts.filter((t) => t.id !== task.id));
      else setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, active: false } : t)));
      flash(true, hard ? "Task deleted" : "Task paused");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(task: Task) {
    setBusyId(task.id);
    try {
      await fetch(apiPath(`/api/tasks/${task.id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !task.active }),
      });
      setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, active: !t.active } : t)));
      flash(true, task.active ? "Task paused" : "Task resumed");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit() {
    if (!editTarget || !editTitle.trim()) return;
    setBusyId(editTarget.id);
    try {
      const res = await fetch(apiPath(`/api/tasks/${editTarget.id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDesc,
          recurrence: editRecurrence,
          weekday: Number(editWeekday),
          dayOfMonth: Number(editDayOfMonth),
          reminderEnabled: editReminder,
          reminderTime: editReminder ? editReminderTime : null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(false, d?.error ?? "Save failed");
        return;
      }
      setTasks((ts) =>
        ts.map((t) =>
          t.id === editTarget.id
            ? {
                ...t,
                title: editTitle.trim(),
                description: editDesc || null,
                recurrence: editRecurrence,
                weekday: editRecurrence === "WEEKLY" ? Number(editWeekday) : null,
                dayOfMonth: editRecurrence === "MONTHLY" ? Number(editDayOfMonth) : null,
                reminderEnabled: editReminder,
                reminderTime: editReminder ? editReminderTime : null,
              }
            : t
        )
      );
      setEditTarget(null);
      flash(true, "Task updated");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  function openLog(t: Task) {
    setLogTarget(t);
    setLogMinutes("30");
    setLogNote(t.currentLog?.note ?? "");
  }

  function openEdit(t: Task) {
    setEditTarget(t);
    setEditTitle(t.title);
    setEditDesc(t.description ?? "");
    setEditRecurrence(t.recurrence);
    setEditWeekday(String(t.weekday ?? 1));
    setEditDayOfMonth(String(t.dayOfMonth ?? 1));
    setEditReminder(t.reminderEnabled);
    setEditReminderTime(t.reminderTime ?? "09:00");
  }

  const totalThisPeriod = tasks.reduce((s, t) => s + (t.currentLog?.minutes ?? 0), 0);

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

      {tasks.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Time logged this period across all tasks:{" "}
          <span className="font-semibold text-foreground">{fmtMinutes(totalThisPeriod)}</span>
        </p>
      )}

      {tasks.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          No recurring tasks yet. Create your first daily, weekly or monthly task.
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => {
            const status = t.currentLog?.status ?? "PENDING";
            const expanded = expandedId === t.id;
            return (
              <div
                key={t.id}
                className={`rounded-lg border bg-card p-4 ${t.active ? "" : "opacity-70"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{t.title}</p>
                      <Badge variant="outline">{REC_LABELS[t.recurrence] ?? t.recurrence}</Badge>
                      <Badge variant={STATUS_BADGE[status] ?? "outline"}>
                        {STATUS_LABEL[status] ?? status}
                      </Badge>
                      {!t.active && <Badge variant="secondary">Paused</Badge>}
                      {t.currentLog?.minutes ? (
                        <span className="text-xs text-muted-foreground">
                          {t.currentLog.minutes} min logged
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {scheduleText(t)}
                      {t.currentLog?.periodKey ? ` · period ${t.currentLog.periodKey}` : ""}
                      {t.reminderEnabled
                        ? ` · reminder at ${t.reminderTime ?? "09:00"} IST`
                        : " · reminders off"}
                    </p>
                    {t.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
                    )}

                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : t.id)}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      aria-expanded={expanded}
                    >
                      {expanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      <History className="h-3.5 w-3.5" />
                      History ({t.logs.length})
                    </button>

                    {expanded && (
                      <div className="mt-2 overflow-x-auto rounded-md border">
                        <table className="w-full min-w-[420px] text-left text-xs">
                          <thead className="bg-muted/40 text-muted-foreground">
                            <tr>
                              <th className="px-2 py-1.5 font-medium">Period</th>
                              <th className="px-2 py-1.5 font-medium">Status</th>
                              <th className="px-2 py-1.5 font-medium">Time</th>
                              <th className="px-2 py-1.5 font-medium">Logged</th>
                              <th className="px-2 py-1.5 font-medium">Note</th>
                            </tr>
                          </thead>
                          <tbody>
                            {t.logs.length === 0 && (
                              <tr>
                                <td colSpan={5} className="px-2 py-2 text-muted-foreground">
                                  No history yet.
                                </td>
                              </tr>
                            )}
                            {t.logs.map((l) => (
                              <tr key={l.id} className="border-t">
                                <td className="whitespace-nowrap px-2 py-1.5">{periodLabel(l.periodKey)}</td>
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
                                <td className="max-w-[220px] px-2 py-1.5 text-muted-foreground">
                                  {l.note ?? "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {t.active && status === "PENDING" && (
                      <>
                        <Button size="sm" onClick={() => openLog(t)} disabled={busyId === t.id}>
                          <Clock className="mr-1 h-3 w-3" /> Log time
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => postLog(t, "COMPLETED", 0, "Completed")}
                          disabled={busyId === t.id}
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" /> Done
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => postLog(t, "SKIPPED")}
                          disabled={busyId === t.id}
                          title="Skip this period"
                        >
                          <SkipForward className="mr-1 h-3 w-3" /> Skip
                        </Button>
                      </>
                    )}
                    {t.active && (status === "COMPLETED" || status === "SKIPPED") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => postLog(t, "PENDING")}
                        disabled={busyId === t.id}
                        title="Reopen this period"
                      >
                        Reopen
                      </Button>
                    )}
                    {!t.active && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleActive(t)}
                        disabled={busyId === t.id}
                        title="Resume this task"
                      >
                        Resume
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => openEdit(t)} title="Edit task">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRemoveTarget(t)}
                      title={t.active ? "Pause task" : "Delete task"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Log time dialog */}
      <Dialog open={logTarget !== null} onOpenChange={(o) => !o && setLogTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log time — {logTarget?.title}</DialogTitle>
            <DialogDescription>
              Record minutes spent on this task for the current period ({logTarget?.currentLog?.periodKey ?? "now"}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="log-minutes">Minutes</Label>
              <Input
                id="log-minutes"
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
              <Label htmlFor="log-note">Note (optional)</Label>
              <Textarea
                id="log-note"
                rows={2}
                value={logNote}
                onChange={(e) => setLogNote(e.target.value)}
                placeholder="What did you do?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogTarget(null)} disabled={busyId === logTarget?.id}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!logTarget) return;
                await postLog(logTarget, "COMPLETED", Number(logMinutes) || 0, logNote);
                setLogTarget(null);
              }}
              disabled={busyId === logTarget?.id}
            >
              {busyId === logTarget?.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Save &amp; complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editTarget !== null} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit task</DialogTitle>
            <DialogDescription>Update the title, schedule, description and reminder.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input id="edit-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Repeats</Label>
                <Select value={editRecurrence} onValueChange={setEditRecurrence}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAILY">Daily</SelectItem>
                    <SelectItem value="WEEKLY">Weekly</SelectItem>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editRecurrence === "WEEKLY" && (
                <div className="space-y-2">
                  <Label>Day of week</Label>
                  <Select value={editWeekday} onValueChange={setEditWeekday}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAY_NAMES.map((d, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {editRecurrence === "MONTHLY" && (
                <div className="space-y-2">
                  <Label htmlFor="edit-dom">Day of month (1–31)</Label>
                  <Input
                    id="edit-dom"
                    type="number"
                    min={1}
                    max={31}
                    value={editDayOfMonth}
                    onChange={(e) => setEditDayOfMonth(e.target.value)}
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea
                id="edit-desc"
                rows={3}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
              />
            </div>
            <div className="rounded-lg border p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Checkbox checked={editReminder} onCheckedChange={(v) => setEditReminder(v === true)} />
                Remind me when due
              </label>
              {editReminder && (
                <div className="mt-3 max-w-[12rem] space-y-1.5">
                  <Label htmlFor="edit-reminder-time">Reminder time (IST)</Label>
                  <Input
                    id="edit-reminder-time"
                    type="time"
                    value={editReminderTime}
                    onChange={(e) => setEditReminderTime(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={busyId === editTarget?.id}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={busyId === editTarget?.id || !editTitle.trim()}>
              {busyId === editTarget?.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove / delete confirmation */}
      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title={removeTarget?.active ? "Pause this task?" : "Delete this task permanently?"}
        description={
          removeTarget?.active
            ? "It will stop creating new periods. You can resume it later or delete it for good."
            : "This removes the task and all its history. This cannot be undone."
        }
        confirmLabel={removeTarget?.active ? "Pause" : "Delete"}
        destructive
        busy={busyId === removeTarget?.id}
        onConfirm={async () => {
          if (removeTarget) await removeTask(removeTarget, !removeTarget.active);
          setRemoveTarget(null);
        }}
      />
    </div>
  );
}
