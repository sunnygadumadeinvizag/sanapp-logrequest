"use client";

import { useCallback, useEffect, useState } from "react";
import { apiPath } from "sanapp-common-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, RefreshCw, ChevronDown, ChevronRight, BellRing } from "lucide-react";

type Participant = { id: string; username: string; name: string; role?: string };

type AdminLog = {
  id: string;
  userId: string;
  user: Participant;
  periodKey: string;
  status: string;
  minutes: number;
  note: string | null;
  logDate: string | null;
  loggedAt: string | null;
};

type CurrentLog = {
  userId: string;
  user: Participant;
  status: string;
  minutes: number;
  note: string | null;
  logDate: string | null;
  loggedAt: string | null;
};

type AdminTask = {
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
  active: boolean;
  user: Participant;
  assignees: Participant[];
  currentPeriod: string;
  currentLogs: CurrentLog[];
  anyoneCompleted: boolean;
  completed: number;
  missed: number;
  totalMinutes: number;
  currentMinutes: number;
  logs: AdminLog[];
  createdAt: string;
};

type User = { id: string; username: string; name: string; role: string };
type UserSummary = {
  id: string;
  name: string;
  username: string;
  role: string;
  tasks: number;
  active: number;
  due: number;
  missed: number;
  completed: number;
  minutesThisPeriod: number;
  minutesTotal: number;
  lastLogAt: string | null;
};

const REC: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  HALF_YEARLY: "Half-yearly",
  YEARLY: "Yearly",
  ONE_TIME: "One-time",
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  COMPLETED: "Completed",
  MISSED: "Missed",
  SKIPPED: "Skipped",
};
const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "outline",
  COMPLETED: "default",
  MISSED: "destructive",
  SKIPPED: "secondary",
};

function fmtMinutes(m: number) {
  if (!m) return "0 min";
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h && min) return `${h} h ${min} min`;
  if (h) return `${h} h`;
  return `${min} min`;
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

