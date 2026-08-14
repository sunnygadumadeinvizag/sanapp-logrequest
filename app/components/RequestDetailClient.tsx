"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath } from "iipe-common-ui";
import { STATUS_LABELS, PRIORITY_LABELS, fmtMinutes } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Play, Square, Clock, Send, Paperclip, X, Check, Mail, MailOpen } from "lucide-react";

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
  workLogs: { id: string; minutes: number; running: boolean; note: string | null; startedAt: string; endedAt: string | null; poc: { name: string } }[];
};

export function RequestDetailClient({
  data,
  me,
  role,
  pocOptions,
}: {
  data: DetailData;
  me: { username: string; name: string };
  role: "ADMIN" | "POC" | "USER";
  pocOptions: { id: string; name: string; username: string }[];
}) {
  const router = useRouter();
  const { request } = data;
  const isPoc = role === "POC" || role === "ADMIN";
  const isAssignee = request.assignedPoc?.username === me.username;

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

  async function work(action: "start" | "stop" | "log") {
    setBusy(true);
    try {
      const res = await fetch(apiPath(`/api/requests/${request.id}/work`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          note: note || undefined,
          minutes: action === "log" ? Number(prompt("Minutes worked:", "15")) : undefined,
        }),
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
      } else {
        flash(true, `Logged ${fmtMinutes(d.minutes ?? 0)}`);
      }
      setNote("");
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

  async function moveTo(pocId: string) {
    if (!pocId) return;
    const reason = prompt("Reason for moving this request:")?.trim();
    if (reason === undefined) return;
    setBusy(true);
    try {
      const res = await fetch(apiPath(`/api/requests/${request.id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ moveToPocId: pocId, moveReason: reason || undefined }),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(false, d?.error ?? "Move failed");
        return;
      }
      flash(true, "Request moved");
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

      {isPoc && (
        <div className="rounded-lg border bg-muted/20 p-3">
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
            {!running && isAssignee && (
              <Button size="sm" variant="outline" onClick={() => work("log")} disabled={busy}>
                <Clock className="mr-1 h-3 w-3" /> Log time manually
              </Button>
            )}
            <Input
              placeholder="Note (optional)"
              className="h-8 w-48"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
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
                <select
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                  defaultValue=""
                  onChange={(e) => moveTo(e.target.value)}
                >
                  <option value="" disabled>Move to another POC…</option>
                  {pocOptions
                    .filter((p) => p.username !== me.username)
                    .map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
              </>
            )}
            {request.status === "RESOLVED" && (isPoc || isAssignee) && (
              <Button size="sm" onClick={() => changeStatus("CLOSED")} disabled={busy}>
                Confirm & close
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Comments */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Comments ({comments.length})</h3>
        </div>
        <div className="max-h-96 space-y-3 overflow-auto p-4">
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
        <div className="flex gap-2 border-t p-3">
          <Input
            placeholder="Write a comment…"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                postComment();
              }
            }}
          />
          <Button size="sm" onClick={postComment} disabled={busy || !commentText.trim()}>
            <Send className="mr-1 h-3 w-3" /> Send
          </Button>
        </div>
      </div>

      {/* Attachments */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Attachments ({data.attachments.length})</h3>
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
        </div>
        <div className="space-y-1 p-3">
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
        </div>
      </div>

      {/* Work history */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Work history</h3>
        </div>
        <div className="space-y-1 p-3">
          {data.workLogs.length === 0 && <p className="text-sm text-muted-foreground">No work logged yet.</p>}
          {data.workLogs.map((w) => (
            <div key={w.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <div>
                <span className="font-medium">{w.poc.name}</span>
                {w.note && <span className="text-muted-foreground"> — {w.note}</span>}
              </div>
              <div className="flex items-center gap-3">
                {w.running && <Badge className="animate-pulse">Running</Badge>}
                <span className="text-xs text-muted-foreground">
                  {new Date(w.startedAt).toLocaleString("en-IN")}
                  {w.endedAt ? ` → ${new Date(w.endedAt).toLocaleTimeString("en-IN")}` : ""}
                </span>
                <span className="text-xs font-semibold">{fmtMinutes(w.minutes)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
