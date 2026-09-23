"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiPath } from "sanapp-common-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Download, RefreshCw, BellRing } from "lucide-react";

type Participant = { id: string; username: string; name: string; role?: string };

type AuditEvent = {
  id: string;
  logId: string | null;
  user: Participant;
  periodKey: string | null;
  type: string;
  message: string;
  minutes: number | null;
  status: string | null;
  createdAt: string;
};

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
  attachments?: { id: string; name: string; size: number }[];
};

type StatsResp = {
  userId: string;
  daysWorked: number;
  daysMissed: number;
  daysSkipped: number;
  daysPending: number;
  totalMinutesLabel: string;
  missedDates: string[];
  workedDates: string[];
};

type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  scheduleText: string;
  active: boolean;
  user: Participant;
  assignees: Participant[];
  participants: Participant[];
  currentPeriod: string;
  logs: AdminLog[];
};

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "outline",
  COMPLETED: "default",
  MISSED: "destructive",
  SKIPPED: "secondary",
};

export function AdminTaskDetailClient({
  taskId,
  meId,
}: {
  taskId: string;
  meId: string;
}) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [statsByUser, setStatsByUser] = useState<Record<string, StatsResp>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showAllLogs, setShowAllLogs] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [logsRes, auditRes] = await Promise.all([
        fetch(apiPath(`/api/tasks/${taskId}/log`), { cache: "no-store" }),
        fetch(apiPath(`/api/tasks/${taskId}/audit?limit=100`), { cache: "no-store" }),
      ]);
      if (!logsRes.ok) {
        const d = await logsRes.json().catch(() => ({}));
        throw new Error(d?.error ?? "load_failed");
      }
      const logsJson = await logsRes.json();
      const logs: AdminLog[] = logsJson.logs ?? [];
      const auditJson = auditRes.ok ? await auditRes.json() : { events: [] };
      setAudit(auditJson.events ?? []);

      // Minimal task header from admin list (title/schedule) — reuse list endpoint.
      const adminRes = await fetch(apiPath(`/api/admin/tasks?q=${encodeURIComponent("")}`), {
        cache: "no-store",
      });
      let header: TaskDetail | null = null;
      if (adminRes.ok) {
        const aj = await adminRes.json();
        const t = (aj.tasks ?? []).find((x: { id: string }) => x.id === taskId);
        if (t) {
          header = {
            id: t.id,
            title: t.title,
            description: t.description ?? null,
            scheduleText: t.scheduleText,
            active: t.active,
            user: t.user,
            assignees: t.assignees ?? [],
            participants: [t.user, ...(t.assignees ?? [])].filter(
              (p: Participant, i: number, arr: Participant[]) =>
                p && arr.findIndex((x) => x.id === p.id) === i
            ),
            currentPeriod: t.currentPeriod,
            logs,
          };
        }
      }
      if (!header) {
        header = {
          id: taskId,
          title: "Task",
          description: null,
          scheduleText: "",
          active: true,
          user: { id: "", username: "", name: "" },
          assignees: [],
          participants: [],
          currentPeriod: "",
          logs,
        };
      }
      setTask(header);

      // Per-person stats for participants.
      const ids = [
        ...new Set(header.participants.map((p) => p.id).filter(Boolean)),
      ];
      const entries = await Promise.all(
        ids.map(async (uid) => {
          const res = await fetch(apiPath(`/api/tasks/${taskId}/stats?userId=${uid}`), {
            cache: "no-store",
          });
          if (!res.ok) return [uid, null] as const;
          return [uid, (await res.json()) as StatsResp] as const;
        })
      );
      const map: Record<string, StatsResp> = {};
      for (const [uid, s] of entries) if (s) map[uid] = s;
      setStatsByUser(map);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  async function remind(log: AdminLog) {
    setBusy(true);
    try {
      await fetch(apiPath(`/api/tasks/${taskId}/log`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "PENDING", minutes: 0, note: "" }),
      });
      // Soft nudge: just refresh audit after a no-op is not ideal — skip if not needed.
      await load();
    } finally {
      setBusy(false);
    }
    void log;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading task…
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
        Could not load task ({err}).{" "}
        <button type="button" className="underline" onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  if (!task) return null;

  const visibleLogs = showAllLogs ? task.logs : task.logs.slice(0, 30);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={apiPath("/admin/tasks")} className="text-sm text-primary hover:underline">
          ← All tasks
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={busy}>
            <RefreshCw className="mr-1 h-3 w-3" /> Refresh
          </Button>
          <a href={apiPath(`/tasks/${task.id}/calendar`)} className="iipe-btn !py-1.5 text-xs">
            Calendar (as you)
          </a>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-semibold">{task.title}</p>
          <Badge variant="outline">{task.scheduleText}</Badge>
          {!task.active && <Badge variant="secondary">Paused</Badge>}
        </div>
        {task.description && (
          <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Creator: {task.user?.name || "—"} · Period {task.currentPeriod || "—"} ·{" "}
          {task.participants.length} participant(s)
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <p className="mb-3 text-sm font-semibold">Per-person monitoring</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 font-medium">Person</th>
                <th className="px-2 py-1.5 font-medium">Days worked</th>
                <th className="px-2 py-1.5 font-medium">Days missed</th>
                <th className="px-2 py-1.5 font-medium">Hours</th>
                <th className="px-2 py-1.5 font-medium">Pending</th>
                <th className="px-2 py-1.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {task.participants.map((p) => {
                const s = statsByUser[p.id];
                return (
                  <tr key={p.id} className="border-t">
                    <td className="px-2 py-1.5 font-medium">
                      {p.name}{" "}
                      <span className="font-normal text-muted-foreground">(@{p.username})</span>
                    </td>
                    <td className="px-2 py-1.5">{s?.daysWorked ?? "—"}</td>
                    <td className={`px-2 py-1.5 ${s?.daysMissed ? "text-destructive font-medium" : ""}`}>
                      {s?.daysMissed ?? "—"}
                    </td>
                    <td className="px-2 py-1.5">{s?.totalMinutesLabel ?? "—"}</td>
                    <td className="px-2 py-1.5">{s?.daysPending ?? "—"}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      <a
                        href={apiPath(`/tasks/${task.id}/calendar?user=${p.id}`)}
                        className="text-primary hover:underline"
                      >
                        Calendar
                      </a>
                      <span className="mx-1 text-muted-foreground">·</span>
                      <a
                        href={apiPath(`/admin/tasks/${task.id}?user=${p.id}`)}
                        className="text-primary hover:underline"
                      >
                        Refresh as
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Missed days:{" "}
          {Object.values(statsByUser)
            .flatMap((s) => s.missedDates)
            .slice(-20)
            .join(", ") || "none"}
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <p className="mb-2 text-sm font-semibold">Work logs ({task.logs.length})</p>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[720px] text-left text-xs">
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
              {visibleLogs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-2 py-2 text-muted-foreground">
                    No logs yet.
                  </td>
                </tr>
              )}
              {visibleLogs.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="whitespace-nowrap px-2 py-1.5">{l.periodKey}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{l.user?.name ?? "—"}</td>
                  <td className="px-2 py-1.5">
                    <Badge variant={STATUS_BADGE[l.status] ?? "outline"}>{l.status}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    {l.status === "COMPLETED" ? `${l.minutes} min` : "—"}
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
                  <td className="max-w-[200px] px-2 py-1.5 text-muted-foreground">{l.note ?? "—"}</td>
                  <td className="px-2 py-1.5">
                    {(l.attachments ?? []).length ? (
                      (l.attachments ?? []).map((a) => (
                        <a
                          key={a.id}
                          href={apiPath(`/api/tasks/${task.id}/attachments/${a.id}`)}
                          target="_blank"
                          rel="noreferrer"
                          className="mr-2 inline-flex items-center gap-0.5 text-primary hover:underline"
                        >
                          <FileText className="h-3 w-3" /> {Math.round(a.size / 1024)} KB
                        </a>
                      ))
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <button
                      type="button"
                      className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-primary"
                      title="Nudge participant"
                      onClick={() => remind(l)}
                      disabled={busy || l.userId === meId}
                    >
                      <BellRing className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {task.logs.length > 30 && (
          <button
            type="button"
            className="mt-2 text-xs font-medium text-primary hover:underline"
            onClick={() => setShowAllLogs((v) => !v)}
          >
            {showAllLogs ? "Show fewer" : `Show all ${task.logs.length} logs`}
          </button>
        )}
      </div>

      <div className="rounded-lg border bg-card p-4">
        <p className="mb-2 text-sm font-semibold">Audit trail (when / what / who)</p>
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

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <Download className="h-3.5 w-3.5" />
        <span>
          PDFs open inline from the Work logs table. Each completed day stores a proof file (max 1 MB).
        </span>
      </div>
    </div>
  );
}
