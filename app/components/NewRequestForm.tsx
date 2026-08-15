"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath } from "sanapp-common-ui";
import { PRIORITY_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, X } from "lucide-react";

type Cat = {
  id: string;
  name: string;
  description: string | null;
  eligible: boolean;
  requireLocation: boolean;
  requireContactTime: boolean;
  requireContactPhone: boolean;
  directAssign: boolean;
  subCategories: {
    id: string;
    name: string;
    requireLocation: boolean;
    requireContactTime: boolean;
    requireContactPhone: boolean;
    directAssign: boolean;
  }[];
};

export function NewRequestForm({
  categories,
  me,
  initialCategory,
  ssoUsers,
}: {
  categories: Cat[];
  me: { username: string; name: string; role: string };
  initialCategory: string;
  ssoUsers: { username: string; name: string; primaryRole: string }[];
}) {
  const router = useRouter();
  const eligibleCats = useMemo(() => categories.filter((c) => c.eligible), [categories]);
  const [categoryId, setCategoryId] = useState(initialCategory || eligibleCats[0]?.id || "");
  const [subCategoryId, setSubCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [forUsername, setForUsername] = useState("");
  const [againstUsername, setAgainstUsername] = useState("");
  const [location, setLocation] = useState("");
  const [contactTime, setContactTime] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cat = categories.find((c) => c.id === categoryId);
  const sub = cat?.subCategories.find((s) => s.id === subCategoryId);
  // The selected sub-category can override the category's required fields.
  const needLocation = sub ? sub.requireLocation : (cat?.requireLocation ?? false);
  const needContactTime = sub ? sub.requireContactTime : (cat?.requireContactTime ?? false);
  const needContactPhone = sub ? sub.requireContactPhone : (cat?.requireContactPhone ?? false);
  // Direct-assign: raised against a specific person (sub-category overrides).
  const directAssign = sub ? sub.directAssign : (cat?.directAssign ?? false);
  const isPoc = me.role === "POC" || me.role === "ADMIN";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !description.trim() || !categoryId) {
      setError("Title, description and category are required.");
      return;
    }
    if (needLocation && !location.trim()) {
      setError("Location is required for this category.");
      return;
    }
    if (needContactTime && !contactTime.trim()) {
      setError("Preferred time to contact is required for this category.");
      return;
    }
    if (needContactPhone && !contactPhone.trim()) {
      setError("Phone number is required for this category.");
      return;
    }
    if (directAssign && !againstUsername) {
      setError("Choose the person this request is raised against.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(apiPath("/api/requests"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          categoryId,
          subCategoryId: subCategoryId || null,
          priority,
          location: location.trim() || undefined,
          contactTime: contactTime.trim() || undefined,
          contactPhone: contactPhone.trim() || undefined,
          forUsername: forUsername || undefined,
          againstUsername: againstUsername || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data?.error === "role_not_allowed_for_category"
            ? "This category is restricted for your role."
            : data?.error ?? "Could not raise the request."
        );
        return;
      }
      const id = data.request.id;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        await fetch(apiPath(`/api/requests/${id}/attachments`), { method: "POST", body: fd });
      }
      router.push(`/requests/${id}`);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cat">Category *</Label>
          <select
            id="cat"
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setSubCategoryId("");
              setAgainstUsername("");
            }}
          >
            {eligibleCats.length === 0 && <option value="">No categories available for your role</option>}
            {eligibleCats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {cat?.description && <p className="text-xs text-muted-foreground">{cat.description}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sub">Sub-category</Label>
          <select
            id="sub"
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={subCategoryId}
            onChange={(e) => setSubCategoryId(e.target.value)}
          >
            <option value="">— none —</option>
            {(cat?.subCategories ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="priority">Priority</Label>
          <select
            id="priority"
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {isPoc && (
          <div className="space-y-1.5">
            <Label htmlFor="for">Raise on behalf of (POC)</Label>
            <select
              id="for"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={forUsername}
              onChange={(e) => setForUsername(e.target.value)}
            >
              <option value="">— myself —</option>
              {ssoUsers.map((u) => (
                <option key={u.username} value={u.username}>{u.name} ({u.username})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {directAssign && (
        <div className="space-y-1.5">
          <Label htmlFor="against">Raised against user *</Label>
          <select
            id="against"
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={againstUsername}
            onChange={(e) => setAgainstUsername(e.target.value)}
          >
            <option value="">— select the person —</option>
            {ssoUsers.map((u) => (
              <option key={u.username} value={u.username}>{u.name} ({u.username})</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            This request will be assigned directly to the selected person and handled like a normal request.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="title">Title *</Label>
        <Input id="title" placeholder="Brief summary of the issue" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="desc">Description *</Label>
        <textarea
          id="desc"
          rows={5}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="Describe the issue in detail — location, when it started, what you have tried…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {(needLocation || needContactTime || needContactPhone) && (
        <div className="rounded-lg border border-dashed p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            Contact details{cat ? ` — required by the ${sub ? "sub-category" : "category"} for this request` : ""}
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {needLocation && (
              <div className="space-y-1.5">
                <Label htmlFor="location">Location *</Label>
                <Input
                  id="location"
                  placeholder="Building / room / campus area"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            )}
            {needContactTime && (
              <div className="space-y-1.5">
                <Label htmlFor="contactTime">Available to contact *</Label>
                <Input
                  id="contactTime"
                  placeholder="e.g. 10:00–12:00, weekdays"
                  value={contactTime}
                  onChange={(e) => setContactTime(e.target.value)}
                />
              </div>
            )}
            {needContactPhone && (
              <div className="space-y-1.5">
                <Label htmlFor="contactPhone">Phone number *</Label>
                <Input
                  id="contactPhone"
                  type="tel"
                  placeholder="Contact number for follow-up"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="file">Attachment (image / PDF, max 1 MB)</Label>
        {file ? (
          <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span className="flex items-center gap-2 truncate">
              <Upload className="h-4 w-4 text-muted-foreground" />
              {file.name} ({(file.size / 1024).toFixed(0)} KB)
            </span>
            <button type="button" onClick={() => setFile(null)} aria-label="Remove file">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        ) : (
          <Input
            id="file"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={busy || eligibleCats.length === 0}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Raise request
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}
