"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath } from "sanapp-common-ui";
import { STATUS_LABELS, PRIORITY_LABELS, fmtMinutes } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Play,
  Square,
  Clock,
  Send,
  Paperclip,
  X,
  Check,
  Mail,
  MailOpen,
  History,
  ArrowRightLeft,
  MapPin,
  Dices,
  UserPlus,
  Users,
  Plus,
} from "lucide-react";

export type DetailData = {
  request: {
    id: string;
    requestId: string;
    status: string;
    priority: string;
    totalWorkMinutes: number;
    assignedPoc: { name: string; username: string } | null;
  };
  comments: { id: string; body: string; readByMe: boolean; user: { name: string; username: string }; createdAt: string }[];
  attachments: { id: string; name: string; mime: string; size: number }[];
  workLogs: {
    id: string;
    minutes: number;
    running: boolean;
    note: string | null;
    location: string | null;
    inCampus: boolean;
    startedAt: string;
    endedAt: string | null;
    poc: { name: string };
  }[];
};

type WorkerRow = { id: string; userId: string; username: string; name: string; primaryRole?: string };

type LogEntry = { from: string; to: string; location: string; inCampus: boolean };

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RequestDetailClient({
  data,
  me,
  role,
  pocOptions,
  workers,
  isWorker,
}: {
  data: DetailData;
  me: { username: string; name: string };
  role: "ADMIN" | "POC" | "USER";
  pocOptions: { id: string; name: string; username: string; primaryRole?: string }[];
  workers: WorkerRow[];
  isWorker: boolean;
}) {
  const router = useRouter();
  const { request } = data;
  const isPoc = role === "POC" || role === "ADMIN";
  const isAssignee = request.assignedPoc?.username === me.username;
  const canLogTime = isAssignee || isWorker;

  const [comments, setComments] = useState(data.comments);
  const [commentText, setCommentText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Work timer — server-driven (running workLog); we tick locally for display.
  const [running, setRunning] = useState<{ startedAt: string } | null>(
    data.workLogs.find((w) => w.running) ?? null
  );
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState("");
  const [location, setLocation] = useState("");
  const [inCampus, setInCampus] = useState(true);

  // Dialogs (shadcn) replace the old window.prompt() calls.
  const [logOpen, setLogOpen] = useState(false);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveRole, setMoveRole] = useState("");
  const [movePoc, setMovePoc] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [workerOpen, setWorkerOpen] = useState(false);
  const [workerRole, setWorkerRole] = useState("");
  const [workerUser, setWorkerUser] = useState("");

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(running.startedAt).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const flash = (ok: boolean, text: string) => {
    if (ok) {
      setMsg(text);
      setErr(null);
    } else {
      setErr(text);
      setMsg(null);
    }
    setTimeout(() => {
      setMsg(null);
      setErr(null);
    }, 5000);
  };

  async function postComment() {
    const text = commentText.trim();
    if (!text) return;
    setBusy(true);
    try {
      const res = await fetch(apiPath(`/api/requests/${request.id}/comments`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data2 = await res.json();
      if (!res.ok) {
        flash(false, data2?.error ?? "Could not post comment");
        return;
      }
      setComments((c) => [...c, data2.comment]);
      setCommentText("");
      flash(true, "Comment posted");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggleCommentRead(cid: string, read: boolean) {
    await fetch(apiPath(`/api/requests/${request.id}/comments/${cid}/read`), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ read }),
    });
    setComments((cs) => cs.map((c) => (c.id === cid ? { ...c, readByMe: read } : c)));
  }

  async function work(action: "start" | "stop") {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        action,
        note: note || undefined,
        location: location || undefined,
        inCampus,
      };
      const res = await fetch(apiPath(`/api/requests/${request.id}/work`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(false, d?.error === "already_working" ? "You are already working on another request." : d?.error ?? "Action failed");
        return;
      }
      if (action === "start") {
        setRunning({ startedAt: new Date().toISOString() });
        setElapsed(0);
        flash(true, "Timer started");
      } else if (action === "stop") {
        setRunning(null);
        flash(true, `Work logged: ${fmtMinutes(d.minutes ?? 0)}`);
      }
      setNote("");
      setLocation("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitLogEntries() {
    const valid = logEntries.filter((e) => e.from && e.to);
    if (valid.length === 0) {
      flash(false, "Add at least one from/to range.");
      return;
    }
    for (const e of valid) {
      if (new Date(e.to).getTime() <= new Date(e.from).getTime()) {
        flash(false, "In each range, 'to' must be after 'from'.");
        return;
      }
    }
    setBusy(true);
    try {
      const res = await fetch(apiPath(`/api/requests/${request.id}/work`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "log",
          note: note || undefined,
          entries: valid.map((e) => ({
            from: new Date(e.from).toISOString(),
            to: new Date(e.to).toISOString(),
            location: e.location || null,
            inCampus: e.inCampus,
          })),
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(false, d?.error ?? "Could not log time");
        return;
      }
      flash(true, `Logged ${fmtMinutes(d.minutes ?? 0)} across ${d.count ?? 1} session${(d.count ?? 1) > 1 ? "s" : ""}`);
      setLogOpen(false);
      setLogEntries([]);
      setNote("");
      setLocation("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(next: string) {
    setBusy(true);
    try {
      const res = await fetch(apiPath(`/api/requests/${request.id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(false, d?.error ?? "Status change failed");
        return;
      }
      flash(true, `Status → ${STATUS_LABELS[next] ?? next}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function confirmMove() {
    if (!movePoc) return;
    setBusy(true);
    try {
      const res = await fetch(apiPath(`/api/requests/${request.id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ moveToPocId: movePoc, moveReason: moveReason.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(false, d?.error ?? "Move failed");
        return;
      }
      flash(true, "Request moved");
      setMoveOpen(false);
      setMoveRole("");
      setMovePoc("");
      setMoveReason("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function randomAssign() {
    setBusy(true);
    try {
      const res = await fetch(apiPath(`/api/requests/${request.id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignRandomly: true, moveReason: "Random assignment" }),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(false, d?.error === "no_poc_available" ? "No other POC is available." : d?.error ?? "Random assign failed");
        return;
      }
      flash(true, `Assigned to ${d.request.assignedPoc?.name ?? "a POC"}`);
      setMoveOpen(false);
      setMoveRole("");
      setMovePoc("");
      setMoveReason("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addWorker() {
    if (!workerUser) return;
    setBusy(true);
    try {
      const res = await fetch(apiPath(`/api/requests/${request.id}/workers`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: workerUser }),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(false, d?.error ?? "Could not add co-worker");
        return;
      }
      flash(true, "Co-worker added");
      setWorkerOpen(false);
      setWorkerRole("");
      setWorkerUser("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeWorker(userId: string) {
    setBusy(true);
    try {
      await fetch(apiPath(`/api/requests/${request.id}/workers?userId=${userId}`), { method: "DELETE" });
      flash(true, "Co-worker removed");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function uploadAttachment(file: File) {
    if (file.size > 1024 * 1024) {
      flash(false, "File must be 1 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(apiPath(`/api/requests/${request.id}/attachments`), {
        method: "POST",
        body: fd,
      });
      const d = await res.json();
      if (!res.ok) {
        flash(false, d?.error === "unsupported_type" ? "Only images and PDF are allowed." : d?.error ?? "Upload failed");
        return;
      }
      flash(true, "Attachment uploaded");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const otherPocs = pocOptions.filter((p) => p.username !== me.username);
  const roles = Array.from(
    new Set(otherPocs.map((p) => p.primaryRole).filter(Boolean) as string[])
  ).sort();
  const roleFiltered = moveRole ? otherPocs.filter((p) => p.primaryRole === moveRole) : otherPocs;

  const workerRoles = Array.from(
    new Set(pocOptions.map((p) => p.primaryRole).filter(Boolean) as string[])
  ).sort();
  const workerFiltered = workerRole
    ? pocOptions.filter((p) => p.primaryRole === workerRole && p.username !== me.username && !workers.some((w) => w.userId === p.id))
    : [];

  function openLogDialog() {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 60000);
    setLogEntries([{ from: toLocalInput(from), to: toLocalInput(now), location: location, inCampus: true }]);
    setLogOpen(true);
  }

  return (
    <div className="space-y-4">
      {(msg || err) && (
        <div className={`rounded-md border px-3 py-2 text-sm ${err ? "border-red-300 bg-red-50 text-red-700" : "border-green-300 bg-green-50 text-green-700"}`}>
          {err ?? msg}
        </div>
      )}

      {/* Status / priority / POC actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{STATUS_LABELS[request.status] ?? request.status}</Badge>
        <Badge variant="secondary">{PRIORITY_LABELS[request.priority] ?? request.priority}</Badge>
        {request.assignedPoc && (
          <Badge variant="outline">POC: {request.assignedPoc.name}</Badge>
        )}
        <span className="text-xs text-muted-foreground">
          Work logged: {fmtMinutes(request.totalWorkMinutes)}
        </span>
      </div>

      {(canLogTime || isPoc) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">POC actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {canLogTime && (
            <div className="flex flex-wrap items-center gap-2">
              {running ? (
                <>
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Clock className="h-4 w-4 animate-pulse text-primary" />
                    Working… {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
                  </span>
                  <Button size="sm" onClick={() => work("stop")} disabled={busy}>
                    <Square className="mr-1 h-3 w-3" /> Stop & log
                  </Button>
                </>
              ) : (
                isAssignee && (
                  <Button size="sm" onClick={() => work("start")} disabled={busy}>
                    <Play className="mr-1 h-3 w-3" /> Start working
                  </Button>
                )
              )}
              <Button size="sm" variant="outline" onClick={openLogDialog} disabled={busy}>
                <Clock className="mr-1 h-3 w-3" /> Log time manually
              </Button>
              <Input
                placeholder="Note (optional)"
                className="h-8 w-44"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <Input
                placeholder="Location (e.g. Room 204, Site visit)"
                className="h-8 w-56"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox
                  checked={inCampus}
                  onCheckedChange={(v) => setInCampus(v === true)}
                />
                {inCampus ? "In campus" : "Outside campus"}
              </label>
            </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {request.status === "ASSIGNED" && isAssignee && (
                <Button size="sm" variant="secondary" onClick={() => changeStatus("IN_PROGRESS")} disabled={busy}>
                  Mark in progress
                </Button>
              )}
              {request.status === "IN_PROGRESS" && isAssignee && (
                <Button size="sm" variant="secondary" onClick={() => changeStatus("PENDING")} disabled={busy}>
                  Need more info
                </Button>
              )}
              {(request.status === "ASSIGNED" || request.status === "IN_PROGRESS" || request.status === "PENDING") && isAssignee && (
                <>
                  <Button size="sm" variant="secondary" onClick={() => changeStatus("RESOLVED")} disabled={busy}>
                    Mark resolved
                  </Button>
                  <Select
                    value={movePoc || undefined}
                    onValueChange={(v) => { setMoveRole(""); setMovePoc(v); setMoveReason(""); setMoveOpen(true); }}
                  >
                    <SelectTrigger className="h-8 w-52 text-xs">
                      <SelectValue placeholder="Move to another POC…" />
                    </SelectTrigger>
                    <SelectContent>
                      {otherPocs.length === 0 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">No other POCs available</div>
                      )}
                      {otherPocs.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}{p.primaryRole ? ` (${p.primaryRole.replace(/_/g, " ").toLowerCase()})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={randomAssign}
                    disabled={busy || otherPocs.length === 0}
                    title="Randomly assign among the eligible POCs"
                  >
                    <Dices className="mr-1 h-3 w-3" /> Random
                  </Button>
                </>
              )}
              {request.status === "RESOLVED" && (isPoc || isAssignee) && (
                <Button size="sm" onClick={() => changeStatus("CLOSED")} disabled={busy}>
                  Confirm & close
                </Button>
              )}
              {isAssignee && (
                <Button size="sm" variant="outline" onClick={() => { setWorkerRole(""); setWorkerUser(""); setWorkerOpen(true); }} disabled={busy}>
                  <UserPlus className="mr-1 h-3 w-3" /> Add co-worker
                </Button>
              )}
            </div>

            {workers.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                {workers.map((w) => (
                  <span key={w.id} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs">
                    {w.name}
                    <button
                      onClick={() => removeWorker(w.userId)}
                      disabled={busy}
                      className="text-muted-foreground hover:text-red-600"
                      title="Remove co-worker"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Comments / Attachments / Work history */}
      <Tabs defaultValue="comments">
        <TabsList>
          <TabsTrigger value="comments">
            <Mail className="mr-1.5 h-3.5 w-3.5" /> Comments ({comments.length})
          </TabsTrigger>
          <TabsTrigger value="attachments">
            <Paperclip className="mr-1.5 h-3.5 w-3.5" /> Attachments ({data.attachments.length})
          </TabsTrigger>
          <TabsTrigger value="work">
            <History className="mr-1.5 h-3.5 w-3.5" /> Work history ({data.workLogs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="comments">
          <Card>
            <CardContent className="space-y-3 p-4">
              <ScrollArea className="max-h-96">
                <div className="space-y-3 pr-3">
                  {comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
                  {comments.map((c) => (
                    <div key={c.id} className="flex items-start gap-2">
                      <div className={`min-w-0 flex-1 rounded-md border px-3 py-2 text-sm ${c.readByMe ? "bg-background" : "border-primary/50 bg-primary/5"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold">{c.user.name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(c.createdAt).toLocaleString("en-IN")}
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
                      </div>
                      <button
                        onClick={() => toggleCommentRead(c.id, !c.readByMe)}
                        title={c.readByMe ? "Mark as unread" : "Mark as read"}
                        className={`mt-1 rounded p-1 ${c.readByMe ? "text-muted-foreground" : "text-primary"}`}
                      >
                        {c.readByMe ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                      </button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="flex gap-2">
                <Textarea
                  placeholder="Write a comment… (Enter to send)"
                  value={commentText}
                  rows={2}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      postComment();
                    }
                  }}
                />
                <Button size="sm" className="self-end" onClick={postComment} disabled={busy || !commentText.trim()}>
                  <Send className="mr-1 h-3 w-3" /> Send
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attachments">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-sm">
                <span>Attachments ({data.attachments.length})</span>
                <label className="cursor-pointer text-xs font-medium text-primary hover:underline">
                  <Paperclip className="mr-1 inline h-3 w-3" /> Upload
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadAttachment(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {data.attachments.length === 0 && <p className="text-sm text-muted-foreground">No attachments.</p>}
              {data.attachments.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <a
                    href={apiPath(`/api/requests/${request.id}/attachments/${a.id}`)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 truncate text-primary hover:underline"
                  >
                    <Paperclip className="h-3 w-3 shrink-0" />
                    <span className="truncate">{a.name}</span>
                  </a>
                  <span className="shrink-0 text-xs text-muted-foreground">{(a.size / 1024).toFixed(0)} KB</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="work">
          <Card>
            <CardContent className="space-y-1 p-4">
              {data.workLogs.length === 0 && <p className="text-sm text-muted-foreground">No work logged yet.</p>}
              {data.workLogs.map((w) => (
                <div key={w.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{w.poc.name}</span>
                    {w.note && <span className="text-muted-foreground"> — {w.note}</span>}
                    {w.location && (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {w.location}
                        <Badge variant={w.inCampus ? "outline" : "secondary"} className="ml-1 text-[10px]">
                          {w.inCampus ? "In campus" : "Outside campus"}
                        </Badge>
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {w.running && <Badge className="animate-pulse">Running</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {new Date(w.startedAt).toLocaleString("en-IN")}
                      {w.endedAt ? ` → ${new Date(w.endedAt).toLocaleTimeString("en-IN")}` : ""}
                    </span>
                    <span className="text-xs font-semibold">{fmtMinutes(w.minutes)}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Log time dialog — multiple from/to ranges, each with location + in/out campus */}
      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Log time manually</DialogTitle>
            <DialogDescription>
              Add one or more from/to ranges with the location. Mark whether the work was in campus or outside campus.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {logEntries.map((e, i) => (
              <div key={i} className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Range {i + 1}</span>
                  {logEntries.length > 1 && (
                    <button
                      onClick={() => setLogEntries((es) => es.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-red-600"
                      title="Remove range"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">From</Label>
                    <Input
                      type="datetime-local"
                      value={e.from}
                      onChange={(ev) => setLogEntries((es) => es.map((x, j) => (j === i ? { ...x, from: ev.target.value } : x)))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">To</Label>
                    <Input
                      type="datetime-local"
                      value={e.to}
                      onChange={(ev) => setLogEntries((es) => es.map((x, j) => (j === i ? { ...x, to: ev.target.value } : x)))}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Location</Label>
                  <Input
                    placeholder="e.g. Room 204, Site visit"
                    value={e.location}
                    onChange={(ev) => setLogEntries((es) => es.map((x, j) => (j === i ? { ...x, location: ev.target.value } : x)))}
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    checked={e.inCampus}
                    onCheckedChange={(v) => setLogEntries((es) => es.map((x, j) => (j === i ? { ...x, inCampus: v === true } : x)))}
                  />
                  {e.inCampus ? "In campus" : "Outside campus"}
                </label>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setLogEntries((es) => [...es, { from: "", to: "", location: "", inCampus: true }])}>
              <Plus className="mr-1 h-3 w-3" /> Add another range
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitLogEntries} disabled={busy}>
              <Check className="mr-1 h-3 w-3" /> Log time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to POC dialog */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to another POC</DialogTitle>
            <DialogDescription>
              Reassign this request to a different POC by primary role, then name. A reason is required for the tracking log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="move-role">Primary role (SSO)</Label>
              <Select
                value={moveRole || undefined}
                onValueChange={(v) => { setMoveRole(v); setMovePoc(""); }}
              >
                <SelectTrigger id="move-role">
                  <SelectValue placeholder="Any primary role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r} value={r}>{r.replace(/_/g, " ").toLowerCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="move-poc">Person by name</Label>
              <Select value={movePoc || undefined} onValueChange={setMovePoc}>
                <SelectTrigger id="move-poc">
                  <SelectValue placeholder="Select a person" />
                </SelectTrigger>
                <SelectContent>
                  {roleFiltered.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No POCs for this role</div>
                  )}
                  {roleFiltered.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.username})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="move-reason">Reason</Label>
              <Textarea
                id="move-reason"
                placeholder="Why is this being moved?"
                rows={3}
                value={moveReason}
                onChange={(e) => setMoveReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={randomAssign} disabled={busy || otherPocs.length === 0} title="Randomly assign among the eligible POCs">
              <Dices className="mr-1 h-3 w-3" /> Random
            </Button>
            <Button onClick={confirmMove} disabled={busy || !movePoc || !moveReason.trim()}>
              <ArrowRightLeft className="mr-1 h-3 w-3" /> Move request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add co-worker dialog */}
      <Dialog open={workerOpen} onOpenChange={setWorkerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a co-worker</DialogTitle>
            <DialogDescription>
              Add another person to work on this request alongside you. They can log their own hours (no transfer needed).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="worker-role">Primary role (SSO)</Label>
              <Select
                value={workerRole || undefined}
                onValueChange={(v) => { setWorkerRole(v); setWorkerUser(""); }}
              >
                <SelectTrigger id="worker-role">
                  <SelectValue placeholder="Select a primary role" />
                </SelectTrigger>
                <SelectContent>
                  {workerRoles.map((r) => (
                    <SelectItem key={r} value={r}>{r.replace(/_/g, " ").toLowerCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="worker-user">Person by name</Label>
              <Select value={workerUser || undefined} onValueChange={setWorkerUser}>
                <SelectTrigger id="worker-user">
                  <SelectValue placeholder={workerRole ? "Select a person" : "Choose a primary role first"} />
                </SelectTrigger>
                <SelectContent>
                  {workerFiltered.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      {workerRole ? "No eligible people for this role" : "Choose a primary role first"}
                    </div>
                  )}
                  {workerFiltered.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.username})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWorkerOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={addWorker} disabled={busy || !workerUser}>
              <UserPlus className="mr-1 h-3 w-3" /> Add co-worker
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
