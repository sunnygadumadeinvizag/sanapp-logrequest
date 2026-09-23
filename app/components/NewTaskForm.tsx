"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath } from "sanapp-common-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const RECURRENCES: { value: string; label: string }[] = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "HALF_YEARLY", label: "Half-yearly" },
  { value: "YEARLY", label: "Yearly" },
  { value: "ONE_TIME", label: "One-time (specific date)" },
];

type UserOption = { id: string; username: string; name: string; role: string };

export function NewTaskForm({
  users,
  meId,
}: {
  users: UserOption[];
  meId: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [recurrence, setRecurrence] = useState("DAILY");
  const [weekday, setWeekday] = useState("1");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [monthOfYear, setMonthOfYear] = useState(String(new Date().getMonth() + 1));
  const [anchorMonth, setAnchorMonth] = useState(String(new Date().getMonth() + 1));
  const [specificDate, setSpecificDate] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [reminder, setReminder] = useState(true);
  const [reminderTime, setReminderTime] = useState("09:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const others = useMemo(() => users.filter((u) => u.id !== meId), [users, meId]);

  function toggleAssignee(id: string) {
    setAssigneeIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (recurrence === "ONE_TIME" && !specificDate) {
      setError("Pick the date this one-time task is due.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(apiPath("/api/tasks"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          recurrence,
          weekday: recurrence === "WEEKLY" ? Number(weekday) : undefined,
          dayOfMonth: ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"].includes(recurrence)
            ? Number(dayOfMonth)
            : undefined,
          monthOfYear: recurrence === "YEARLY" ? Number(monthOfYear) : undefined,
          anchorMonth:
            recurrence === "QUARTERLY" || recurrence === "HALF_YEARLY"
              ? Number(anchorMonth)
              : undefined,
          specificDate: recurrence === "ONE_TIME" ? specificDate : undefined,
          assigneeIds,
          reminderEnabled: reminder,
          reminderTime: reminder ? reminderTime : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Could not create the task.");
        return;
      }
      router.push("/tasks");
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const showDay = ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"].includes(recurrence);

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          placeholder="e.g. Daily backup, Quarterly audit, Yearly renewal"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="desc">Description</Label>
        <Textarea
          id="desc"
          rows={3}
          placeholder="Optional details about what this task involves"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Repeats</Label>
          <Select value={recurrence} onValueChange={setRecurrence}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RECURRENCES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {recurrence === "WEEKLY" && (
          <div className="space-y-1.5">
            <Label>Day of week</Label>
            <Select value={weekday} onValueChange={setWeekday}>
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

        {recurrence === "ONE_TIME" && (
          <div className="space-y-1.5">
            <Label htmlFor="specific-date">Due date *</Label>
            <Input
              id="specific-date"
              type="date"
              value={specificDate}
              onChange={(e) => setSpecificDate(e.target.value)}
            />
          </div>
        )}

        {showDay && (
          <div className="space-y-1.5">
            <Label htmlFor="dom">Day of month (1–31)</Label>
            <Input
              id="dom"
              type="number"
              min={1}
              max={31}
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)}
            />
          </div>
        )}

        {recurrence === "YEARLY" && (
          <div className="space-y-1.5">
            <Label>Month</Label>
            <Select value={monthOfYear} onValueChange={setMonthOfYear}>
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

        {(recurrence === "QUARTERLY" || recurrence === "HALF_YEARLY") && (
          <div className="space-y-1.5">
            <Label>Cycle starts in</Label>
            <Select value={anchorMonth} onValueChange={setAnchorMonth}>
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
            <p className="text-xs text-muted-foreground">
              {recurrence === "QUARTERLY"
                ? "Quarterly runs every 3 months from this month."
                : "Half-yearly runs every 6 months from this month."}
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg border p-3">
        <Label className="text-sm font-medium">Assign to</Label>
        <p className="mb-2 text-xs text-muted-foreground">
          Assigned people (and you, the creator) can each log time and comments for this task.
          Leave everyone unchecked to keep it a personal task.
        </p>
        {others.length === 0 ? (
          <p className="text-sm text-muted-foreground">No other users yet.</p>
        ) : (
          <div className="max-h-48 space-y-1.5 overflow-y-auto">
            {others.map((u) => (
              <label
                key={u.id}
                className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm hover:bg-muted/40"
              >
                <Checkbox
                  checked={assigneeIds.includes(u.id)}
                  onCheckedChange={() => toggleAssignee(u.id)}
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
        {assigneeIds.length > 0 && (
          <p className="mt-2 text-xs text-primary">
            {assigneeIds.length} assignee{assigneeIds.length === 1 ? "" : "s"} selected
          </p>
        )}
      </div>

      <div className="rounded-lg border p-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <Checkbox checked={reminder} onCheckedChange={(v) => setReminder(v === true)} />
          Remind participants when this task is due
        </label>
        {reminder && (
          <div className="mt-3 max-w-[12rem] space-y-1.5">
            <Label htmlFor="reminder-time">Reminder time (IST)</Label>
            <Input
              id="reminder-time"
              type="time"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The reminder appears in each participant&apos;s notification bell at this time.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create task
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
