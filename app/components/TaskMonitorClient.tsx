"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiPath } from "sanapp-common-ui";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

type SummaryRow = {
  taskId: string;
  title: string;
  scheduleText: string;
  recurrence: string;
  active: boolean;
  daysWorked: number;
  daysMissed: number;
  daysPending: number;
  totalMinutesLabel: string;
  missedDates: string[];
  currentStatus: string;
};

export function TaskMonitorClient() {
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const listRes = await fetch(apiPath("/api/tasks"), { cache: "no-store" });
      if (!listRes.ok) throw new Error("tasks");
      const list = await listRes.json();
      const tasks = (list.tasks ?? []) as {
        id: string;
        title: string;
        scheduleText: string;
        recurrence: string;
        active: boolean;
        currentLog?: { status: string } | null;
      }[];
      const summaries: SummaryRow[] = await Promise.all(
        tasks.map(async (t) => {
          const res = await fetch(apiPath(`/api/tasks/${t.id}/stats`), { cache: "no-store" });
          if (!res.ok) {
            return {
              taskId: t.id,
              title: t.title,
              scheduleText: t.scheduleText,
              recurrence: t.recurrence,
              active: t.active,
              daysWorked: 0,
              daysMissed: 0,
              daysPending: 0,
              totalMinutesLabel: "0m",
              missedDates: [],
              currentStatus: t.currentLog?.status ?? "PENDING",
            };
          }
          const s = await res.json();
          return {
            taskId: t.id,
            title: t.title,
            scheduleText: t.scheduleText,
            recurrence: t.recurrence,
            active: t.active,
            daysWorked: s.daysWorked,
            daysMissed: s.daysMissed,
            daysPending: s.daysPending,
            totalMinutesLabel: s.totalMinutesLabel ?? "0m",
            missedDates: s.missedDates ?? [],
            currentStatus: t.currentLog?.status ?? "PENDING",
          };
        })
      );
      setRows(summaries);
    } catch {
      setErr("Could not load monitor data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalWorked = rows.reduce((s, r) => s + r.daysWorked, 0);
  const totalMissed = rows.reduce((s, r) => s + r.daysMissed, 0);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your monitor…
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
        {err}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Days worked (all tasks)</p>
          <p className="mt-1 text-2xl font-bold text-primary">{totalWorked}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Days missed (all tasks)</p>
          <p className="mt-1 text-2xl font-bold text-destructive">{totalMissed}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Tasks tracked</p>
          <p className="mt-1 text-2xl font-bold">{rows.length}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          No tasks to monitor yet.{" "}
          <Link href={apiPath("/tasks/new")} className="text-primary underline">
            Create one
          </Link>
          .
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Task</th>
                <th className="px-3 py-2 font-medium">Schedule</th>
                <th className="px-3 py-2 font-medium">Worked</th>
                <th className="px-3 py-2 font-medium">Missed</th>
                <th className="px-3 py-2 font-medium">Hours</th>
                <th className="px-3 py-2 font-medium">Now</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.taskId} className="border-t">
                  <td className="px-3 py-2 font-medium">
                    <Link href={apiPath(`/tasks/${r.taskId}`)} className="text-primary hover:underline">
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.scheduleText}</td>
                  <td className="px-3 py-2">{r.daysWorked}</td>
                  <td className={`px-3 py-2 ${r.daysMissed ? "text-destructive font-medium" : ""}`}>
                    {r.daysMissed}
                  </td>
                  <td className="px-3 py-2">{r.totalMinutesLabel}</td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={
                        r.currentStatus === "COMPLETED"
                          ? "default"
                          : r.currentStatus === "MISSED"
                            ? "destructive"
                            : r.currentStatus === "SKIPPED"
                              ? "secondary"
                              : "outline"
                      }
                    >
                      {r.currentStatus}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    <Link href={apiPath(`/tasks/${r.taskId}/calendar`)} className="text-primary hover:underline">
                      Calendar
                    </Link>
                    <span className="mx-1 text-muted-foreground">·</span>
                    <Link href={apiPath(`/tasks/${r.taskId}`)} className="text-primary hover:underline">
                      Detail
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