export function AdminTasksClient() {
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [summaries, setSummaries] = useState<UserSummary[]>([]);
  const [totals, setTotals] = useState({
    tasks: 0,
    due: 0,
    missed: 0,
    completed: 0,
    inactive: 0,
    minutesThisPeriod: 0,
    activeUsers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [nudging, setNudging] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (userId) params.set("userId", userId);
      if (status) params.set("status", status);
      if (q) params.set("q", q);
      const res = await fetch(apiPath(`/api/admin/tasks?${params}`), { cache: "no-store" });
      const d = await res.json();
      setTasks(d.tasks ?? []);
      setUsers(d.users ?? []);
      setSummaries(d.userSummaries ?? []);
      setTotals(
        d.totals ?? {
          tasks: 0,
          due: 0,
          missed: 0,
          completed: 0,
          inactive: 0,
          minutesThisPeriod: 0,
          activeUsers: 0,
        }
      );
    } finally {
      setLoading(false);
    }
  }, [userId, status, q]);

  useEffect(() => {
    load();
  }, [load]);

  async function pushReminders() {
    setNudging(true);
    try {
      const res = await fetch(apiPath("/api/due"), { method: "POST" });
      const d = await res.json().catch(() => ({}));
      setMsg(
        d?.sent
          ? `Pushed ${d.sent} reminder${d.sent === 1 ? "" : "s"} for the tasks that are due.`
          : "No new reminders to push right now (everything due has already been reminded)."
      );
      setTimeout(() => setMsg(null), 5000);
      load();
    } finally {
      setNudging(false);
    }
  }

  async function pauseTask(t: AdminTask) {
    await fetch(apiPath(`/api/tasks/${t.id}`), { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total tasks</p>
          <p className="mt-1 text-2xl font-bold">{totals.tasks}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Due now</p>
          <p className="mt-1 text-2xl font-bold text-primary">{totals.due}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">With missed periods</p>
          <p className="mt-1 text-2xl font-bold text-destructive">{totals.missed}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Worked this period</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{totals.completed}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Time this period</p>
          <p className="mt-1 text-2xl font-bold">{fmtMinutes(totals.minutesThisPeriod)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search task title or person…"
            className="pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="h-9 w-full rounded-md border bg-background px-2 text-sm sm:w-auto"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        >
          <option value="">All users</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.username})
            </option>
          ))}
        </select>
        <select
          className="h-9 w-full rounded-md border bg-background px-2 text-sm sm:w-auto"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="due">Due now</option>
          <option value="missed">Missed</option>
          <option value="completed">Worked this period</option>
        </select>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
        </Button>
        <Button size="sm" onClick={pushReminders} disabled={nudging}>
          {nudging ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <BellRing className="mr-1 h-3.5 w-3.5" />
          )}
          Push due reminders
        </Button>
      </div>

      {/* Per-user roll-up */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-3 py-2 text-sm font-semibold">By person — who is actually working</div>
        {summaries.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No tasks yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Person</th>
                  <th className="px-3 py-2 font-medium">Tasks</th>
                  <th className="px-3 py-2 font-medium">Due</th>
                  <th className="px-3 py-2 font-medium">Missed</th>
                  <th className="px-3 py-2 font-medium">Completed periods</th>
                  <th className="px-3 py-2 font-medium">Time this period</th>
                  <th className="px-3 py-2 font-medium">Time all time</th>
                  <th className="px-3 py-2 font-medium">Last log</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="px-3 py-2">
                      <span className="font-medium">{u.name}</span>{" "}
                      <span className="text-xs text-muted-foreground">(@{u.username} · {u.role})</span>
                    </td>
                    <td className="px-3 py-2">{u.active}/{u.tasks}</td>
                    <td className="px-3 py-2 text-primary">{u.due}</td>
                    <td className="px-3 py-2 font-medium text-destructive">{u.missed}</td>
                    <td className="px-3 py-2 text-green-600">{u.completed}</td>
                    <td className="px-3 py-2">{fmtMinutes(u.minutesThisPeriod)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtMinutes(u.minutesTotal)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {fmtDate(u.lastLogAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-3 py-2 text-sm font-semibold">
          Tasks{status ? ` · ${STATUS_LABEL[status.toUpperCase()] ?? status}` : ""}
        </div>
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : tasks.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No tasks match.</p>
        ) : (
          <div className="divide-y">
            {tasks.map((t) => {
              const expanded = expandedId === t.id;
              const statuses = t.currentLogs.map((l) => l.status);
              const st = statuses.includes("COMPLETED")
                ? "COMPLETED"
                : statuses.includes("PENDING")
                  ? "PENDING"
                  : statuses.includes("MISSED")
                    ? "MISSED"
                    : statuses[0] ?? "PENDING";
              const assigneeNames = t.assignees.map((a) => a.name).join(", ");
              return (
                <div key={t.id} className="p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={apiPath(`/admin/tasks/${t.id}`)}
                          className="font-medium text-primary hover:underline"
                        >
                          {t.title}
                        </a>
                        <Badge variant="outline">{REC[t.recurrence] ?? t.recurrence}</Badge>
                        <Badge variant={STATUS_BADGE[st] ?? "outline"}>{STATUS_LABEL[st] ?? st}</Badge>
                        {!t.active && <Badge variant="secondary">Paused</Badge>}
                        <a
                          href={apiPath(`/admin/tasks/${t.id}`)}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Audit &amp; calendar →
                        </a>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        by {t.user.name} (@{t.user.username})
                        {assigneeNames ? ` · assigned: ${assigneeNames}` : " · personal"}
                        {` · ${t.scheduleText}`}
                        {` · period ${t.currentPeriod}`}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {`${t.completed} completed / ${t.missed} missed periods · ${fmtMinutes(t.totalMinutes)} total`}
                        {t.currentMinutes > 0 && ` · ${fmtMinutes(t.currentMinutes)} this period`}
                        {` · ${t.currentLogs.length} participant${t.currentLogs.length === 1 ? "" : "s"} logged this period`}
                      </p>

                      {/* Who logged this period — the core oversight view. */}
                      {t.currentLogs.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {t.currentLogs.map((l) => (
                            <span
                              key={l.userId}
                              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                              title={l.note ?? undefined}
                            >
                              <span className="font-medium">{l.user?.name ?? "—"}</span>
                              <Badge variant={STATUS_BADGE[l.status] ?? "outline"} className="px-1 py-0 text-[10px]">
                                {STATUS_LABEL[l.status] ?? l.status}
                              </Badge>
                              {l.minutes > 0 && (
                                <span className="text-muted-foreground">{l.minutes}m</span>
                              )}
                              {l.loggedAt && (
                                <span className="text-muted-foreground">{fmtDate(l.loggedAt)}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : t.id)}
                        className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        aria-expanded={expanded}
                      >
                        {expanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        Full log history ({t.logs.length})
                      </button>
                      {expanded && (
                        <div className="mt-2 overflow-x-auto rounded-md border">
                          <table className="w-full min-w-[560px] text-left text-xs">
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
                                  <td className="whitespace-nowrap px-2 py-1.5">{l.periodKey}</td>
                                  <td className="whitespace-nowrap px-2 py-1.5">{l.user?.name ?? "—"}</td>
                                  <td className="px-2 py-1.5">
                                    <Badge variant={STATUS_BADGE[l.status] ?? "outline"}>
                                      {STATUS_LABEL[l.status] ?? l.status}
                                    </Badge>
                                  </td>
                                  <td className="whitespace-nowrap px-2 py-1.5">
                                    {l.status === "COMPLETED" ? fmtMinutes(l.minutes) : "—"}
                                  </td>
                                  <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                                    {fmtDate(l.loggedAt)}
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
                    <div className="flex w-full shrink-0 gap-1 sm:w-auto">
                      <Button variant="ghost" size="sm" onClick={() => pauseTask(t)} disabled={!t.active}>
                        {t.active ? "Pause" : "Paused"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
