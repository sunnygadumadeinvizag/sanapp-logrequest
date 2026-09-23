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
  Trash2,
  CheckCircle2,
  Clock,
  SkipForward,
  ChevronDown,
  ChevronRight,
  History,
  Users,
} from "lucide-react";

type Participant = { id: string; username: string; name: string };

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
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  recurrence: string;
  weekday: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  anchorMonth: number | null;
  specificDate: string | null;
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

const REC_LABELS: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  HALF_YEARLY: "Half-yearly",
  YEARLY: "Yearly",
  ONE_TIME: "One-time",
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
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function todayIST(): string {
  // YYYY-MM-DD of "now" in IST for the date input default.
  const ist = new Date(Date.now() + (5.5 * 60 * 60 * 1000));
  return ist.toISOString().slice(0, 10);
}

export function TasksClient({
  initialTasks,
  meId,
  users = [],
}: {
  initialTasks: Task[];
  meId: string;
  users?: { id: string; username: string; name: string; role: string }[];
}) {
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
  const [logDate, setLogDate] = useState(todayIST());

  // Edit dialog state
  const [editTarget, setEditTarget] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editRecurrence, setEditRecurrence] = useState("DAILY");
  const [editWeekday, setEditWeekday] = useState("1");
  const [editDayOfMonth, setEditDayOfMonth] = useState("1");
  const [editMonthOfYear, setEditMonthOfYear] = useState("1");
  const [editAnchorMonth, setEditAnchorMonth] = useState("1");
  const [editSpecificDate, setEditSpecificDate] = useState("");
  const [editReminder, setEditReminder] = useState(true);
  const [editReminderTime, setEditReminderTime] = useState("09:00");
  const [editAssignees, setEditAssignees] = useState<string[]>([]);

  const flash = (ok: boolean, text: string) => {
    setMsg(ok ? text : null);
    setErr(ok ? null : text);
    setTimeout(() => {
      setMsg(null);
      setErr(null);
    }, 4000);
  };

  function applyLog(taskId: string, log: TaskLog) {
    setTasks((ts) =>
      ts.map((t) => {
        if (t.id !== taskId) return t;
        const others = t.logs.filter(
          (l) => !(l.periodKey === log.periodKey && l.userId === log.userId)
        );
        const nextLogs = [log, ...others];
        const currentLog =
          log.periodKey === t.currentPeriod && log.userId === meId ? log : t.currentLog;
        return { ...t, logs: nextLogs, currentLog };
      })
    );
  }

  async function postLog(
    task: Task,
    status: string,
    minutes = 0,
    note = "",
    date?: string
  ) {
    setBusyId(task.id);
    try {
      const res = await fetch(apiPath(`/api/tasks/${task.id}/log`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, minutes, note, date: date || undefined }),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(false, d?.error ?? "Could not save log");
        return;
      }
      applyLog(task.id, d.log);
      flash(
        true,
        status === "COMPLETED"
          ? `Logged for ${d.log.periodKey}${date && date !== todayIST() ? " (past date)" : ""}`
          : "Updated"
      );
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
          monthOfYear: Number(editMonthOfYear),
          anchorMonth: Number(editAnchorMonth),
          specificDate: editSpecificDate || undefined,
          reminderEnabled: editReminder,
          reminderTime: editReminder ? editReminderTime : null,
          assigneeIds: editAssignees,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(false, d?.error ?? "Save failed");
        return;
      }
      setEditTarget(null);
      flash(true, "Task updated");
      router.refresh();
      // Re-pull the list so assignee/log changes are reflected.
      const list = await fetch(apiPath("/api/tasks"), { cache: "no-store" });
      if (list.ok) {
        const data = await list.json();
        if (Array.isArray(data.tasks)) setTasks(data.tasks);
      }
    } finally {
      setBusyId(null);
    }
  }

  function openLog(t: Task) {
    setLogTarget(t);
    setLogMinutes(String(t.currentLog?.minutes || 30));
    setLogNote(t.currentLog?.note ?? "");
    setLogDate(todayIST());
  }

  function openEdit(t: Task) {
    setEditTarget(t);
    setEditTitle(t.title);
    setEditDesc(t.description ?? "");
    setEditRecurrence(t.recurrence);
    setEditWeekday(String(t.weekday ?? 1));
    setEditDayOfMonth(String(t.dayOfMonth ?? 1));
    setEditMonthOfYear(String(t.monthOfYear ?? new Date().getMonth() + 1));
    setEditAnchorMonth(String(t.anchorMonth ?? new Date().getMonth() + 1));
    setEditSpecificDate(
      t.specificDate ? t.specificDate.slice(0, 10) : ""
    );
    setEditReminder(t.reminderEnabled);
    setEditReminderTime(t.reminderTime ?? "09:00");
    setEditAssignees(t.assignees.map((a) => a.id));
  }

  const totalThisPeriod = tasks.reduce((s, t) => s + (t.currentLog?.minutes ?? 0), 0);
  const canEditSchedule = (t: Task) => t.isCreator;

  const showDay = ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"].includes(editRecurrence);
  const MONTHS = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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
          Time you logged this period across all tasks:{" "}
          <span className="font-semibold text-foreground">{fmtMinutes(totalThisPeriod)}</span>
        </p>
      )}

      {tasks.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          No tasks yet. Create a daily, weekly, monthly, quarterly, half-yearly, yearly or one-time task.
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => {
            const status = t.currentLog?.status ?? "PENDING";
            const expanded = expandedId === t.id;
            // Current-period logs from every participant (for the team view).
            const currentPeriodLogs = t.logs.filter((l) => l.periodKey === t.currentPeriod);
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
                          you: {t.currentLog.minutes} min
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t.scheduleText}
                      {t.currentPeriod ? ` · period ${t.currentPeriod}` : ""}
                      {t.reminderEnabled
                        ? ` · reminder at ${t.reminderTime ?? "09:00"} IST`
                        : " · reminders off"}
                    </p>
                    {t.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
                    )}

                    {(t.participants?.length ?? 0) > 1 && (
                      <p className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {t.participants.map((p, i) => (
                          <span key={p.id}>
                            {i > 0 && ", "}
                            <span className={p.id === meId ? "font-medium text-foreground" : ""}>
                              {p.id === meId ? "You" : p.name}
                            </span>
                          </span>
                        ))}
                      </p>
                    )}

                    {/* Who has logged this period (team visibility). */}
                    {currentPeriodLogs.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {currentPeriodLogs.map((l) => (
                          <span
                            key={l.id}
                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                            title={l.note ?? undefined}
                          >
                            <span className="font-medium">
                              {l.userId === meId ? "You" : l.user?.name ?? "—"}
                            </span>
                            <Badge variant={STATUS_BADGE[l.status] ?? "outline"} className="px-1 py-0 text-[10px]">
                              {STATUS_LABEL[l.status] ?? l.status}
                            </Badge>
                            {l.status === "COMPLETED" && l.minutes > 0 && (
                              <span className="text-muted-foreground">{l.minutes}m</span>
                            )}
                          </span>
                        ))}
                      </div>
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
                        <table className="w-full min-w-[520px] text-left text-xs">
                          <thead className="bg-muted/40 text-muted-foreground">
                            <tr>
                              <th className="px-2 py-1.5 font-medium">Period</th>
                              <th className="px-2 py-1.5 font-medium">Who</th>
                              <th className="px-2 py-1.5 font-medium">Status</th>
                              <th className="px-2 py-1.5 font-medium">Time</th>
                              <th className="px-2 py-1.5 font-medium">Logged</th>
                              <th className="px-2 py-1.5 font-medium">Comment</th>
                            </tr>
                          </thead>
                          <tbody>
                            {t.logs.length === 0 && (
                              <tr>
                                <td colSpan={6} className="px-2 py-2 text-muted-foreground">
                                  No history yet.
                                </td>
                              </tr>
                            )}
                            {t.logs.map((l) => (
                              <tr key={l.id} className="border-t">
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
                    {t.active && (
                      <>
                        <Button size="sm" onClick={() => openLog(t)} disabled={busyId === t.id}>
                          <Clock className="mr-1 h-3 w-3" /> Log time
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => postLog(t, "COMPLETED", 0, "")}
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
                        title="Reopen this period for you"
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
                    {canEditSchedule(t) && (
                      <Button variant="ghost" size="sm" onClick={() => openEdit(t)} title="Edit task">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {t.isCreator && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRemoveTarget(t)}
                        title={t.active ? "Pause task" : "Delete task"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Log time dialog — supports past dates (backfill with a comment). */}
      <Dialog open={logTarget !== null} onOpenChange={(o) => !o && setLogTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log time — {logTarget?.title}</DialogTitle>
            <DialogDescription>
              Record minutes and a comment. You can pick a past date to backfill work you missed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="log-date">Date</Label>
              <Input
                id="log-date"
                type="date"
                max={todayIST()}
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {logDate === todayIST()
                  ? `Today — maps to period ${logTarget?.currentPeriod ?? ""}`
                  : `Past date — the comment explains what was done then.`}
              </p>
            </div>
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
              <Label htmlFor="log-note">Comment {logDate !== todayIST() ? "(required for past dates)" : "(optional)"}</Label>
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
                if (logDate !== todayIST() && !logNote.trim()) {
                  flash(false, "Add a comment explaining the past-date entry.");
                  return;
                }
                await postLog(logTarget, "COMPLETED", Number(logMinutes) || 0, logNote, logDate);
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
            <DialogDescription>Update the title, schedule, assignees and reminder.</DialogDescription>
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
                    {Object.entries(REC_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
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
              {editRecurrence === "ONE_TIME" && (
                <div className="space-y-2">
                  <Label htmlFor="edit-specific">Due date</Label>
                  <Input
                    id="edit-specific"
                    type="date"
                    value={editSpecificDate}
                    onChange={(e) => setEditSpecificDate(e.target.value)}
                  />
                </div>
              )}
              {showDay && (
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
              {editRecurrence === "YEARLY" && (
                <div className="space-y-2">
                  <Label>Month</Label>
                  <Select value={editMonthOfYear} onValueChange={setEditMonthOfYear}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.slice(1).map((m, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {(editRecurrence === "QUARTERLY" || editRecurrence === "HALF_YEARLY") && (
                <div className="space-y-2">
                  <Label>Cycle starts in</Label>
                  <Select value={editAnchorMonth} onValueChange={setEditAnchorMonth}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.slice(1).map((m, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
              <Label className="text-sm font-medium">Assign to</Label>
              <p className="mb-2 text-xs text-muted-foreground">
                Assigned people can each log time and comments for this task.
              </p>
              {users.filter((u) => u.id !== meId).length === 0 ? (
                <p className="text-sm text-muted-foreground">No other users yet.</p>
              ) : (
                <div className="max-h-40 space-y-1.5 overflow-y-auto">
                  {users
                    .filter((u) => u.id !== meId)
                    .map((u) => (
                      <label
                        key={u.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm hover:bg-muted/40"
                      >
                        <Checkbox
                          checked={editAssignees.includes(u.id)}
                          onCheckedChange={() =>
                            setEditAssignees((ids) =>
                              ids.includes(u.id) ? ids.filter((x) => x !== u.id) : [...ids, u.id]
                            )
                          }
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {u.name}{" "}
                          <span className="text-xs text-muted-foreground">
                            (@{u.username} · {u.role})
                          </span>
                        </span>
                      </label>
                    ))}
                </div>
              )}
            </div>
            <div className="rounded-lg border p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Checkbox checked={editReminder} onCheckedChange={(v) => setEditReminder(v === true)} />
                Remind participants when due
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
